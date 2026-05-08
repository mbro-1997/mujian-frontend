const {
  getOrderById,
  submitOrderReview,
  submitOrderDispute,
  scanOutboundQrCode,
  scanReturnQrCode,
} = require("../../services/order.service");
const { ORDER_STATUS } = require("../../constants/status");
const { getSelectedRole } = require("../../services/user.service");
const { resolveQrCode } = require("../../services/qrcode.service");
const { scanQrCode } = require("../../utils/qr-scan");

function buildScanState(order) {
  if (!order) return {};
  const total = Number(order.propCount || 0);
  const outboundScannedCount = Number(order.outboundScannedCount || 0);
  const returnScannedCount = Number(order.returnScannedCount || 0);
  return {
    canScanOutboundNow: !!order.canScanOutbound
      && order.status === ORDER_STATUS.WAIT_PICKUP
      && total > 0
      && outboundScannedCount < total,
    canScanReturnNow: !!order.canScanReturn
      && order.status === ORDER_STATUS.RENTING
      && total > 0
      && outboundScannedCount >= total
      && returnScannedCount < total,
    showOutboundScan: order.status === ORDER_STATUS.WAIT_PICKUP
      || order.status === ORDER_STATUS.RENTING
      || outboundScannedCount > 0,
    showReturnScan: order.status === ORDER_STATUS.WAIT_PICKUP
      || order.status === ORDER_STATUS.RENTING
      || returnScannedCount > 0,
    outboundDisabledText: total > 0 && outboundScannedCount >= total ? "出库已完成" : "出库扫码",
    returnDisabledText: outboundScannedCount < total ? "待全部出库" : "入库已完成",
  };
}

