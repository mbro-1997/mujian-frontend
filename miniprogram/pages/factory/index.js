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
    profile: null,
    message: "",
    busy: false,
    ready: false,
    orders: [
      { label: "待接单", icon: "接" },
      { label: "待出库", icon: "出" },
      { label: "待核验", icon: "验" },
      { label: "异常仲裁", icon: "异" },
    ],
    tools: [
      { label: "发布道具", icon: "发" },
      { label: "库存台账", icon: "库" },
      { label: "标签下载", icon: "码" },
      { label: "工厂资料", icon: "资" },
      { label: "结算记录", icon: "款" },
      { label: "评价管理", icon: "评" },
      { label: "证据上传", icon: "证" },
      { label: "平台客服", icon: "服" },
    ],
  },
  onShow() {
    this.load();
  },
  async load() {
    if (!session.token()) {
      this.setData({ context: null, ready: false, message: "" });
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
      const profile =
        context.roleCode === "supplier"
          ? await factoryApi.request("factory-profile")
          : null;
      this.setData({
        profile,
        context,
        ready: context.nextAction === "ENTER_FACTORY_HOME",
        identity: stages[context.registrationStage],
        restricted: context.accessMode === "restricted",
        message: "",
      });
    } catch (e) {
      this.setData({ message: e.message, context: null, ready: false });
    } finally {
      this.setData({ busy: false });
    }
  },
  tool(e) {
    if (e.currentTarget.dataset.label === "工厂资料") this.profile();
    else if (["发布道具", "库存台账", "标签下载"].includes(e.currentTarget.dataset.label)) wx.navigateTo({url:"/pages/props/manage"});
    else this.unavailable();
  },
  profile() {
    wx.navigateTo({ url: "/pages/factory/profile" });
  },
  unavailable() {
    wx.showToast({ title: "此入口暂未开放", icon: "none" });
  },
  goAccount() {
    wx.navigateTo({ url: "/pages/account/index?return=/pages/mine/index" });
  },
  factory() {
    wx.navigateTo({ url: "/pages/factory/index" });
  },
  back() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
  async logout() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await account.logout();
      this.setData({ message: "已退出登录" });
    } catch (e) {
      this.setData({
        message: e.message + " 本地已退出，服务器注销尚未确认。",
      });
    } finally {
      this.setData({ busy: false, context: null, ready: false });
    }
  },
});
