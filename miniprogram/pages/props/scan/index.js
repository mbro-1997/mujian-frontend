const api = require("../../../services/props"),
  session = require("../../../session/storage");
function decode(value) {
  const s = decodeURIComponent(value);
  if (!/^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(s))
    throw Error("不是平台道具码，请重新扫描");
  return s;
}
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
    this.rounds = 0;
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
    this.visible = true;
    if (this.data.code || this.data.id) this.load();
  },
  onHide() {
    this.visible = false;
    clearTimeout(this.timer);
  },
  onUnload() {
    this.visible = false;
    clearTimeout(this.timer);
  },
  onSessionReset() {
    clearTimeout(this.timer);
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
    clearTimeout(this.timer);
    this.setData({ qr: null, sku: null, stock: null, instanceState: "" });
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
          this.setData({loginRequired: true, identityMismatch: true, message:"请使用已入驻的原工厂账号查看此标签。"});
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
      this.setData({
        qr,
        sku,
        stock,
        instanceState: api.names[qr.instanceStatus] || "",
      });
      if (
        this.visible &&
        qr.status === "bound" &&
        ["pending", "generating"].includes(qr.imageStatus) &&
        this.rounds < 10
      ) {
        this.rounds++;
        this.timer = setTimeout(() => this.load(), 2000);
      }
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
    const owner = session.capture();
    wx.scanCode({
      onlyFromCamera: true,
      success: (r) => {
        if (!session.isCurrent(owner)) return;
        try {
          const raw = r.path || r.result || "";
          const path = raw.match(
            /^\/?pages\/props\/scan\/index\?scene=([^&]+)$/,
          );
          this.sceneState = { id: "", code: decode(path ? path[1] : raw) };
          this.setData({ ...this.sceneState, completed: false });
          this.rounds = 0;
          this.load();
        } catch (e) {
          this.setData({ message: e.message });
        }
      },
      fail: (r) => {
        if (!String(r.errMsg).includes("cancel"))
          this.setData({ message: "未能识别，请重新扫描" });
      },
    });
  },
  async retry() {
    if (this.data.busy || !this.data.qr) return;
    this.setData({ busy: true });
    try {
      await api.request(
        "me/prop-qr/" + this.data.qr.id + "/retry-image",
        "POST",
      );
      this.rounds = 0;
      await this.load();
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  async confirm() {
    if (this.data.busy || !this.data.qr?.canConfirmLabel) return;
    this.setData({ busy: true });
    try {
      await api.command(
        "label-" + this.data.qr.targetId,
        "label_confirm",
        "me/prop-instances/" + this.data.qr.targetId + "/label-confirm",
        {
          qrCode: this.data.qr.qrCode,
          expectedVersion: this.data.qr.snVersion,
        },
      );
      this.setData({ completed: true });
      await this.load();
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  async save() {
    const owner = session.capture();
    this.setData({ message: "" });
    try {
      const settings = await new Promise((resolve, reject) => {
        wx.getSetting({
          success: resolve,
          fail: () => reject(Error("暂时无法读取相册权限，请稍后重试")),
        });
      });
      session.assertCurrent(owner);
      if (settings.authSetting?.["scope.writePhotosAlbum"] === false) {
        this.setData({
          message: "尚未允许保存到相册，请在小程序右上角“…”→设置中开启相册权限后重试。",
        });
        return;
      }
      const q = await api.request("me/prop-qr/" + this.data.qr.id);
      session.assertCurrent(owner);
      if (!q.image || q.status !== "bound")
        throw Error("标签图片暂不可用，请刷新");
      wx.downloadFile({
        url: q.image.url,
        success: (r) => {
          if (!session.isCurrent(owner)) return;
          if (r.statusCode !== 200) {
            this.setData({ message: "图片下载失败，请刷新后重试" });
            return;
          }
          wx.saveImageToPhotosAlbum({
            filePath: r.tempFilePath,
            success: () => {
              if (session.isCurrent(owner)) wx.showToast({ title: "已保存标签图片" });
            },
            fail: (error) => this.saveFailure(owner, error, "album"),
          });
        },
        fail: (error) => this.saveFailure(owner, error, "download"),
      });
    } catch (e) {
      if (session.isCurrent(owner)) this.setData({ message: e.message });
    }
  },
  saveFailure(owner, error, phase) {
    if (!session.isCurrent(owner)) return;
    const permission = /auth|permission|privacy|den(?:y|ied)|权限|授权|隐私|拒绝/i.test(
      error?.errMsg || "",
    );
    const message = phase === "album"
      ? permission ? "未保存图片，请检查相册权限后重试" : "未能保存图片，请稍后重试"
      : permission
        ? "图片下载被权限或隐私设置阻止，请检查微信/小程序授权后重试。"
        : "图片下载失败，请刷新后重试";
    this.setData({ message });
  },
  imageError() {
    this.setData({
      message: "标签图片已失效或加载失败，请刷新获取图片。",
      "qr.image": null,
    });
  },
  recognize() {
    const qr = this.data.qr;
    if (this.data.busy || qr?.status !== "bound" || qr.targetType !== "SKU") return;
    const owner = session.capture();
    this.setData({ message: "已确认识别，正在打开库存页。" });
    wx.redirectTo({
      url: "/pages/inventory/index?id=" + qr.skuId,
      fail: () => {
        if (session.isCurrent(owner))
          this.setData({ message: "未能打开库存页，请重试确认识别。" });
      },
    });
  },
});
