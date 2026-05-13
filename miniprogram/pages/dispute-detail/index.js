const { listMyDisputes } = require("../../services/order.service");

Page({
  data: {
    id: null,
    detail: null,
  },

  async onLoad(options) {
    this.setData({ id: Number(options.id || 0) });
    await this.loadDetail();
  },

  async loadDetail() {
    try {
      const list = await listMyDisputes();
      const detail = list.find((item) => Number(item.id) === Number(this.data.id));
      if (!detail) {
        wx.showToast({ title: "仲裁记录不存在", icon: "none" });
        return;
      }
      this.setData({ detail });
    } catch (err) {
      wx.showToast({ title: err.message || "加载仲裁详情失败", icon: "none" });
    }
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.url;
    const urls = this.data.detail.evidenceImages || [];
    wx.previewImage({ current, urls });
  },

  openOrder() {
    if (!this.data.detail) return;
    wx.navigateTo({ url: `/pages/order-detail/index?id=${this.data.detail.orderId}` });
  },
});
