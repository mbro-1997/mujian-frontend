const {
  getProjectById,
  updateProject,
  addPropToProject,
  removePropFromProject,
  updateProjectItemQuantity,
} = require("../../services/project.service");
const { createOrderFromProject } = require("../../services/order.service");

function cloneProject(project) {
  return project ? JSON.parse(JSON.stringify(project)) : null;
}

function rebuildProject(project) {
  if (!project) return null;
  const props = (project.props || []).map((item) => ({
    ...item,
    quantity: Number(item.quantity || 1),
    orderable: item.orderable != null
      ? item.orderable
      : !!item.canRent && Number(item.quantity || 1) <= Number(item.availableStock || 0),
  }));
  const unavailableCount = project.status === "editing"
    ? props.filter((item) => !item.orderable).length
    : 0;
  return {
    ...project,
    props,
    propIds: props.map((item) => Number(item.id)),
    unavailableCount,
    canSubmit: project.status === "editing" && props.length > 0 && unavailableCount === 0,
  };
}

function normalizeRentalDays(value) {
  const days = parseInt(value, 10);
  if (!Number.isFinite(days) || days < 1) return 0;
  return Math.min(days, 365);
}

function calcRentalDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function getTodayDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildSupplierGroups(project, rentalDays = 0) {
  const days = normalizeRentalDays(rentalDays);
  const groups = {};
  (project?.props || []).forEach((item) => {
    const key = item.supplierUserId || "unknown";
    if (!groups[key]) {
      groups[key] = {
        supplierUserId: key,
        supplierName: item.supplierName || (item.supplierUserId ? `工厂 ${item.supplierUserId}` : "未绑定工厂"),
        propCount: 0,
        dailyRent: 0,
        price: 0,
        deposit: 0,
        total: 0,
      };
    }
    const quantity = Number(item.quantity || 1);
    groups[key].propCount += quantity;
    groups[key].dailyRent += Number(item.price || 0) * quantity;
    groups[key].deposit += Number(item.deposit || 0) * quantity;
  });
  return Object.keys(groups).map((key) => {
    const group = groups[key];
    group.price = group.dailyRent * days;
    group.total = group.price + group.deposit;
    return group;
  });
}

function buildPayInfo(project, rentalDays = 0) {
  const props = project?.props || [];
  const days = normalizeRentalDays(rentalDays);
  const dailyRent = props.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const price = dailyRent * days;
  const deposit = props.reduce((sum, item) => sum + Number(item.deposit || 0) * Number(item.quantity || 1), 0);
  const supplierGroups = buildSupplierGroups(project, days);
  return {
    dailyRent,
    rentalDays: days,
    price,
    deposit,
    total: price + deposit,
    supplierGroups,
    supplierCount: supplierGroups.length,
  };
}

