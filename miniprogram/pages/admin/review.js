const { getReviews } = require("../../services/admin.service");

function roleText(role) {
  return role === "supplier" ? "工厂方" : "租赁方";
}

function groupByOrder(reviews = []) {
  const map = {};
  reviews.forEach((review) => {
    const key = String(review.orderId);
    if (!map[key]) {
      map[key] = {
        orderId: review.orderId,
        orderNo: review.orderNo || `订单 ${review.orderId}`,
        demanderReview: null,
        supplierReview: null,
        reviewCount: 0,
        latestAt: review.createdAt || "",
      };
    }
    map[key].reviewCount += 1;
    if (review.createdAt && review.createdAt > map[key].latestAt) {
      map[key].latestAt = review.createdAt;
    }
    if (review.reviewerRole === "supplier") {
      map[key].supplierReview = { ...review, roleText: roleText(review.reviewerRole) };
    } else {
      map[key].demanderReview = { ...review, roleText: roleText(review.reviewerRole) };
    }
  });
  return Object.values(map).sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)));
}

Page({
  data: {
    list: [],
  },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    try {
      const reviews = await getReviews();
      this.setData({ list: groupByOrder(reviews) });
    } catch (err) {
      wx.showToast({ title: err.message || "加载评价失败", icon: "none" });
    }
  },

  openDetail(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin/review-detail/index?orderId=${orderId}` });
  },
});
