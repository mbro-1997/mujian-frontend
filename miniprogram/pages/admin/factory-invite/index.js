const {
  getFactoryInviteCodes,
  createFactoryInviteCode,
  revokeFactoryInviteCode,
} = require("../../../services/admin.service");

Page({
  data: {
    list: [],
    creating: false,
  },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    try {
      const list = await getFactoryInviteCodes();
      this.setData({ list });
    } catch (err) {
      wx.showToast({ title: err.message || "加载邀请码失败", icon: "none" });
    }
  },

  async createInvite() {
    if (this.data.creating) return;
    this.setData({ creating: true });
    try {
      const result = await createFactoryInviteCode({ expireDays: 7 });
      wx.showModal({
        title: "邀请码已生成",
        content: `请立即复制并发送给工厂联系人：\n${result.inviteCode}\n\n该邀请码只显示一次。`,
        showCancel: false,
      });
      await this.loadList();
    } catch (err) {
      wx.showToast({ title: err.message || "生成邀请码失败", icon: "none" });
    } finally {
      this.setData({ creating: false });
    }
  },

  async revokeInvite(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const list = await revokeFactoryInviteCode(id);
      this.setData({ list });
      wx.showToast({ title: "邀请码已作废", icon: "none" });
    } catch (err) {
      wx.showToast({ title: err.message || "作废失败", icon: "none" });
    }
  },
});
