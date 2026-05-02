const { getPropAuditHistory } = require("../../services/admin.service");

Page({
  data: { list: [] },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    try {
      this.setData({ list: await getPropAuditHistory() });
    } catch (err) {
      wx.showToast({ title: err.message || "加载审核历史失败", icon: "none" });
    }
  },

  openDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/admin/prop-audit-detail?id=${id}` });
  },
});
