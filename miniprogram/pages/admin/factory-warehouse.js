const { listWarehouseProps, updatePropStatus } = require("../../services/prop.service");
const { PROP_STATUS } = require("../../constants/status");

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
    warehouseProps: [],
    showScanModal: false,
    scanType: "borrow",
  },

  async onShow() {
    await this.refreshProps();
  },

  async refreshProps() {
    try {
      const warehouseProps = await listWarehouseProps();
      this.setData({ warehouseProps: warehouseProps.map(buildWarehouseItem) });
    } catch (err) {
      wx.showToast({ title: "加载仓库失败", icon: "none" });
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
