const { getDisputes } = require("../../services/admin.service");

Page({
  data: {
    list: [],
  },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    try {
      this.setData({ list: await getDisputes() });
    } catch (err) {
      wx.showToast({ title: err.message || "加载仲裁失败", icon: "none" });
    }
  },

  openDetail(e) {
    wx.navigateTo({ url: `/pages/admin/dispute-detail/index?id=${e.currentTarget.dataset.id}` });
  },
});
