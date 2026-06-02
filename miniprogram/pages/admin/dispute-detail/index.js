const { getDisputeDetail, decideDispute } = require("../../../services/admin.service");

Page({
  data: {
    id: null,
    detail: null,
    showDecisionModal: false,
    decisionActionType: "reject",
    decisionAmount: "",
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
    const actionType = e.currentTarget.dataset.action || "reject";
    this.setData({
      showDecisionModal: true,
      decisionActionType: actionType,
      decisionAmount: "",
      decisionReason: actionType === "reject" ? "" : "管理员裁定：仲裁成立，相关金额进入结算处理。",
    });
  },

  closeDecision() {
    this.setData({ showDecisionModal: false, decisionAmount: "", decisionReason: "" });
  },

  updateDecisionAmount(e) {
    this.setData({ decisionAmount: e.detail.value || "" });
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
    const actionType = this.data.decisionActionType;
    const decisionAmount = actionType === "reject" ? 0 : Number(this.data.decisionAmount);
    if (actionType !== "reject" && (!Number.isFinite(decisionAmount) || decisionAmount <= 0)) {
      wx.showToast({ title: "请填写大于 0 的裁定金额", icon: "none" });
      return;
    }
    try {
      await decideDispute(this.data.id, actionType, reason, decisionAmount);
      this.closeDecision();
      await this.loadDetail();
      wx.showToast({ title: "裁定完成", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "裁定失败", icon: "none" });
    }
  },
});
