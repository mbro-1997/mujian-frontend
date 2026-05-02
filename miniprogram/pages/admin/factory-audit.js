const { getFactoryAudits } = require("../../services/admin.service");

Page({
  data: { list: [] },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    try {
      this.setData({ list: await getFactoryAudits() });
    } catch (err) {
      wx.showToast({ title: err.message || "加载入驻审核失败", icon: "none" });
    }
  },

  goHistory() {
    wx.navigateTo({ url: "/pages/admin/factory-audit-history/index" });
  },

  viewDetail(e) {
    const id =
      (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) ||
      (e.target && e.target.dataset && e.target.dataset.id);
    if (!id) {
      wx.showToast({ title: "审核记录不存在", icon: "none" });
      return;
    }
    wx.navigateTo({ url: `/pages/admin/factory-audit-detail/index?id=${id}` });
  },
});
