const { getDisputeDetail, decideDispute } = require("../../../services/admin.service");

Page({
  data: {
    id: null,
    detail: null,
    showDecisionModal: false,
    decisionApproved: true,
    decisionReason: "",
  },

  async onLoad(options) {
    this.setData({ id: Number(options.id || 0) });
    await this.loadDetail();
  },

  async loadDetail() {
    try {
      this.setData({ detail: await getDisputeDetail(this.data.id) });
    } catch (err) {
      wx.showToast({ title: err.message || "加载仲裁详情失败", icon: "none" });
    }
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.url;
    const urls = this.data.detail.evidenceImages || [];
    wx.previewImage({ current, urls });
  },

  openDecision(e) {
    const approved = e.currentTarget.dataset.approved === "1";
    this.setData({
      showDecisionModal: true,
      decisionApproved: approved,
      decisionReason: approved ? "同意仲裁申请，后续进入押金退款处理流程。" : "",
    });
  },

  closeDecision() {
    this.setData({ showDecisionModal: false, decisionReason: "" });
  },

  updateReason(e) {
    this.setData({ decisionReason: e.detail.value || "" });
  },

  async submitDecision() {
    const reason = (this.data.decisionReason || "").trim();
    if (!reason) {
      wx.showToast({ title: "请填写裁定理由", icon: "none" });
      return;
    }
    try {
      await decideDispute(this.data.id, this.data.decisionApproved, reason);
      this.closeDecision();
      await this.loadDetail();
      wx.showToast({ title: "裁定完成", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "裁定失败", icon: "none" });
    }
  },
});
