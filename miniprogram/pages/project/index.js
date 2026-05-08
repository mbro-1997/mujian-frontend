const {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  addPropToProject,
  removePropFromProject,
} = require("../../services/project.service");
const {
  listOrders,
  createOrderFromProject,
  submitOrderReview,
  expireTimedOutOrders,
  confirmOrderByFactory,
  rejectOrderByFactory,
  scanOutboundProp,
  scanReturnProp,
} = require("../../services/order.service");
const { fetchUser, getSelectedRole } = require("../../services/user.service");
const { getDisputes, resolveDispute } = require("../../services/admin.service");
const { ORDER_STATUS } = require("../../constants/status");

const DISPUTE_STATUS_TEXT = {
  pending: "待处理",
  resolved: "已裁定",
};

const SUPPLIER_STATUS_TABS = [
  { label: "全部", value: "all" },
  { label: "待确认", value: ORDER_STATUS.PENDING_FACTORY_CONFIRM },
  { label: "租赁中", value: ORDER_STATUS.RENTING },
  { label: "待归还", value: "wait_return" },
  { label: "待评价", value: ORDER_STATUS.WAIT_REVIEW },
  { label: "已完成", value: ORDER_STATUS.COMPLETED },
  { label: "已驳回", value: ORDER_STATUS.CANCELLED_MANUAL },
];

const SUPPLIER_DATE_RANGE_OPTIONS = [
  { label: "全部时间", value: "all" },
  { label: "今日", value: "today" },
  { label: "近 7 天", value: "7d" },
  { label: "近 30 天", value: "30d" },
];

const SUPPLIER_SORT_OPTIONS = [
  { label: "最新订单优先", value: "latest" },
  { label: "待处理优先", value: "pending_first" },
];

function withDisputeStatusText(list = []) {
  return list.map((item) => ({
    ...item,
    statusText: item.statusText || DISPUTE_STATUS_TEXT[item.status] || item.status,
  }));
}

