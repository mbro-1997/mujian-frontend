const { setSelectedRole } = require("../../services/user.service");
const { getAdminOverview } = require("../../services/admin.service");

Page({
  data: {
    overview: {
      pendingFactoryCount: 0,
      pendingPropCount: 0,
      pendingDisputeCount: 0,
      visibleReviewCount: 0,
      totalUsers: 0,
    },
  },

  async onShow() {
    setSelectedRole("admin");
    await this.loadOverview();
  },

  async loadOverview() {
    try {
      const overview = await getAdminOverview();
      this.setData({ overview });
    } catch (err) {
      wx.showToast({ title: err.message || "加载概览失败", icon: "none" });
    }
  },

  goWarehouse() {
    wx.switchTab({ url: "/pages/warehouse/index" });
  },

  goPublish() {
    wx.switchTab({ url: "/pages/publish/index" });
  },

  goFactoryAudit() {
    wx.navigateTo({ url: "/pages/admin/factory-audit" });
  },

  goPropAudit() {
    wx.navigateTo({ url: "/pages/admin/prop-audit" });
  },

  goDispute() {
    wx.navigateTo({ url: "/pages/admin/dispute" });
  },

  goReview() {
    wx.navigateTo({ url: "/pages/admin/review" });
  },

  goUserStats() {
    wx.navigateTo({ url: "/pages/admin/user-stats" });
  },

  backRole() {
    wx.reLaunch({ url: "/pages/role/index" });
  },
});
