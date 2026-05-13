const { listMyDisputes } = require("../../services/order.service");

Page({
  data: {
    tabs: [
      { label: "待仲裁", value: "pending" },
      { label: "已仲裁", value: "done" },
    ],
    activeTab: "pending",
    list: [],
    loading: false,
  },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const all = await listMyDisputes();
      const list = all.filter((item) =>
        this.data.activeTab === "pending" ? item.status === "pending" : item.status !== "pending",
      );
      this.setData({ list });
    } catch (err) {
      wx.showToast({ title: err.message || "加载仲裁失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  changeTab(e) {
    const activeTab = e.currentTarget.dataset.value;
    if (activeTab === this.data.activeTab) return;
    this.setData({ activeTab }, () => this.loadList());
  },

  openDetail(e) {
    wx.navigateTo({ url: `/pages/dispute-detail/index?id=${e.currentTarget.dataset.id}` });
  },
});
