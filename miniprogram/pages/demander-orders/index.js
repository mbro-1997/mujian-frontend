const { listOrders, submitOrderReview } = require("../../services/order.service");
const { ORDER_STATUS } = require("../../constants/status");

Page({
  data: {
    orders: [],
    showReviewModal: false,
    reviewOrderId: "",
    reviewPropScore: 5,
    reviewCounterpartyScore: 5,
    reviewContent: "",
  },

  async onShow() {
    await this.loadOrders();
  },

  async loadOrders() {
    try {
      this.setData({ orders: await listOrders() });
    } catch (err) {
      wx.showToast({ title: err.message || "加载订单失败", icon: "none" });
    }
  },

  viewOrderDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/order-detail/index?id=${id}` });
  },

  handleOrderAction(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.orders.find((item) => String(item.id) === String(id));
    if (!order) return;
    if (order.status === ORDER_STATUS.WAIT_REVIEW) {
      this.setData({
        showReviewModal: true,
        reviewOrderId: String(order.id),
        reviewPropScore: 5,
        reviewCounterpartyScore: 5,
        reviewContent: "",
      });
      return;
    }
    wx.navigateTo({ url: `/pages/order-detail/index?id=${id}` });
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
    this.setData({ showReviewModal: false, reviewOrderId: "", reviewPropScore: 5, reviewCounterpartyScore: 5, reviewContent: "" });
  },

  async submitReview() {
    const { reviewOrderId, reviewPropScore, reviewCounterpartyScore, reviewContent } = this.data;
    if (!reviewOrderId) return;
    try {
      await submitOrderReview(reviewOrderId, {
        propScore: reviewPropScore,
        counterpartyScore: reviewCounterpartyScore,
        content: reviewContent,
        reviewerRole: "demander",
      });
      this.closeReviewModal();
      await this.loadOrders();
      wx.showToast({ title: "评价成功，押金已返还", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "评价失败", icon: "none" });
    }
  },
});
