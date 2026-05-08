const { getReviews, hideReview, deleteReview } = require("../../../services/admin.service");

function normalizeReview(review) {
  return {
    ...review,
    roleText: review.reviewerRole === "supplier" ? "工厂方评价" : "租赁方评价",
    scoreText: `${review.score || 5} 分`,
    propScoreText: `${review.propScore || review.score || 5} 分`,
    counterpartyScoreText: `${review.counterpartyScore || review.score || 5} 分`,
  };
}

Page({
  data: {
    orderId: null,
    orderNo: "",
    demanderReview: null,
    supplierReview: null,
  },

  async onLoad(options) {
    this.setData({ orderId: Number(options.orderId || 0) });
    await this.loadDetail();
  },

  async loadDetail() {
    try {
      const reviews = await getReviews();
      const current = reviews.filter((item) => Number(item.orderId) === Number(this.data.orderId)).map(normalizeReview);
      const demanderReview = current.find((item) => item.reviewerRole !== "supplier") || null;
      const supplierReview = current.find((item) => item.reviewerRole === "supplier") || null;
      this.setData({
        orderNo: (current[0] && current[0].orderNo) || `订单 ${this.data.orderId}`,
        demanderReview,
        supplierReview,
      });
    } catch (err) {
      wx.showToast({ title: err.message || "加载评价详情失败", icon: "none" });
    }
  },

  async hide(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await hideReview(id);
      await this.loadDetail();
      wx.showToast({ title: "已隐藏", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "隐藏失败", icon: "none" });
    }
  },

  async remove(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await deleteReview(id);
      await this.loadDetail();
      wx.showToast({ title: "已删除", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "删除失败", icon: "none" });
    }
  },
});
