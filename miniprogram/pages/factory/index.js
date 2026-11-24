const successToast = require("../../services/success-toast");
const factoryApi = require("../../services/factory");
const account = require("../../services/account"),
  session = require("../../session/storage");
const stages = {
  new: "尚未选择身份",
  demander_bound: "租赁方",
  factory_invite_locked: "工厂资料待完善",
  factory_pending: "工厂审核中",
  factory_rejected: "工厂申请未通过",
  factory_bound: "工厂方",
};
require("../../session/page")({
  data: {
    context: null,
    message: "",
    busy: false,
  },
  onShow() {
    return this.load();
  },
  async load() {
    if (!session.token()) {
      this.setData({ context: null, message: "" });
      return;
    }
    this.setData({ busy: true });
    try {
      const context = await account.context();
      if (context.roleCode === null && context.accessMode !== "restricted") {
        const current = await factoryApi.request("factory-onboarding/current");
        wx.redirectTo({
          url:
            current.nextAction === "ENTER_FACTORY_INVITE"
              ? "/pages/factory/invite"
              : !current.application && current.canSubmit
                ? "/pages/factory/form"
                : "/pages/factory/status",
        });
        return;
      }
      if(context.roleCode === "supplier") { wx.switchTab({url:"/pages/home/index"}); return; }
      this.setData({
        context,
        identity: stages[context.registrationStage],
        restricted: context.accessMode === "restricted",
        message: "",
      });
    } catch (e) {
      this.setData({ message: e.message, context: null });
    } finally {
      this.setData({ busy: false });
    }
  },
  goAccount() {
    wx.navigateTo({ url: "/pages/account/index?return=/pages/mine/index" });
  },
  back() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
  async logout() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await account.logout();
      this.setData({ message: "" });
      successToast("已退出登录");
    } catch (e) {
      this.setData({
        message: e.message + " 本地已退出，服务器注销尚未确认。",
      });
    } finally {
      this.setData({ busy: false, context: null });
    }
  },
});
