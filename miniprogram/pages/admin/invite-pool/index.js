const {
  getFactoryInviteCodes,
  createFactoryInviteCode,
  revokeFactoryInviteCode,
} = require("../../../services/admin.service");

Page({
  data: {
    list: [],
    allList: [],
    showHistory: false,
    generating: false,
  },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    try {
      const allList = await getFactoryInviteCodes();
      this.setData({ allList }, () => this.applyFilter());
    } catch (err) {
      wx.showToast({ title: err.message || "加载邀请码失败", icon: "none" });
    }
  },

  applyFilter() {
    const list = this.data.showHistory
      ? this.data.allList.filter((item) => item.status !== "unused")
      : this.data.allList.filter((item) => item.status === "unused");
    this.setData({ list });
  },

  showActiveList() {
    this.setData({ showHistory: false }, () => this.applyFilter());
  },

  showHistoryList() {
    this.setData({ showHistory: true }, () => this.applyFilter());
  },

  async generateInvite() {
    if (this.data.generating) return;
    this.setData({ generating: true });
    try {
      const result = await createFactoryInviteCode({ expireDays: 7 });
      wx.showModal({
        title: "邀请码已生成",
        content: `邀请码：${result.inviteCode}\n\n后续也可以在邀请码列表中查看。`,
        showCancel: false,
      });
      this.setData({ showHistory: false });
      await this.loadList();
    } catch (err) {
      wx.showToast({ title: err.message || "生成邀请码失败", icon: "none" });
    } finally {
      this.setData({ generating: false });
    }
  },

  async revokeInvite(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await revokeFactoryInviteCode(id);
      wx.showToast({ title: "邀请码已作废", icon: "none" });
      await this.loadList();
    } catch (err) {
      wx.showToast({ title: err.message || "作废失败", icon: "none" });
    }
  },

  copyInvite(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) {
      wx.showToast({ title: "暂无可复制的邀请码", icon: "none" });
      return;
    }
    wx.setClipboardData({
      data: String(code),
      success() {
        wx.showToast({ title: "已复制邀请码", icon: "success" });
      },
    });
  },
});
