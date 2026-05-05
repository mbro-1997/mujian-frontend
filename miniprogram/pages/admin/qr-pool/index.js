const { API_BASE_URL } = require("../../../config/env");
const {
  getAdminQrProps,
  generatePropQrCode,
  revokePropQrCode,
} = require("../../../services/admin.service");

function absoluteUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

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
      const allList = (await getAdminQrProps()).map((item) => ({
        ...item,
        qrImageFullUrl: absoluteUrl(item.qrCodeUrl),
        registerText: item.fillStatus === "pending_fill"
          ? "未登记"
          : item.fillStatus === "revoked" || item.qrStatus === "revoked"
            ? "已作废"
            : "已登记",
      }));
      this.setData({ allList });
      this.applyFilter();
    } catch (err) {
      wx.showToast({ title: err.message || "加载二维码列表失败", icon: "none" });
    }
  },

  applyFilter() {
    const { allList, showHistory } = this.data;
    const list = allList.filter((item) => {
      const pending = item.fillStatus === "pending_fill" && item.qrStatus !== "revoked";
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
        title: "小程序码已生成",
        content: `道具ID：${prop.id}\n二维码标识：${prop.qrCodeId}\n\n图片已归档，请及时下载或打印。`,
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

  previewQr(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) {
      wx.showToast({ title: "二维码图片已遗失", icon: "none" });
      return;
    }
    wx.previewImage({ urls: [url], current: url });
  },

  async revokeQr(e) {
    const propId = e.currentTarget.dataset.id;
    if (!propId) return;
    wx.showModal({
      title: "确认作废",
      content: "作废后该二维码不能再用于道具录入，但已打印的实体码仍会被系统识别为已作废。",
      confirmText: "确认作废",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const allList = await revokePropQrCode(propId);
          this.setData({
            allList: (allList || []).map((item) => ({
              ...item,
              qrImageFullUrl: absoluteUrl(item.qrCodeUrl),
              registerText: item.fillStatus === "pending_fill" ? "未登记" : "已作废",
            })),
          });
          this.applyFilter();
          wx.showToast({ title: "已作废", icon: "success" });
        } catch (err) {
          wx.showToast({ title: err.message || "作废失败", icon: "none" });
        }
      },
    });
  },
});
