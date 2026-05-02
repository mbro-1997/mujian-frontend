const { getReviews, hideReview, deleteReview } = require("../../services/admin.service");

Page({
  data: { list: [] },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    try {
      this.setData({ list: await getReviews() });
    } catch (err) {
      wx.showToast({ title: err.message || "加载评价失败", icon: "none" });
    }
  },

  async hide(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const list = await hideReview(id);
      this.setData({ list });
      wx.showToast({ title: "已隐藏", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "隐藏失败", icon: "none" });
    }
  },

  async remove(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const list = await deleteReview(id);
      this.setData({ list });
      wx.showToast({ title: "已删除", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "删除失败", icon: "none" });
    }
  },
});
