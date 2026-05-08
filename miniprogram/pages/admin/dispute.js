const { getDisputes, resolveDispute } = require("../../services/admin.service");

Page({
  data: {
    list: [],
    showResolveModal: false,
    currentId: null,
    resolution: "",
  },

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

  openResolve(e) {
    this.setData({
      showResolveModal: true,
      currentId: e.currentTarget.dataset.id,
      resolution: "",
    });
  },

  closeResolve() {
    this.setData({ showResolveModal: false, currentId: null, resolution: "" });
  },

  updateResolution(e) {
    this.setData({ resolution: e.detail.value || "" });
  },

  previewEvidence(e) {
    const current = e.currentTarget.dataset.url;
    const urls = e.currentTarget.dataset.urls || [];
    wx.previewImage({ current, urls });
  },

  async submitResolve() {
    const resolution = (this.data.resolution || "").trim();
    if (!resolution) {
      wx.showToast({ title: "请填写裁定结果", icon: "none" });
      return;
    }
    try {
      const nextList = await resolveDispute(this.data.currentId, resolution);
      this.setData({ list: nextList });
      this.closeResolve();
      wx.showToast({ title: "裁定完成", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "裁定失败", icon: "none" });
    }
  },
});
