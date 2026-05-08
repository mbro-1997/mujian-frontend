const { resolveQrCode } = require("../../services/qrcode.service");
const { KEYS, setItem } = require("../../store/local-db");

function extractQrCodeId(options = {}) {
  const rawScene = options.scene ? decodeURIComponent(options.scene) : "";
  const raw = options.q || options.qrCodeId || rawScene;
  if (!raw) return "";
  if (raw.includes("=")) {
    const params = {};
    raw.split("&").forEach((pair) => {
      const [key, value] = pair.split("=");
      params[key] = value;
    });
    return params.q || params.qrCodeId || "";
  }
  return raw;
}

Page({
  data: {
    qrCodeId: "",
    source: "",
    title: "正在识别二维码",
    message: "请稍候，系统正在解析二维码状态。",
    showRoleButton: false,
    showHomeButton: false,
  },

  async onLoad(options) {
    const qrCodeId = extractQrCodeId(options);
    this.setData({ qrCodeId, source: options.source || "" });
    if (!qrCodeId) {
      this.showMessage("二维码无效", "未识别到二维码业务参数。", true);
      return;
    }
    await this.resolve(qrCodeId);
  },

  async resolve(qrCodeId) {
    try {
      const result = await resolveQrCode(qrCodeId);
      if (result.redirectType === "login_required") {
        setItem(KEYS.PENDING_QR_CODE_ID, qrCodeId);
        this.setData({
          title: "需要先登录",
          message: result.message || "请先登录后继续扫码流程。",
          showRoleButton: true,
          showHomeButton: false,
        });
        return;
      }
      if (result.redirectType === "inventory_form") {
        wx.redirectTo({
          url: `/pages/inventory/index?propId=${result.propId}&qrCodeId=${encodeURIComponent(qrCodeId)}&source=${encodeURIComponent(this.data.source || "")}`,
        });
        return;
      }
      if (result.redirectType === "prop_detail") {
        wx.redirectTo({ url: `/pages/prop-detail/index?id=${result.propId}` });
        return;
      }
      this.showMessage("扫码结果", result.message || "当前二维码暂不能继续处理。", true);
    } catch (err) {
      this.showMessage("识别失败", err.message || "二维码解析失败，请稍后重试。", true);
    }
  },

  showMessage(title, message, showHomeButton = false) {
    this.setData({
      title,
      message,
      showRoleButton: false,
      showHomeButton,
    });
  },

  goRole() {
    wx.reLaunch({ url: "/pages/role/index" });
  },

  goHome() {
    wx.reLaunch({ url: "/pages/home/index" });
  },
});
