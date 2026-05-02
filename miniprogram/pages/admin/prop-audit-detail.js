const { getPropAuditDetail, reviewPropAudit } = require("../../services/admin.service");

function normalizeDetail(detail) {
  if (!detail) return null;
  const images = Array.isArray(detail.images) && detail.images.length
    ? detail.images
    : String(detail.imageUrl || "/images/stage-prop-real.jpg")
      .split(/[,;\n]/)
      .map((url) => url.trim())
      .filter(Boolean);
  return { ...detail, images };
}

Page({
  data: {
    id: null,
    detail: null,
  },

  onLoad(options) {
    this.setData({ id: Number(options.id || 0) });
  },

  async onShow() {
    await this.loadDetail();
  },

  async loadDetail() {
    if (!this.data.id) return;
    try {
      this.setData({ detail: normalizeDetail(await getPropAuditDetail(this.data.id)) });
    } catch (err) {
      wx.showToast({ title: err.message || "加载审核详情失败", icon: "none" });
    }
  },

  async review(e) {
    const approved = e.currentTarget.dataset.pass === "1";
    try {
      await reviewPropAudit(this.data.id, approved);
      wx.showToast({ title: approved ? "审核通过" : "已驳回", icon: "success" });
      await this.loadDetail();
    } catch (err) {
      wx.showToast({ title: err.message || "处理失败", icon: "none" });
    }
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.url;
    const urls = this.data.detail && this.data.detail.images && this.data.detail.images.length
      ? this.data.detail.images
      : [this.data.detail.imageUrl || "/images/stage-prop-real.jpg"];
    wx.previewImage({ current, urls });
  },
});
