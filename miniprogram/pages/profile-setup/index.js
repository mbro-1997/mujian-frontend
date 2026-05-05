const {
  fetchUser,
  updateUserProfile,
  bindWechatPhone,
  bindDemanderRole,
  resolveEntryPath,
} = require("../../services/user.service");

Page({
  data: {
    avatarUrl: "/images/avatar.png",
    nickname: "",
    phone: "",
    loading: false,
    phoneLoading: false,
  },

  async onLoad() {
    const user = await fetchUser().catch(() => null);
    if (user) {
      this.setData({
        avatarUrl: user.avatarUrl || user.avatar || "/images/avatar.png",
        nickname: user.nickname && !user.nickname.startsWith("微信用户") ? user.nickname : "",
        phone: user.phone || "",
      });
    }
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail && e.detail.avatarUrl;
    if (avatarUrl) {
      this.setData({ avatarUrl });
    }
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value || "" });
  },

  async onGetPhoneNumber(e) {
    if (this.data.phoneLoading) return;
    const detail = e.detail || {};
    if (!detail.code) {
      wx.showToast({ title: "未完成手机号授权", icon: "none" });
      return;
    }
    this.setData({ phoneLoading: true });
    try {
      const user = await bindWechatPhone(detail.code);
      this.setData({ phone: user.phone || "" });
      wx.showToast({ title: "手机号已绑定", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "手机号授权失败", icon: "none" });
    } finally {
      this.setData({ phoneLoading: false });
    }
  },

  async saveProfile() {
    const nickname = (this.data.nickname || "").trim();
    if (!nickname) {
      wx.showToast({ title: "请填写昵称", icon: "none" });
      return null;
    }
    this.setData({ loading: true });
    try {
      return await updateUserProfile({
        nickname,
        avatarUrl: this.data.avatarUrl,
      });
    } catch (err) {
      wx.showToast({ title: err.message || "保存资料失败", icon: "none" });
      return null;
    } finally {
      this.setData({ loading: false });
    }
  },

  async enterDemander() {
    if (!this.data.phone) {
      wx.showToast({ title: "请先授权手机号", icon: "none" });
      return;
    }
    const saved = await this.saveProfile();
    if (!saved) return;
    try {
      const user = await bindDemanderRole();
      wx.reLaunch({ url: resolveEntryPath(user.defaultEntry) });
    } catch (err) {
      wx.showToast({ title: err.message || "进入租赁端失败", icon: "none" });
    }
  },

  async enterFactory() {
    if (!this.data.phone) {
      wx.showToast({ title: "请先授权手机号", icon: "none" });
      return;
    }
    const saved = await this.saveProfile();
    if (!saved) return;
    wx.navigateTo({ url: "/pages/factory-invite/index" });
  },

  backToRole() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: "/pages/role/index" }) });
  },
});
