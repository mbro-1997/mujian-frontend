const { getOrderById, submitOrderReview } = require("../../services/order.service");
const { ORDER_STATUS } = require("../../constants/status");
const { getSelectedRole } = require("../../services/user.service");

Page({
  data: {
    orderId: null,
    order: null,
    rejected: false,
    showReviewModal: false,
    reviewPropScore: 5,
    reviewCounterpartyScore: 5,
    reviewContent: "",
  },

  async onLoad(options) {
    const orderId = Number(options.id || 0);
    this.setData({ orderId });
    await this.loadOrder();
  },

  async loadOrder() {
    if (!this.data.orderId) {
      wx.showToast({ title: "订单不存在", icon: "none" });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }

    try {
      const order = await getOrderById(this.data.orderId);
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

  closeReviewModal() {
    this.setData({ showReviewModal: false, reviewPropScore: 5, reviewCounterpartyScore: 5, reviewContent: "" });
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
});
