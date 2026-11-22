const api = require("./verification"),
  account = require("./account"),
  session = require("../session/storage"),
  orderedMaterials = require("./verification-material-slots");
const { displayTime } = require("./display-time");
const applicationView = (application) => application ? {...application, submittedDisplay: displayTime(application.submittedAt), reviewedDisplay: displayTime(application.reviewedAt), expireDisplay: displayTime(application.expireAt)} : null;
const statusLabels = {
  pending: "等待管理员审核",
  verified: "实名认证已通过",
  approved: "学生认证已通过",
  rejected: "审核未通过",
  expired: "认证已过期",
};
module.exports = (domain, statusPage) => ({
  data: {
    domain,
    statusPage,
    current: null,
    application: null,
    heading: "",
    name: "",
    card: "",
    photos: [],
    agreed: false,
    busy: false,
    loading: true,
    message: "",
    unknown: false,
    requestId: "",
    editing: false,
    canRetryOriginal: false,
    refilling: false,
    canRefillOriginal: false,
    realnameLabel: "",
  },
  onLoad(q) {
    this.retry = q.retry === "1";
    this.recoverEditing = q.recover === "1";
  },
  onShow() {
    this.load();
  },
  onUnload() {
    this.command = null;
    this.uploadIds = null;
  },
  onSessionReset() {
    this.command = null;
    this.uploadIds = null;
    this.userId = null;
  },
  async load() {
    if (this.data.busy) return;
    const owner = session.capture();
    this.setData({ loading: true, message: "" });
    try {
      const context = await account.context();
      session.assertCurrent(owner);
      this.userId = context.userId;
      const current = await api.current(domain);
      session.assertCurrent(owner);
      const pending = api.pending(domain, this.userId);
      this.setData({
        current,
        application: applicationView(current.application),
        heading: current.application
          ? statusLabels[current.application.status]
          : "尚未提交认证",
        requestId: pending,
        unknown: !!pending,
        canRetryOriginal: !!this.command,
        realnameLabel:
          {
            unverified: "未认证",
            pending: "待审核",
            verified: "已通过",
            rejected: "未通过",
            expired: "已过期",
          }[current.realnameStatus] || "未认证",
      });
      if (
        !statusPage &&
        current.application &&
        !(this.retry && current.canSubmit) &&
        !pending
      ) {
        wx.redirectTo({ url: "/pages/" + domain + "/status" });
        return;
      }
      this.setData({ editing: !statusPage && current.canSubmit && !pending });
      if (pending) await this.recover();
    } catch (e) {
      if (!session.isCurrent(owner)) return;
      this.setData({ message: e.message });
    } finally {
      if (session.isCurrent(owner)) this.setData({ loading: false });
    }
  },
  input(e) {
    if (this.data.busy || (this.data.unknown && !this.data.refilling)) return;
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },
  consent(e) {
    this.setData({ agreed: e.detail.value.includes("agree") });
  },
  async choose(e) {
    if (this.data.busy || (this.data.unknown && !this.data.refilling)) return;
    const owner = session.capture();
    const position = Number(e.currentTarget.dataset.position);
    try {
      const picked = await new Promise((resolve, reject) =>
        wx.chooseMedia({
          count: 1,
          mediaType: ["image"],
          sizeType: ["original"],
          success: resolve,
          fail: reject,
        }),
      );
      session.assertCurrent(owner);
      const file = picked.tempFiles[0];
      if (file.size > 5242880) throw new Error("每张照片不能超过5MiB");
      const info = await new Promise((resolve, reject) =>
        wx.getImageInfo({
          src: file.tempFilePath,
          success: resolve,
          fail: reject,
        }),
      );
      session.assertCurrent(owner);
      if (
        !["jpeg", "jpg", "png"].includes(info.type) ||
        info.width * info.height > 20000000
      )
        throw new Error("仅支持JPEG/PNG，最多2000万像素");
      const photos = this.data.photos.slice();
      photos[position] = file.tempFilePath;
      this.setData({ photos, message: "" });
    } catch (e) {
      if (
        session.isCurrent(owner) &&
        !String(e.errMsg || "").includes("cancel")
      )
        this.setData({ message: e.message || "未能读取照片，请重新选择" });
    }
  },
  async submit() {
    if (this.data.busy || (this.data.unknown && !this.data.refilling) || !this.data.current?.canSubmit)
      return;
    if (!this.data.agreed) {
      this.setData({ message: "请先单独同意材料处理说明" });
      return;
    }
    let photos;
    try { photos = orderedMaterials(domain, this.data.photos); } catch (e) { this.setData({message:e.message}); return; }
    const name = this.data.name.trim(),
      card = this.data.card.trim().toUpperCase();
    if (
      !name ||
      name.length > (domain === "realname" ? 64 : 128) ||
      photos.length < 2 ||
      (domain === "realname" && !/^[0-9]{17}[0-9X]$/.test(card))
    ) {
      this.setData({ message: "请完整填写资料，并选择至少两张清晰照片" });
      return;
    }
    const owner = session.capture();
    this.setData({ busy: true, message: "正在上传材料，请勿重复提交" });
    let sent = false;
    const recoveringKey = api.pending(domain, this.userId);
    try {
      const version = this.data.current.consent.version,
        ids = [];
      for (let i = 0; i < photos.length; i++)
        ids.push(
          await api.upload(
            domain,
            photos[i],
            version,
            domain === "realname" ? (i === 0 ? "front" : "back") : null,
          ),
        );
      session.assertCurrent(owner);
      const key = recoveringKey || await api.id();
      session.assertCurrent(owner);
      const body = {
        consentAccepted: true,
        consentVersion: version,
        ...(domain === "realname"
          ? {
              realName: name,
              idCard: card,
              frontUploadId: ids[0],
              backUploadId: ids[1],
            }
          : { schoolName: name, materialUploadIds: ids }),
      };
      this.command = { key, body };
      api.remember(domain, this.userId, key);
      this.setData({ requestId: key });
      sent = true;
      const result = await api.submit(domain, body, key);
      session.assertCurrent(owner);
      api.forget(domain, this.userId);
      this.command = null;
      this.setData({ name: "", card: "", photos: [], agreed: false });
      wx.redirectTo({ url: "/pages/" + domain + "/status" });
    } catch (e) {
      if (!session.isCurrent(owner)) return;
      const definite = !recoveringKey && sent && e.outcome === "business-rejection" && [400, 403, 415, 413, 429].includes(e.status);
      if (definite) {
        api.forget(domain, this.userId);
        this.command = null;
      }
      this.setData({
        message:
          e.message +
          (sent && !definite ? " 请查询原提交结果，不要重新生成申请。" : ""),
        unknown: !!recoveringKey || (sent && !definite),
        refilling: false,
        canRetryOriginal: !!this.command,
      });
      if (e.reason === "IDEMPOTENCY_KEY_REUSED") {
        this.setData({ busy: false });
        await this.recover();
      }
      if (e.reason === "CONSENT_VERSION_CHANGED") {
        this.setData({ agreed: false });
      }
    } finally {
      if (session.isCurrent(owner)) this.setData({ busy: false });
    }
  },
  async retryOriginal() {
    if (!this.command || this.data.busy) return;
    const owner = session.capture();
    this.setData({ busy: true });
    try {
      await api.submit(domain, this.command.body, this.command.key);
      session.assertCurrent(owner);
      api.forget(domain, this.userId);
      this.command = null;
      wx.redirectTo({ url: "/pages/" + domain + "/status" });
    } catch (e) {
      if (!session.isCurrent(owner)) return;
      this.setData({ message: e.message });
      if (e.reason === "IDEMPOTENCY_KEY_REUSED") {
        this.setData({ busy: false });
        await this.recover();
      }
    } finally {
      if (session.isCurrent(owner)) this.setData({ busy: false });
    }
  },
  async recover() {
    if (!this.data.requestId || this.data.busy) return;
    const owner = session.capture();
    this.setData({ busy: true });
    try {
      const application = await api.recover(domain, this.data.requestId);
      session.assertCurrent(owner);
      api.forget(domain, this.userId);
      this.command = null;
      this.setData({
        application: applicationView(application),
        heading: statusLabels[application.status],
        unknown: false,
        refilling: false,
        canRefillOriginal: false,
        canRetryOriginal: false,
        name: "",
        card: "",
        photos: [],
        editing: false,
        message: "已找到原申请",
      });
      if (!statusPage) wx.redirectTo({ url: "/pages/" + domain + "/status" });
    } catch (e) {
      if (!session.isCurrent(owner)) return;
      const canRefill = !this.command && !!this.data.current?.canSubmit;
      this.setData({
        unknown: true,
        canRefillOriginal: canRefill,
        refilling: canRefill && this.recoverEditing && !statusPage,
        editing: canRefill && this.recoverEditing && !statusPage,
        message:
          e.status === 404
            ? "暂未查询到原申请，原请求可能仍在处理中。可继续查询；若原填写内容已丢失，可重新填写并沿用原编号。若原申请稍后保存，将回到原结果，不会覆盖它。"
            : e.message,
      });
    } finally {
      if (session.isCurrent(owner)) this.setData({ busy: false });
    }
  },
  refillOriginal() {
    if (this.data.busy || !this.data.canRefillOriginal || !this.data.requestId) return;
    if (statusPage) { wx.navigateTo({url:"/pages/"+domain+"/form?recover=1"}); return; }
    this.setData({editing:true,refilling:true,agreed:false,message:"请重新填写并选择材料。本次继续使用原提交编号；已保存的原申请不会被覆盖。"});
  },
  resubmit() {
    if (this.data.current?.canSubmit && !this.data.unknown)
      wx.navigateTo({ url: "/pages/" + domain + "/form?retry=1" });
  },
  back() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
  realname() {
    wx.navigateTo({ url: "/pages/realname/form" });
  },
});