Page({
  data: {
    projectId: null,
    currentProject: null,
    originalProject: null,
    today: getTodayDateString(),
    showPayModal: false,
    rentalStartDate: "",
    rentalEndDate: "",
    rentalDays: "",
    contactAddress: "",
    useScene: "",
    specialRemark: "",
    payInfo: {
      dailyRent: 0,
      rentalDays: 0,
      price: 0,
      deposit: 0,
      total: 0,
      supplierGroups: [],
      supplierCount: 0,
    },
  },

  async onLoad(options) {
    this.setData({ projectId: Number(options.id || 0) });
    await this.loadProject();
  },

  async loadProject() {
    if (!this.data.projectId) {
      wx.showToast({ title: "方案不存在", icon: "none" });
      return;
    }
    try {
      const project = rebuildProject(await getProjectById(this.data.projectId));
      this.setData({
        currentProject: cloneProject(project),
        originalProject: cloneProject(project),
      });
    } catch (err) {
      wx.showToast({ title: err.message || "加载方案失败", icon: "none" });
      setTimeout(() => wx.navigateBack(), 600);
    }
  },

  updateProjectName(e) {
    this.setData({ "currentProject.name": e.detail.value });
  },

  updateProjectDescription(e) {
    this.setData({ "currentProject.description": e.detail.value });
  },

  removeProjectProp(e) {
    if (!this.data.currentProject || this.data.currentProject.status !== "editing") {
      wx.showToast({ title: "已下单方案不可调整", icon: "none" });
      return;
    }
    const propId = Number(e.currentTarget.dataset.propId);
    this.setData({
      currentProject: rebuildProject({
        ...this.data.currentProject,
        props: (this.data.currentProject.props || []).filter((item) => Number(item.id) !== propId),
      }),
    });
  },

  adjustPropQuantity(e) {
    if (!this.data.currentProject || this.data.currentProject.status !== "editing") {
      wx.showToast({ title: "已下单方案不支持调整", icon: "none" });
      return;
    }
    const propId = Number(e.currentTarget.dataset.propId);
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const props = (this.data.currentProject.props || []).map((item) => {
      if (Number(item.id) !== propId) return item;
      const current = Number(item.quantity || 1);
      const max = Number(item.availableStock || current);
      const quantity = Math.max(1, Math.min(max, current + delta));
      return {
        ...item,
        quantity,
        orderable: !!item.canRent && quantity <= max,
      };
    });
    this.setData({
      currentProject: rebuildProject({
        ...this.data.currentProject,
        props,
      }),
    });
  },

  async syncCurrentProject(showToast = true) {
    const { currentProject, originalProject } = this.data;
    if (!currentProject) return null;
    if (currentProject.status !== "editing") {
      wx.showToast({ title: "已下单方案不可编辑", icon: "none" });
      return currentProject;
    }

    try {
      let next = await updateProject(currentProject);
      const originalIds = new Set((originalProject?.props || []).map((item) => Number(item.id)));
      const currentIds = new Set((currentProject.props || []).map((item) => Number(item.id)));

      for (const item of originalProject?.props || []) {
        if (!currentIds.has(Number(item.id))) {
          next = await removePropFromProject(next.id, item.id);
        }
      }

      for (const item of currentProject.props || []) {
        if (!originalIds.has(Number(item.id))) {
          next = await addPropToProject(next.id, item.id, item.quantity);
          continue;
        }
        const original = (originalProject?.props || []).find((prop) => Number(prop.id) === Number(item.id));
        if (original && Number(original.quantity || 1) !== Number(item.quantity || 1)) {
          next = await updateProjectItemQuantity(next.id, item.id, item.quantity);
        }
      }

      next = rebuildProject(await getProjectById(next.id));
      this.setData({
        currentProject: cloneProject(next),
        originalProject: cloneProject(next),
      });
      if (showToast) {
        wx.showToast({ title: "方案已保存", icon: "success" });
      }
      return next;
    } catch (err) {
      wx.showToast({ title: err.message || "保存失败", icon: "none" });
      return null;
    }
  },

  async saveProject() {
    const saved = await this.syncCurrentProject(true);
    if (saved) {
      setTimeout(() => wx.navigateBack(), 500);
    }
  },

  async submitProjectOrder() {
    let project = this.data.currentProject;
    if (!project) return;
    if (project.status !== "editing") {
      wx.showToast({ title: "该方案已下单", icon: "none" });
      return;
    }
    project = await this.syncCurrentProject(false);
    if (!project) return;
    if (!project.props.length) {
      wx.showToast({ title: "方案道具为空", icon: "none" });
      return;
    }
    if (project.unavailableCount > 0) {
      wx.showToast({ title: "存在不可下单道具，请先移除", icon: "none" });
      return;
    }
    this.setData({
      showPayModal: true,
      rentalStartDate: "",
      rentalEndDate: "",
      rentalDays: "",
      contactAddress: "",
      useScene: "",
      specialRemark: "",
      payInfo: buildPayInfo(project, 0),
    });
  },

  closePayModal() {
    this.setData({ showPayModal: false });
  },

  updateRentalStartDate(e) {
    const rentalStartDate = e.detail.value || "";
    if (rentalStartDate && rentalStartDate < this.data.today) {
      wx.showToast({ title: "开始日期不能早于今天", icon: "none" });
      return;
    }
    const rentalEndDate = this.data.rentalEndDate && this.data.rentalEndDate < rentalStartDate ? "" : this.data.rentalEndDate;
    const rentalDays = calcRentalDays(rentalStartDate, rentalEndDate);
    this.setData({
      rentalStartDate,
      rentalEndDate,
      rentalDays,
      payInfo: buildPayInfo(this.data.currentProject, rentalDays),
    });
  },

  updateRentalEndDate(e) {
    const rentalEndDate = e.detail.value || "";
    if (this.data.rentalStartDate && rentalEndDate && rentalEndDate < this.data.rentalStartDate) {
      wx.showToast({ title: "结束日期不能早于开始日期", icon: "none" });
      return;
    }
    const rentalDays = calcRentalDays(this.data.rentalStartDate, rentalEndDate);
    this.setData({
      rentalEndDate,
      rentalDays,
      payInfo: buildPayInfo(this.data.currentProject, rentalDays),
    });
  },

  updateContactAddress(e) {
    this.setData({ contactAddress: e.detail.value || "" });
  },

  updateUseScene(e) {
    this.setData({ useScene: e.detail.value || "" });
  },

  updateSpecialRemark(e) {
    this.setData({ specialRemark: e.detail.value || "" });
  },

  async simulatePay() {
    const project = this.data.currentProject;
    if (!project) return;
    const contactAddress = (this.data.contactAddress || "").trim();
    const useScene = (this.data.useScene || "").trim();
    const specialRemark = (this.data.specialRemark || "").trim();
    const rentalDays = calcRentalDays(this.data.rentalStartDate, this.data.rentalEndDate);
    if (!this.data.rentalStartDate || !this.data.rentalEndDate) {
      wx.showToast({ title: "请选择租赁起止日期", icon: "none" });
      return;
    }
    if (this.data.rentalStartDate < this.data.today) {
      wx.showToast({ title: "开始日期不能早于今天", icon: "none" });
      return;
    }
    if (!rentalDays) {
      wx.showToast({ title: "请选择有效租赁日期", icon: "none" });
      return;
    }
    if (!contactAddress) {
      wx.showToast({ title: "请填写地址", icon: "none" });
      return;
    }
    if (!useScene) {
      wx.showToast({ title: "请填写使用场景", icon: "none" });
      return;
    }
    const payInfo = buildPayInfo(project, rentalDays);
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "微信支付确认",
        content: `本次将支付租金 ¥${payInfo.price} + 押金 ¥${payInfo.deposit}，合计 ¥${payInfo.total}。支付成功后将按工厂拆分为独立订单，分别等待工厂确认接单。`,
        cancelText: "取消",
        confirmText: "确认支付",
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    try {
      const payResult = await createOrderFromProject(project.id, {
        rentalStartDate: this.data.rentalStartDate,
        rentalEndDate: this.data.rentalEndDate,
        rentalDays,
        contactAddress,
        useScene,
        specialRemark,
      });
      const splitOrderCount = payResult.splitOrderCount || payInfo.supplierCount || 1;
      this.setData({ showPayModal: false });
      await this.loadProject();
      wx.showModal({
        title: "支付成功",
        content: `已一次支付 ¥${payInfo.total}，其中租金 ¥${payInfo.price}、押金 ¥${payInfo.deposit}。系统已按 ${splitOrderCount} 家工厂拆分为 ${splitOrderCount} 个独立订单，后续接单、拒单、出库、归还、评价和仲裁均按独立订单处理；如某个工厂拒单，该订单金额将按原支付路径退款。`,
        showCancel: false,
        confirmText: "我知道了",
      });
    } catch (err) {
      wx.showToast({ title: err.message || "下单失败", icon: "none" });
    }
  },

  cancelEdit() {
    wx.navigateBack();
  },
});