function parseOrderDate(order) {
  const value = order.createdAt || order.date;
  if (!value) return null;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (/^\d+$/.test(String(value))) {
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(value).replace(/-/g, "/"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function supplierOrderStatusClass(status) {
  if (status === ORDER_STATUS.PENDING_FACTORY_CONFIRM) return "status-pending-confirm";
  if (status === ORDER_STATUS.RENTING || status === ORDER_STATUS.WAIT_PICKUP) return "status-renting";
  if (status === "wait_return" || status === ORDER_STATUS.WAIT_REVIEW) return "status-return";
  if (status === ORDER_STATUS.COMPLETED) return "status-completed";
  if (status === ORDER_STATUS.CANCELLED_MANUAL || status === ORDER_STATUS.CANCELLED_TIMEOUT) return "status-rejected";
  return "status-default";
}

function normalizeSupplierListOrder(order) {
  const isReturnStage = order.status === ORDER_STATUS.WAIT_REVIEW
    || (order.status === ORDER_STATUS.RENTING && Number(order.returnScannedCount || 0) > 0);
  return {
    ...order,
    supplierStatusClass: supplierOrderStatusClass(isReturnStage ? "wait_return" : order.status),
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

function buildPayInfo(project, rentalDays = 0) {
  const props = project.props || [];
  const days = normalizeRentalDays(rentalDays);
  const dailyRent = props.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const price = dailyRent * days;
  const deposit = props.reduce((sum, item) => sum + Number(item.deposit || 0), 0);
  return { dailyRent, rentalDays: days, price, deposit, total: price + deposit };
}

function cloneProject(project) {
  return project ? JSON.parse(JSON.stringify(project)) : null;
}

function rebuildDraftProject(project) {
  if (!project) return null;
  const props = (project.props || []).map((item) => ({
    ...item,
    orderable: item.orderable != null ? item.orderable : item.status === "idle",
  }));
  const unavailableCount = props.filter((item) => !item.orderable).length;
  return {
    ...project,
    props,
    propIds: props.map((item) => Number(item.id)),
    unavailableCount,
    canSubmit: project.status === "editing" && props.length > 0 && unavailableCount === 0,
  };
}

Page({
  supplierSearchTimer: null,
  skipProjectRefreshOnReturn: false,
  projectScrollTop: 0,

  data: {
    selectedRole: "demander",
    isDemander: true,
    isSupplier: false,
    isAdmin: false,
    projects: [],
    orders: [],
    supplierAllOrders: [],
    supplierOrderList: [],
    supplierKeyword: "",
    supplierActiveStatus: "all",
    supplierDateRange: "all",
    supplierSortType: "latest",
    supplierStatusTabs: SUPPLIER_STATUS_TABS,
    supplierDateRangeOptions: SUPPLIER_DATE_RANGE_OPTIONS,
    supplierSortOptions: SUPPLIER_SORT_OPTIONS,
    supplierDateRangeIndex: 0,
    supplierSortIndex: 0,
    supplierDateRangeText: SUPPLIER_DATE_RANGE_OPTIONS[0].label,
    supplierSortText: SUPPLIER_SORT_OPTIONS[0].label,
    supplierOrderPage: 1,
    supplierOrderPageSize: 10,
    supplierOrderHasMore: true,
    supplierOrderLoading: false,
    supplierOrderTotal: 0,
    supplierOrderLoadError: false,
    previewProjects: [],
    previewOrders: [],
    disputes: [],
    showAllProjects: false,
    showAllOrders: false,
    showProjectDetail: false,
    currentProject: null,
    originalProject: null,
    showCreateProjectModal: false,
    createProjectName: "",
    today: getTodayDateString(),
    showPayModal: false,
    pendingProjectId: null,
    rentalStartDate: "",
    rentalEndDate: "",
    rentalDays: "",
    contactAddress: "",
    useScene: "",
    specialRemark: "",
    payInfo: { dailyRent: 0, rentalDays: 0, price: 0, deposit: 0, total: 0 },
    showOrderDetail: false,
    currentOrder: null,
    showReviewModal: false,
    reviewOrderId: "",
    reviewRole: "demander",
    reviewPropScore: 5,
    reviewCounterpartyScore: 5,
    reviewContent: "",
    showSupplierScanModal: false,
    supplierScanMode: "outbound",
    supplierCurrentOrder: null,
    showRejectModal: false,
    rejectOrderId: null,
    rejectReason: "",
  },

  noop() {},

  async onShow() {
    if (this.skipProjectRefreshOnReturn) {
      this.skipProjectRefreshOnReturn = false;
      if (this.projectScrollTop) {
        setTimeout(() => wx.pageScrollTo({ scrollTop: this.projectScrollTop, duration: 0 }), 0);
      }
      if (typeof this.getTabBar === "function" && this.getTabBar()) {
        const selected = this.data.isAdmin ? 1 : this.data.isSupplier ? 0 : 1;
        this.getTabBar().setData({ selected });
      }
      return;
    }
    const currentUser = await fetchUser().catch(() => null);
    const selectedRole = (currentUser && currentUser.roleCode) || getSelectedRole() || "";
    const isAdmin = selectedRole === "admin";
    const isDemander = selectedRole === "demander";
    const isSupplier = selectedRole === "supplier";

    this.setData({ selectedRole, isAdmin, isDemander, isSupplier });
    await expireTimedOutOrders();

    if (isAdmin) {
      wx.setNavigationBarTitle({ title: "纠纷仲裁" });
      await this.loadDisputes();
    } else if (isSupplier) {
      wx.setNavigationBarTitle({ title: "订单" });
      await this.loadSupplierOrders();
    } else {
      wx.setNavigationBarTitle({ title: "项目" });
      if (isDemander) {
        await this.loadData();
      } else {
        this.setData({ projects: [], orders: [], previewProjects: [], previewOrders: [] });
      }
    }

    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      const selected = isAdmin ? 1 : isSupplier ? 0 : 1;
      this.getTabBar().setData({ selected });
    }
  },

  onReachBottom() {
    if (this.data.isSupplier) {
      this.loadSupplierOrderPage();
    }
  },

  onPageScroll(e) {
    this.projectScrollTop = e.scrollTop || 0;
  },

  async onPullDownRefresh() {
    if (this.data.isSupplier) {
      await this.loadSupplierOrders();
    } else if (this.data.isDemander) {
      await this.loadData();
    } else if (this.data.isAdmin) {
      await this.loadDisputes();
    }
    wx.stopPullDownRefresh();
  },

  async loadData() {
    try {
      const [projects, orders] = await Promise.all([listProjects(), listOrders()]);
      this.setData({
        projects,
        orders,
        previewProjects: this.data.showAllProjects ? projects : projects.slice(0, 2),
        previewOrders: this.data.showAllOrders ? orders : orders.slice(0, 2),
      });
    } catch (err) {
      wx.showToast({ title: err.message || "加载项目失败", icon: "none" });
    }
  },

  async loadSupplierOrders() {
    this.setData({
      supplierOrderList: [],
      supplierOrderPage: 1,
      supplierOrderHasMore: true,
      supplierOrderTotal: 0,
      supplierOrderLoadError: false,
    });
    await this.loadSupplierOrderPage(true);
  },

  async loadSupplierOrderPage(resetSource = false) {
    if (this.data.supplierOrderLoading || (!this.data.supplierOrderHasMore && !resetSource)) return;
    this.setData({ supplierOrderLoading: true, supplierOrderLoadError: false });
    try {
      const supplierAllOrders = resetSource ? (await listOrders()).map(normalizeSupplierListOrder) : this.data.supplierAllOrders;
      const filtered = this.sortSupplierOrders(this.filterSupplierOrders(supplierAllOrders));
      const start = (this.data.supplierOrderPage - 1) * this.data.supplierOrderPageSize;
      const pageList = filtered.slice(start, start + this.data.supplierOrderPageSize);
      const supplierOrderList = this.data.supplierOrderPage === 1 ? pageList : this.data.supplierOrderList.concat(pageList);
      this.setData({
        orders: supplierAllOrders,
        supplierAllOrders,
        supplierOrderList,
        supplierOrderTotal: filtered.length,
        supplierOrderPage: this.data.supplierOrderPage + 1,
        supplierOrderHasMore: start + pageList.length < filtered.length,
      });
    } catch (err) {
      this.setData({ supplierOrderLoadError: true });
      wx.showToast({ title: err.message || "加载订单失败", icon: "none" });
    } finally {
      this.setData({ supplierOrderLoading: false });
    }
  },

  filterSupplierOrders(orders) {
    const keyword = (this.data.supplierKeyword || "").trim().toLowerCase();
    const now = new Date();
    return orders.filter((order) => {
      const statusMatched = this.matchSupplierStatus(order);
      const keywordMatched = !keyword
        || String(order.id).includes(keyword)
        || String(order.orderNo || "").toLowerCase().includes(keyword)
        || String(order.demanderName || "").toLowerCase().includes(keyword)
        || String(order.demanderPhone || "").toLowerCase().includes(keyword);
      const date = parseOrderDate(order);
      const dateMatched = this.matchSupplierDateRange(date, now);
      return statusMatched && keywordMatched && dateMatched;
    });
  },

  matchSupplierStatus(order) {
    const active = this.data.supplierActiveStatus;
    if (active === "all") return true;
    if (active === "wait_return") {
      const total = Number(order.propCount || 0);
      const outboundCount = Number(order.outboundScannedCount || 0);
      const returnCount = Number(order.returnScannedCount || 0);
      return order.status === ORDER_STATUS.RENTING
        && total > 0
        && outboundCount >= total
        && returnCount < total;
    }
    return order.status === active;
  },

  matchSupplierDateRange(date, now) {
    if (this.data.supplierDateRange === "all") return true;
    if (!date) return false;
    if (this.data.supplierDateRange === "today") return isSameDate(date, now);
    const days = this.data.supplierDateRange === "7d" ? 7 : 30;
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    return date >= start && date <= now;
  },

  sortSupplierOrders(orders) {
    const pendingWeight = (order) => {
      if (order.canFactoryConfirm || order.canFactoryReject) return 0;
      if (order.canScanOutbound || order.canScanReturn || order.canReview) return 1;
      return 2;
    };
    return orders.slice().sort((a, b) => {
      if (this.data.supplierSortType === "pending_first") {
        const diff = pendingWeight(a) - pendingWeight(b);
        if (diff !== 0) return diff;
      }
      const bDate = parseOrderDate(b);
      const aDate = parseOrderDate(a);
      const bValue = bDate ? bDate.getTime() : Number(b.id) || 0;
      const aValue = aDate ? aDate.getTime() : Number(a.id) || 0;
      return bValue - aValue;
    });
  },

  async loadDisputes() {
    try {
      const disputes = await getDisputes();
      this.setData({ disputes: withDisputeStatusText(disputes) });
    } catch (err) {
      wx.showToast({ title: err.message || "加载纠纷失败", icon: "none" });
    }
  },

  async resolveAdminDispute(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const next = await resolveDispute(id, "管理员裁定：双方各承担 50% 责任（演示）");
      this.setData({ disputes: withDisputeStatusText(next) });
      wx.showToast({ title: "裁定完成", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "裁定失败", icon: "none" });
    }
  },

  async viewProjectDetail(e) {
    if (!this.data.isDemander) return;
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    wx.navigateTo({ url: `/pages/project-detail/index?id=${id}` });
  },

  closeProjectDetail() {
    this.setData({
      showProjectDetail: false,
      currentProject: null,
      originalProject: null,
    });
  },

  openCreateProjectModal() {
    this.setData({
      showCreateProjectModal: true,
      createProjectName: "",
    });
  },

  closeCreateProjectModal() {
    this.setData({
      showCreateProjectModal: false,
      createProjectName: "",
    });
  },

  updateCreateProjectName(e) {
    this.setData({ createProjectName: e.detail.value || "" });
  },

  async confirmCreateProject() {
    const name = (this.data.createProjectName || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入方案名称", icon: "none" });
      return;
    }

    try {
      const project = rebuildDraftProject(await createProject({ name }));
      await this.loadData();
      this.setData({
        showCreateProjectModal: false,
        createProjectName: "",
      });
      wx.navigateTo({ url: `/pages/project-detail/index?id=${project.id}` });
      wx.showToast({ title: "方案已创建", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "创建方案失败", icon: "none" });
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
    const nextProject = rebuildDraftProject({
      ...this.data.currentProject,
      props: (this.data.currentProject.props || []).filter((item) => Number(item.id) !== propId),
    });
    this.setData({ currentProject: nextProject });
  },

  async syncCurrentProject(showToast = true) {
    const { currentProject, originalProject } = this.data;
    if (!currentProject) return null;
    if (currentProject.status !== "editing") {
      wx.showToast({ title: "已下单方案不可编辑", icon: "none" });
      return null;
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
          next = await addPropToProject(next.id, item.id);
        }
      }

      next = rebuildDraftProject(await getProjectById(next.id));
      this.setData({
        currentProject: cloneProject(next),
        originalProject: cloneProject(next),
      });
      await this.loadData();
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
    await this.syncCurrentProject(true);
  },

  async submitProjectOrder(e) {
    const projectId = Number(
      e.currentTarget.dataset.id || (this.data.currentProject && this.data.currentProject.id)
    );

    let project = null;
    if (this.data.currentProject && Number(this.data.currentProject.id) === projectId) {
      project = await this.syncCurrentProject(false);
    } else {
      project = await getProjectById(projectId).catch(() => null);
    }

    if (!project) {
      wx.showToast({ title: "方案不存在", icon: "none" });
      return;
    }

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
      pendingProjectId: project.id,
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
    this.setData({ showPayModal: false, pendingProjectId: null });
  },

  updateRentalStartDate(e) {
    const rentalStartDate = e.detail.value || "";
    if (rentalStartDate && rentalStartDate < this.data.today) {
      wx.showToast({ title: "开始日期不能早于今天", icon: "none" });
      return;
    }
    const rentalEndDate = this.data.rentalEndDate && this.data.rentalEndDate < rentalStartDate ? "" : this.data.rentalEndDate;
    const rentalDays = calcRentalDays(rentalStartDate, rentalEndDate);
    const project = this.data.currentProject
      || this.data.projects.find((item) => Number(item.id) === Number(this.data.pendingProjectId));
    this.setData({
      rentalStartDate,
      rentalEndDate,
      rentalDays,
      payInfo: project ? buildPayInfo(project, rentalDays) : this.data.payInfo,
    });
  },

  updateRentalEndDate(e) {
    const rentalEndDate = e.detail.value || "";
    if (this.data.rentalStartDate && rentalEndDate && rentalEndDate < this.data.rentalStartDate) {
      wx.showToast({ title: "结束日期不能早于开始日期", icon: "none" });
      return;
    }
    const rentalDays = calcRentalDays(this.data.rentalStartDate, rentalEndDate);
    const project = this.data.currentProject
      || this.data.projects.find((item) => Number(item.id) === Number(this.data.pendingProjectId));
    this.setData({
      rentalEndDate,
      rentalDays,
      payInfo: project ? buildPayInfo(project, rentalDays) : this.data.payInfo,
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
    const projectId = this.data.pendingProjectId;
    if (!projectId) return;
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
      wx.showToast({ title: "请填写租赁天数", icon: "none" });
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

    try {
      await createOrderFromProject(projectId, {
        rentalStartDate: this.data.rentalStartDate,
        rentalEndDate: this.data.rentalEndDate,
        rentalDays,
        contactAddress,
        useScene,
        specialRemark,
      });
      this.setData({ showPayModal: false, pendingProjectId: null });
      await this.loadData();
      if (this.data.currentProject && Number(this.data.currentProject.id) === Number(projectId)) {
        const next = rebuildDraftProject(await getProjectById(projectId));
        this.setData({
          currentProject: cloneProject(next),
          originalProject: cloneProject(next),
        });
      }
      wx.showToast({ title: "支付成功，道具已锁定", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "下单失败", icon: "none" });
    }
  },

  viewOrderDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.skipProjectRefreshOnReturn = true;
    wx.navigateTo({ url: `/pages/order-detail/index?id=${id}` });
  },

  closeOrderDetail() {
    this.setData({ showOrderDetail: false, currentOrder: null });
  },

  handleOrderAction(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.orders.find((item) => String(item.id) === String(id));
    if (!order) return;

    if (order.status === ORDER_STATUS.WAIT_REVIEW) {
      this.setData({
        showReviewModal: true,
        reviewOrderId: String(order.id),
        reviewRole: "demander",
        reviewPropScore: 5,
        reviewCounterpartyScore: 5,
        reviewContent: "",
      });
      return;
    }

    wx.navigateTo({ url: `/pages/order-detail/index?id=${id}` });
  },

  handleSupplierKeywordInput(e) {
    const supplierKeyword = e.detail.value || "";
    this.setData({ supplierKeyword });
    if (this.supplierSearchTimer) clearTimeout(this.supplierSearchTimer);
    this.supplierSearchTimer = setTimeout(() => this.loadSupplierOrders(), 300);
  },

  submitSupplierSearch() {
    if (this.supplierSearchTimer) clearTimeout(this.supplierSearchTimer);
    this.loadSupplierOrders();
  },

  clearSupplierSearch() {
    this.setData({ supplierKeyword: "" }, () => this.loadSupplierOrders());
  },

  changeSupplierStatus(e) {
    const supplierActiveStatus = e.currentTarget.dataset.status || "all";
    if (supplierActiveStatus === this.data.supplierActiveStatus) return;
    this.setData({ supplierActiveStatus }, () => this.loadSupplierOrders());
  },

  changeSupplierDateRange(e) {
    const supplierDateRangeIndex = Number(e.detail.value || 0);
    const selected = SUPPLIER_DATE_RANGE_OPTIONS[supplierDateRangeIndex] || SUPPLIER_DATE_RANGE_OPTIONS[0];
    this.setData({
      supplierDateRangeIndex,
      supplierDateRange: selected.value,
      supplierDateRangeText: selected.label,
    }, () => this.loadSupplierOrders());
  },

  changeSupplierSortType(e) {
    const supplierSortIndex = Number(e.detail.value || 0);
    const selected = SUPPLIER_SORT_OPTIONS[supplierSortIndex] || SUPPLIER_SORT_OPTIONS[0];
    this.setData({
      supplierSortIndex,
      supplierSortType: selected.value,
      supplierSortText: selected.label,
    }, () => this.loadSupplierOrders());
  },

  resetSupplierFilters() {
    this.setData({
      supplierKeyword: "",
      supplierActiveStatus: "all",
      supplierDateRange: "all",
      supplierSortType: "latest",
      supplierDateRangeIndex: 0,
      supplierSortIndex: 0,
      supplierDateRangeText: SUPPLIER_DATE_RANGE_OPTIONS[0].label,
      supplierSortText: SUPPLIER_SORT_OPTIONS[0].label,
    }, () => this.loadSupplierOrders());
  },

  loadMoreSupplierOrders() {
    this.loadSupplierOrderPage();
  },

  openSupplierReviewModal(e) {
    const orderId =
      (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) ||
      (e.target && e.target.dataset && e.target.dataset.id);
    if (!orderId) {
      wx.showToast({ title: "订单不存在", icon: "none" });
      return;
    }
    this.setData({
      showReviewModal: true,
      reviewOrderId: orderId,
      reviewRole: "supplier",
      reviewPropScore: 5,
      reviewCounterpartyScore: 5,
      reviewContent: "",
    });
  },

  updateReviewPropScore(e) {
    this.setData({ reviewPropScore: Number(e.currentTarget.dataset.score || 5) });
  },

  updateReviewCounterpartyScore(e) {
    this.setData({ reviewCounterpartyScore: Number(e.currentTarget.dataset.score || 5) });
  },

  updateReviewContent(e) {
    this.setData({ reviewContent: e.detail.value || "" });
  },

  closeReviewModal() {
    this.setData({
      showReviewModal: false,
      reviewOrderId: "",
      reviewRole: "demander",
      reviewContent: "",
      reviewPropScore: 5,
      reviewCounterpartyScore: 5,
    });
  },

  async submitReview() {
    const { reviewOrderId, reviewRole, reviewPropScore, reviewCounterpartyScore, reviewContent } = this.data;
    if (!reviewOrderId) return;

    try {
      await submitOrderReview(reviewOrderId, {
        propScore: reviewPropScore,
        counterpartyScore: reviewCounterpartyScore,
        content: reviewContent,
        reviewerRole: reviewRole,
      });
      this.closeReviewModal();
      if (reviewRole === "supplier") {
        await this.loadSupplierOrders();
      } else {
        await this.loadData();
      }
      wx.showToast({ title: "评价成功", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "评价失败", icon: "none" });
    }
  },

  async confirmFactoryOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.showModal({
      title: "确认接单",
      content: `确认接收订单 ${orderId}？确认后将进入待出库流程。`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const updated = await confirmOrderByFactory(orderId);
          wx.showToast({ title: updated && updated.canScanOutbound ? "接单成功" : "订单状态已变化", icon: "success" });
          await this.loadSupplierOrders();
        } catch (err) {
          wx.showToast({ title: err.message || "接单失败", icon: "none" });
        }
      },
    });
  },

  openRejectOrderModal(e) {
    this.setData({
      showRejectModal: true,
      rejectOrderId: e.currentTarget.dataset.id,
      rejectReason: "",
    });
  },

  closeRejectOrderModal() {
    this.setData({ showRejectModal: false, rejectOrderId: null, rejectReason: "" });
  },

  updateRejectReason(e) {
    this.setData({ rejectReason: e.detail.value || "" });
  },

  async confirmRejectOrder() {
    const reason = (this.data.rejectReason || "").trim();
    if (!reason) {
      wx.showToast({ title: "请填写驳回理由", icon: "none" });
      return;
    }
    try {
      await rejectOrderByFactory(this.data.rejectOrderId, reason);
      this.closeRejectOrderModal();
      await this.loadSupplierOrders();
      wx.showToast({ title: "已驳回订单", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "驳回失败", icon: "none" });
    }
  },

  showMoreProjects() {
    wx.navigateTo({ url: "/pages/project-list/index" });
  },

  showMoreOrders() {
    wx.navigateTo({ url: "/pages/demander-orders/index" });
  },

  openSupplierScanModal(e) {
    const orderId = e.currentTarget.dataset.id;
    const mode = e.currentTarget.dataset.mode;
    const order = this.data.orders.find((item) => String(item.id) === String(orderId));
    if (!order) return;

    this.setData({
      showSupplierScanModal: true,
      supplierScanMode: mode,
      supplierCurrentOrder: order,
    });
  },

  closeSupplierScanModal() {
    this.setData({
      showSupplierScanModal: false,
      supplierCurrentOrder: null,
    });
  },

  async scanSupplierOneProp(e) {
    const propId = Number(e.currentTarget.dataset.propId);
    const { supplierCurrentOrder, supplierScanMode } = this.data;
    if (!supplierCurrentOrder) return;

    try {
      const updated =
        supplierScanMode === "outbound"
          ? await scanOutboundProp(supplierCurrentOrder.id, propId)
          : await scanReturnProp(supplierCurrentOrder.id, propId);

      this.setData({ supplierCurrentOrder: updated });
      await this.loadSupplierOrders();
      wx.showToast({ title: "扫码成功", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "扫码失败", icon: "none" });
    }
  },

  async scanSupplierAllRemaining() {
    const { supplierCurrentOrder, supplierScanMode } = this.data;
    if (!supplierCurrentOrder) return;

    let updated = supplierCurrentOrder;
    const props = supplierCurrentOrder.props || [];

    try {
      for (const prop of props) {
        const scanned =
          supplierScanMode === "outbound" ? prop.outboundScanned : prop.returnScanned;
        if (scanned) continue;

        updated =
          supplierScanMode === "outbound"
            ? await scanOutboundProp(updated.id, prop.id)
            : await scanReturnProp(updated.id, prop.id);
      }

      this.setData({ supplierCurrentOrder: updated });
      await this.loadSupplierOrders();
      wx.showToast({ title: "批量扫码完成", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "批量扫码失败", icon: "none" });
    }
  },

  exportPDF(e) {
    const projectId =
      e && e.currentTarget && e.currentTarget.dataset ? Number(e.currentTarget.dataset.id) : 0;
    const title = projectId ? `方案 ${projectId} 导出成功` : "PDF 导出成功";
    wx.showToast({ title, icon: "success" });
  },
});
