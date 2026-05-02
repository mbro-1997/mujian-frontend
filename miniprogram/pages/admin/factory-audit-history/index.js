const { getFactoryAuditHistory } = require("../../../services/admin.service");

Page({
  data: {
    list: [],
  },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    try {
      this.setData({ list: await getFactoryAuditHistory() });
    } catch (err) {
      wx.showToast({ title: err.message || "加载入驻审核历史失败", icon: "none" });
    }
  },
});
