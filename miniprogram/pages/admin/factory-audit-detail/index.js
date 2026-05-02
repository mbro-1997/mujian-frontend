const { getFactoryAuditDetail, reviewFactoryAudit } = require("../../../services/admin.service");

Page({
  data: {
    detail: null,
    showRejectModal: false,
    rejectReason: "",
  },

  async onLoad(options) {
    this.auditId = options.id;
    await this.loadDetail();
  },

  async loadDetail() {
    try {
      const detail = await getFactoryAuditDetail(this.auditId);
      this.setData({ detail });
    } catch (err) {
      wx.showToast({ title: err.message || "加载审核详情失败", icon: "none" });
    }
  },

  previewLicense() {
    const url = this.data.detail && this.data.detail.businessLicenseUrl;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  },

  async approveAudit() {
    await this.submitReview(true, "管理员审核通过");
  },

  openRejectModal() {
    this.setData({ showRejectModal: true, rejectReason: "" });
  },

  closeRejectModal() {
    this.setData({ showRejectModal: false, rejectReason: "" });
  },

  updateRejectReason(e) {
    this.setData({ rejectReason: e.detail.value || "" });
  },

  async confirmRejectAudit() {
    const reason = (this.data.rejectReason || "").trim();
    if (!reason) {
      wx.showToast({ title: "请填写驳回原因", icon: "none" });
      return;
    }
    await this.submitReview(false, reason);
  },

  async submitReview(approved, remark) {
    const detail = this.data.detail || {};
    if (!detail.id) return;
    try {
      await reviewFactoryAudit(detail.id, approved, remark);
      wx.showToast({ title: approved ? "已通过" : "已驳回", icon: "success" });
      this.closeRejectModal();
      setTimeout(() => wx.navigateBack(), 500);
    } catch (err) {
      wx.showToast({ title: err.message || "审核失败", icon: "none" });
    }
  },
});
