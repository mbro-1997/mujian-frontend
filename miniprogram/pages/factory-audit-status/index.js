const { getFactoryAuditStatus, resolveEntryPath, loginCurrentAccount } = require("../../services/user.service");
const { KEYS, setItem } = require("../../store/local-db");

Page({
  data: {
    detail: null,
  },

  async onShow() {
    setItem(KEYS.ROLE_ENTRY_HOLD_UNTIL, Date.now() + 5 * 60 * 1000);
    await this.loadStatus();
  },

  async loadStatus() {
    try {
      const detail = await getFactoryAuditStatus();
      this.setData({ detail });
    } catch (err) {
      wx.showToast({ title: err.message || "加载审核状态失败", icon: "none" });
    }
  },

  async refreshStatus() {
    await this.loadStatus();
  },

  contactAdmin() {
    wx.showModal({
      title: "联系管理员",
      content: "MVP 阶段请通过微信或线下方式联系平台管理员处理入驻问题。",
      showCancel: false,
    });
  },

  async enterFactory() {
    try {
      const user = await loginCurrentAccount();
      wx.reLaunch({ url: resolveEntryPath(user.defaultEntry) });
    } catch (err) {
      wx.showToast({ title: err.message || "进入工厂端失败", icon: "none" });
    }
  },
});
