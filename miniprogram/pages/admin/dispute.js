const { getDisputes, resolveDispute } = require("../../services/admin.service");

Page({
  data: { list: [] },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    try {
      this.setData({ list: await getDisputes() });
    } catch (err) {
      wx.showToast({ title: err.message || "加载纠纷失败", icon: "none" });
    }
  },

  async resolve(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const nextList = await resolveDispute(id, "管理员裁定：双方各承担 50% 责任");
      this.setData({ list: nextList });
      wx.showToast({ title: "裁定完成", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "裁定失败", icon: "none" });
    }
  },
});
