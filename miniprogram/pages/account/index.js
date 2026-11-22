const account = require("../../services/account"),
  routes = require("../../constants/routes"),
  session = require("../../session/storage");
const loginTarget = require("../../navigation/login-target");
const labels = {
  SELECT_IDENTITY: ["请选择你的身份", "选择后将使用对应的租赁或工厂服务"],
  ENTER_DEMANDER_HOME: ["租赁方账号已就绪", "你可以返回首页浏览道具"],
  COMPLETE_FACTORY_PROFILE: ["完善工厂资料", "请使用原账号继续完善工厂申请"],
  WAIT_FACTORY_REVIEW: ["工厂入驻审核中", "申请已提交，请耐心等待审核结果"],
  REVISE_FACTORY_APPLICATION: [
    "工厂申请未通过",
    "请使用原账号修改原申请，无需重新获取邀请",
  ],
  ENTER_FACTORY_HOME: ["工厂账号已就绪", "你的工厂身份已通过审核"],
  ENTER_RESTRICTED_HOME: [
    "账号使用受限",
    "暂不能发起新的业务，请联系平台了解详情",
  ],
};
require("../../session/page")({
  data: {
    title: "登录后使用更多服务",
    description: "微信手机号授权后即可使用账号服务",
    message: "",
    busy: false,
    action: "",
    loginVisible: false,
    summary: null,
    returnPath: "/pages/home/index",
  },
  onLoad(q) {
    this.loginActive = true;
    this.setData({ returnPath: routes.safeReturn(q.return), resume: q.resume === "1" });
  },
  onUnload() { this.loginActive = false; },
  onShow() {
    if (session.token()) this.load();
    else this.setData({ loginVisible: true });
  },
  async load() {
    if (this.data.busy) return;
    const owner = session.capture();
    this.setData({ busy: true });
    try {
      const c = await account.context();
      if (!session.isCurrent(owner)) {
        // context may invalidate old private state for the same credential.
        if (session.token() === owner.token && owner.token && this.loginActive) return this.load();
        return;
      }
      if (this.data.resume) {
        const target = loginTarget.select(c, this.data.returnPath);
        if (target) { loginTarget.open(target); return; }
      }
      const label = labels[c.nextAction];
      const summary = await require("../../services/registration").summary();
      this.setData({ summary });
      this.setData({
        title: label[0],
        description: label[1],
        action: c.nextAction,
        message: "",
      });
    } catch (e) {
      this.setData({ message: e.message, action: "" });
    } finally {
      this.setData({ busy: false });
    }
  },
  async loginSucceeded(e) {
    this.setData({ loginVisible: false, returnPath: routes.safeReturn(e.detail.returnPath), resume: true });
    return this.load();
  },
  closeLogin() {
    this.setData({ loginVisible: false });
    return this.back();
  },
  async bind() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await require("../../services/registration").bind();
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
    this.load();
  },
  verification(e) {
    wx.navigateTo({
      url: "/pages/" + e.currentTarget.dataset.domain + "/form",
    });
  },
  async logout() {
    await account.logout().catch(() => {});
    if (!session.token()) wx.redirectTo({ url: "/pages/account/index" });
  },
  unavailable() {
    wx.showToast({ title: "此功能暂未开放", icon: "none" });
  },
  async back() {
    if (!session.token()) {
      const stack = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      if (stack.length > 1) wx.navigateBack({ delta: 1 });
      else loginTarget.open(routes.tabs[0]);
      return;
    }
    const owner = session.capture();
    try {
      const context = await account.context();
      session.assertCurrent(owner);
      loginTarget.open(loginTarget.select(context, this.data.returnPath) || routes.tabs[0]);
    } catch (e) {
      if (session.isCurrent(owner)) this.setData({ message: e.message });
    }
  },
  factory() {
    wx.navigateTo({ url: "/pages/factory/index" });
  },
});