Page({
  data: {
    orderId: null,
    order: null,
    isSupplier: false,
    rejected: false,
    showScanModal: false,
    scanMode: "outbound",
    scanQrCodeId: "",
    scanPropName: "",
    showReviewModal: false,
    reviewPropScore: 5,
    reviewCounterpartyScore: 5,
    reviewContent: "",
    showDisputeModal: false,
    disputeReason: "",
    disputeAmount: "",
    disputeImages: [],
  },

  async onLoad(options) {
    const orderId = Number(options.id || 0);
    this.setData({ orderId, isSupplier: getSelectedRole() === "supplier" });
    await this.loadOrder();
  },

  async loadOrder() {
    if (!this.data.orderId) {
      wx.showToast({ title: "订单不存在", icon: "none" });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }

    try {
      const rawOrder = await getOrderById(this.data.orderId);
      const order = {
        ...rawOrder,
        ...buildScanState(rawOrder),
      };
      this.setData({
        order,
        rejected: order.status === ORDER_STATUS.CANCELLED_MANUAL,
      });
    } catch (err) {
      wx.showToast({ title: err.message || "加载订单失败", icon: "none" });
      setTimeout(() => wx.navigateBack(), 600);
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/project/index" });
  },

  openPropDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/prop-detail/index?id=${id}` });
  },

  openReviewModal() {
    if (!this.data.order || !this.data.order.canReview) return;
    this.setData({
      showReviewModal: true,
      reviewPropScore: 5,
      reviewCounterpartyScore: 5,
      reviewContent: "",
    });
  },

  async openScanModal(e) {
    const mode = e.currentTarget.dataset.mode;
    const order = this.data.order;
    if (!order) return;
    if (mode === "outbound" && !order.canScanOutboundNow) {
      wx.showToast({ title: order.outboundDisabledText || "当前不能出库扫码", icon: "none" });
      return;
    }
    if (mode === "return" && !order.canScanReturnNow) {
      wx.showToast({ title: order.returnDisabledText || "当前不能入库扫码", icon: "none" });
      return;
    }

    try {
      const { qrCodeId } = await scanQrCode();
      let scanPropName = "";
      try {
        const resolved = await resolveQrCode(qrCodeId);
        scanPropName = resolved.propName || "";
      } catch (err) {
        scanPropName = "";
      }
      this.setData({
        showScanModal: true,
        scanMode: mode,
        scanQrCodeId: qrCodeId,
        scanPropName,
      });
    } catch (err) {
      wx.showToast({ title: err.message || "扫码失败", icon: "none" });
    }
  },

  closeScanModal() {
    this.setData({ showScanModal: false, scanQrCodeId: "", scanPropName: "" });
  },

  async confirmScannedQr() {
    const { order, scanMode, scanQrCodeId } = this.data;
    if (!order || !scanQrCodeId) return;

    try {
      await (scanMode === "outbound"
        ? scanOutboundQrCode(order.id, scanQrCodeId)
        : scanReturnQrCode(order.id, scanQrCodeId));
      this.closeScanModal();
      await this.loadOrder();
      wx.showToast({ title: scanMode === "outbound" ? "出库成功" : "入库成功", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "扫码操作失败", icon: "none" });
    }
  },

  closeReviewModal() {
    this.setData({ showReviewModal: false, reviewPropScore: 5, reviewCounterpartyScore: 5, reviewContent: "" });
  },

  openDisputeModal() {
    const order = this.data.order;
    if (!order || !order.canApplyDispute) {
      wx.showToast({ title: "当前订单节点不能发起仲裁", icon: "none" });
      return;
    }
    this.setData({
      showDisputeModal: true,
      disputeReason: "",
      disputeAmount: "",
      disputeImages: [],
    });
  },

  closeDisputeModal() {
    this.setData({ showDisputeModal: false, disputeReason: "", disputeAmount: "", disputeImages: [] });
  },

  updateDisputeReason(e) {
    this.setData({ disputeReason: e.detail.value || "" });
  },

  updateDisputeAmount(e) {
    this.setData({ disputeAmount: e.detail.value || "" });
  },

  chooseDisputeImages() {
    const remain = 3 - this.data.disputeImages.length;
    if (remain <= 0) return;
    wx.chooseImage({
      count: remain,
      sizeType: ["compressed", "original"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const next = [...this.data.disputeImages, ...(res.tempFilePaths || [])].slice(0, 3);
        this.setData({ disputeImages: next });
      },
    });
  },

  removeDisputeImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const next = [...this.data.disputeImages];
    next.splice(index, 1);
    this.setData({ disputeImages: next });
  },

  previewDisputeImage(e) {
    const current = e.currentTarget.dataset.url;
    wx.previewImage({ current, urls: this.data.disputeImages });
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

  async submitReview() {
    if (!this.data.orderId) return;
    try {
      await submitOrderReview(this.data.orderId, {
        propScore: this.data.reviewPropScore,
        counterpartyScore: this.data.reviewCounterpartyScore,
        content: this.data.reviewContent,
        reviewerRole: getSelectedRole(),
      });
      this.closeReviewModal();
      await this.loadOrder();
      wx.showToast({ title: "评价成功", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "评价失败", icon: "none" });
    }
  },

  async submitDispute() {
    const order = this.data.order;
    if (!order) return;
    const reason = (this.data.disputeReason || "").trim();
    const claimAmount = Number(this.data.disputeAmount || 0);
    const maxDeposit = Number(order.deposit || 0);
    if (!reason) {
      wx.showToast({ title: "请填写仲裁原因", icon: "none" });
      return;
    }
    if (Number.isNaN(claimAmount) || claimAmount < 0) {
      wx.showToast({ title: "仲裁金额不能小于 0", icon: "none" });
      return;
    }
    if (claimAmount > maxDeposit) {
      wx.showToast({ title: "仲裁金额不能超过押金总额", icon: "none" });
      return;
    }
    try {
      const updated = await submitOrderDispute(order.id, {
        reason,
        claimAmount,
        evidenceUrls: this.data.disputeImages.join(","),
      });
      this.closeDisputeModal();
      this.setData({ order: { ...updated, ...buildScanState(updated) } });
      wx.showToast({ title: "仲裁申请已提交", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "提交仲裁失败", icon: "none" });
    }
  },
});
