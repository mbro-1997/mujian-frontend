const { getPropAudits } = require("../../services/admin.service");

Page({
  data: { list: [] },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    try {
      this.setData({ list: await getPropAudits() });
    } catch (err) {
      wx.showToast({ title: err.message || "加载道具审核失败", icon: "none" });
    }
  },

  goHistory() {
    wx.navigateTo({ url: "/pages/admin/prop-audit-history" });
  },

  openDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/admin/prop-audit-detail?id=${id}` });
  },
});
