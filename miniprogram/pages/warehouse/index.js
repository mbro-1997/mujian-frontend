const { listWarehouseProps, updatePropStatus } = require("../../services/prop.service");
const { getSelectedRole } = require("../../services/user.service");
const { getFactoryAudits, getPropAudits } = require("../../services/admin.service");
const { PROP_STATUS } = require("../../constants/status");

const ADMIN_STATUS_TEXT = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  resolved: "已裁定",
};

function withStatusText(list = []) {
  return list.map((item) => ({
    ...item,
    statusText: item.statusText || ADMIN_STATUS_TEXT[item.status] || item.status,
  }));
}

function buildWarehouseItem(item) {
  const isAuditPending = item.auditStatus === "pending";
  const isLocked = item.status === PROP_STATUS.LOCKED || item.status === PROP_STATUS.RENTING;
  const canToggle = !isAuditPending && !isLocked;
  const actionText = item.status === PROP_STATUS.OFFLINE ? "上架" : "下架";
  return {
    ...item,
    canToggle,
    actionText,
    actionDisabledText: isAuditPending ? "审核中" : "不可操作",
  };
}

Page({
  data: {
    selectedRole: "supplier",
    isAdmin: false,
    showAuditCenter: false,
    warehouseProps: [],
    factoryAudits: [],
    propAudits: [],
    showScanModal: false,
    scanType: "borrow",
  },

  async onShow() {
    const selectedRole = getSelectedRole() || "supplier";
    const isAdmin = selectedRole === "admin";
    const adminEntryTarget = wx.getStorageSync("adminEntryTarget");
    const forceFactoryWarehouse = isAdmin && adminEntryTarget === "warehouse";

    if (forceFactoryWarehouse) {
      wx.removeStorageSync("adminEntryTarget");
    }

    const showAuditCenter = isAdmin && !forceFactoryWarehouse;
    this.setData({ selectedRole, isAdmin, showAuditCenter });

    if (showAuditCenter) {
      wx.setNavigationBarTitle({ title: "审核中心" });
      await this.loadAuditCenterData();
    } else {
      wx.setNavigationBarTitle({ title: "仓库" });
      await this.refreshProps();
    }

    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      const selected = isAdmin ? 0 : 1;
      this.getTabBar().setData({ selected });
    }
  },

  async loadAuditCenterData() {
    try {
      const [factoryAudits, propAudits] = await Promise.all([getFactoryAudits(), getPropAudits()]);
      this.setData({
        factoryAudits: withStatusText(factoryAudits).slice(0, 5),
        propAudits: withStatusText(propAudits).slice(0, 5),
      });
    } catch (err) {
      wx.showToast({ title: err.message || "加载审核数据失败", icon: "none" });
    }
  },

  goFactoryAuditMore() {
    wx.navigateTo({ url: "/pages/admin/factory-audit" });
  },

  goPropAuditMore() {
    wx.navigateTo({ url: "/pages/admin/prop-audit" });
  },

  async refreshProps() {
    try {
      const warehouseProps = await listWarehouseProps();
      this.setData({ warehouseProps: warehouseProps.map(buildWarehouseItem) });
    } catch (err) {
      wx.showToast({ title: err.message || "加载仓库失败", icon: "none" });
    }
  },

  scanBorrow() {
    this.setData({ showScanModal: true, scanType: "borrow" });
  },

  scanReturn() {
    this.setData({ showScanModal: true, scanType: "return" });
  },

  closeScanModal() {
    this.setData({ showScanModal: false });
  },

  simulateScan() {
    const text = this.data.scanType === "borrow" ? "借出扫码成功" : "归还扫码成功";
    wx.showToast({ title: text, icon: "success" });
    this.closeScanModal();
  },

  async toggleStatus(e) {
    const id = Number(e.currentTarget.dataset.id);
    const current = this.data.warehouseProps.find((item) => item.id === id);
    if (!current) return;

    if (!current.canToggle) {
      wx.showToast({ title: current.auditStatus === "pending" ? "待审核道具不可操作" : "当前道具不可操作", icon: "none" });
      return;
    }

    const nextStatus = current.status === PROP_STATUS.OFFLINE ? PROP_STATUS.IDLE : PROP_STATUS.OFFLINE;
    try {
      await updatePropStatus(id, nextStatus);
      await this.refreshProps();
      wx.showToast({ title: "申请已提交，待审核", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "状态更新失败", icon: "none" });
    }
  },

  viewPropDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/prop-detail/index?id=${id}` });
  },
});
