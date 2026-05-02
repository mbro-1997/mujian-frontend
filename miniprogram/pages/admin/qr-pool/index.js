const { getAdminQrProps, generatePropQrCode } = require("../../../services/admin.service");

Page({
  data: {
    allList: [],
    list: [],
    showHistory: false,
    generating: false,
  },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    try {
      const allList = await getAdminQrProps();
      this.setData({ allList });
      this.applyFilter();
    } catch (err) {
      wx.showToast({ title: err.message || "加载二维码列表失败", icon: "none" });
    }
  },

  applyFilter() {
    const { allList, showHistory } = this.data;
    const list = allList.filter((item) => {
      const pending = item.fillStatus === "pending_fill";
      return showHistory ? !pending : pending;
    });
    this.setData({ list });
  },

  showActiveList() {
    this.setData({ showHistory: false }, () => this.applyFilter());
  },

  showHistoryList() {
    this.setData({ showHistory: true }, () => this.applyFilter());
  },

  async generateQr() {
    if (this.data.generating) return;
    this.setData({ generating: true });
    try {
      const prop = await generatePropQrCode();
      wx.showModal({
        title: "二维码已生成",
        content: `道具ID：${prop.id}\n二维码标识：${prop.qrCodeId}\n\n该记录已进入未登记二维码列表。`,
        showCancel: false,
      });
      this.setData({ showHistory: false });
      await this.loadList();
    } catch (err) {
      wx.showToast({ title: err.message || "生成二维码失败", icon: "none" });
    } finally {
      this.setData({ generating: false });
    }
  },

  copyCode(e) {
    const value = e.currentTarget.dataset.code;
    if (!value) return;
    wx.setClipboardData({
      data: String(value),
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
    });
  },
});
