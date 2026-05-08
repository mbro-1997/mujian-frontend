const { fetchUser, getCreditLogs } = require("../../services/user.service");

function normalizeLog(item = {}) {
  const delta = Number(item.deltaScore || 0);
  return {
    ...item,
    deltaText: delta > 0 ? `+${delta}` : `${delta}`,
    deltaClass: delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral",
    createdAt: item.createdAt || "",
    reason: item.reason || "信用分变动",
    changeTypeText: item.changeTypeText || "信用变动",
  };
}

Page({
  data: {
    loading: false,
    creditScore: 0,
    logs: [],
  },

  async onShow() {
    wx.setNavigationBarTitle({ title: "我的信用分" });
    await this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [user, logs] = await Promise.all([fetchUser(), getCreditLogs()]);
      this.setData({
        creditScore: Number(user.credit || user.creditScore || 0),
        logs: (logs || []).map(normalizeLog),
      });
    } catch (err) {
      wx.showToast({ title: err.message || "加载信用分失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },
});
