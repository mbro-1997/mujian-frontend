const api = require("../../../services/props"),
  session = require("../../../session/storage");
const { decode, scanPropCode } = require("../../../navigation/prop-scan");
const inlineLogin = require("../../../navigation/login-page");
require("../../../session/page")({
  ...inlineLogin,
  data: {
    ...inlineLogin.data,
    id: "",
    code: "",
    qr: null,
    sku: null,
    stock: null,
    message: "",
    busy: false,
    loginRequired: false,
    identityMismatch: false,
    completed: false,
  },
  onLoad(q) {
    this.sceneState = { id: "", code: "" };
    try {
      if (q.id) this.sceneState.id = decode(q.id);
      if (q.scene || q.code) this.sceneState.code = decode(q.scene || q.code);
      this.setData(this.sceneState);
    } catch (e) {
      this.setData({ message: e.message });
    }
  },
  onShow() {
    if (this.data.code || this.data.id) return this.load();
  },
  onUnload() { this.loadRound++; },
  onSessionReset() {
    this.setData({
      ...this.sceneState,
      qr: null,
      sku: null,
      stock: null,
      loginRequired: true,
    });
  },
  async load() {
    const round = this.loadRound = (this.loadRound || 0) + 1;
    const target = this.data.id || this.data.code;
    const empty = { qr: null, sku: null, stock: null, instanceState: "" };
    if (!session.token() || !target || target !== this.shownTarget) this.setData(empty);
    if (!session.token()) {
      this.setData({
        loginRequired: true,
        message: "请登录原工厂账号后继续识别。",
      });
      return;
    }
    this.setData({ busy: true, loginRequired: false, identityMismatch: false, message: "" });
    try {
      // 冷启动先读取服务器身份；保留原扫码归属校验和错误恢复逻辑。
      if (this.route === "pages/props/scan/index") {
        const owner = session.capture();
        const context = await require("../../../services/account").context();
        session.assertCurrent(owner);
        if (round !== this.loadRound) return;
        if (context.roleCode !== "supplier") {
          this.setData({...empty, loginRequired: true, identityMismatch: true, message:"请使用已入驻的原工厂账号查看此标签。"});
          return;
        }
      }
      const qr = this.data.id
        ? await api.request("me/prop-qr/" + this.data.id)
        : await api.request("me/prop-qr/resolve", "POST", {
            qrCode: this.data.code,
          });
      if (round !== this.loadRound) return;
      const sku = await api.request("me/factory-props/" + qr.skuId);
      if (round !== this.loadRound) return;
      const stock =
        qr.targetType === "SKU"
          ? await api.request("me/factory-props/" + qr.skuId + "/stock")
          : null;
      if (round !== this.loadRound) return;
      this.shownTarget = target;
      this.setData({
        qr,
        sku,
        stock,
        instanceState: api.names[qr.instanceStatus] || "",
      });
    } catch (e) {
      if (round !== this.loadRound) return;
      this.setData({
        qr: null,
        sku: null,
        stock: null,
        instanceState: "",
        completed: false,
        message: e.message,
        loginRequired: e.reason === "LOGIN_REQUIRED",
      });
    } finally {
      if (round === this.loadRound) this.setData({ busy: false });
    }
  },
  login() {
    if(this.data.identityMismatch){wx.navigateTo({url:"/pages/account/index"});return;}
    this.openLogin(
      "/pages/props/scan/index?" +
        (this.data.id ? "id=" + this.data.id : "code=" + this.data.code),
    );
  },
  scan() {
    scanPropCode(code => {
      this.sceneState = { id: "", code };
      this.setData({ ...this.sceneState, completed: false });
      this.load();
    });
  },
  async confirm() {
    if (this.data.busy || !this.data.qr?.canConfirmLabel) return;
    this.setData({ busy: true });
    try {
      await api.confirmLabel(this.data.qr);
      this.setData({ completed: true });
      await this.load();
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  recognize() {
    const qr = this.data.qr;
    if (this.data.busy || qr?.status !== "bound" || qr.targetType !== "SKU") return;
    const owner = session.capture();
    this.setData({ message: "已确认识别，正在打开道具资料。" });
    wx.redirectTo({
      url: "/pages/props/detail?id=" + qr.skuId,
      fail: () => {
        if (session.isCurrent(owner))
          this.setData({ message: "未能打开道具资料，请重试确认识别。" });
      },
    });
  },
});
