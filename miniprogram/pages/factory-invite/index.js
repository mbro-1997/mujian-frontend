const { verifyFactoryInvite } = require("../../services/user.service");

Page({
  data: {
    code: "",
    loading: false,
  },

  onInput(e) {
    this.setData({ code: (e.detail.value || "").trim().toUpperCase() });
  },

  async nextStep() {
    if (this.data.loading) return;
    if (!this.data.code) {
      wx.showToast({ title: "请输入邀请码", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await verifyFactoryInvite(this.data.code);
      wx.showToast({ title: "邀请码验证通过", icon: "success" });
      wx.navigateTo({
        url: `/pages/factory-application/index?inviteCodeId=${result.inviteCodeId}&codeSuffix=${result.codeSuffix}`,
      });
    } catch (err) {
      wx.showToast({ title: err.message || "邀请码验证失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  contactAdmin() {
    wx.showModal({
      title: "联系管理员",
      content: "MVP 阶段请通过微信或线下方式联系平台管理员获取邀请码。",
      showCancel: false,
    });
  },
});
