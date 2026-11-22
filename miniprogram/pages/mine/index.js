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
require("../../navigation/root")(3, {
  data: {
    loginVisible: false,
    context: null,
    message: "",
    busy: false,
    ready: false,
    orders: [
      { label: "待确认", icon: "clock" },
      { label: "待收货", icon: "box" },
      { label: "待归还", icon: "return" },
      { label: "待评价", icon: "review" },
    ],
    tools: [
      { label: "我的方案", icon: "folder" },
      { label: "租赁清单", icon: "list" },
      { label: "我要定制", icon: "ruler" },
      { label: "实名认证", icon: "id" },
      { label: "学生认证", icon: "cap" },
      { label: "收货地址", icon: "pin" },
      { label: "我的仲裁", icon: "scale" },
      { label: "优惠权益", icon: "ticket" },
      { label: "平台客服", icon: "chat" },
      { label: "信用中心", icon: "shield" },
    ],
  },
  onShow() {
    this.getTabBar().setData({ selected: 3 });
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
      this.setData({
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
    const label = e.currentTarget.dataset.label;
    if (label === "我的方案" || label === "租赁清单") {
      wx.switchTab({
        url:
          label === "我的方案" ? "/pages/plan/index" : "/pages/checklist/index",
      });
      return;
    }
    if (label === "收货地址") {
      if (!session.token()) return this.goAccount();
      wx.navigateTo({ url: "/pages/address/index" });
      return;
    }
    if(label === "平台客服"){wx.navigateTo({url:"/pages/service/index"});return;}
    if(label === "我的仲裁"){wx.navigateTo({url:"/pages/orders/disputes?kind=arbitrations"});return;}
    if(label === "信用中心"){wx.navigateTo({url:"/pages/reviews/credit"});return;}
    if(label === "我要定制"){wx.navigateTo({url:"/pages/custom/index"});return;}
    if(label === "优惠权益"){wx.navigateTo({url:"/pages/coupons/index"});return;}
    const map = { 实名认证: "realname", 学生认证: "student" };
    const d = map[e.currentTarget.dataset.label];
    if (!d) return this.unavailable();
    if (!session.token()) return this.goAccount();
    wx.navigateTo({ url: "/pages/" + d + "/form" });
  },
  openOrders(){wx.navigateTo({url:"/pages/orders/index"});},
  unavailable() {
    wx.showToast({ title: "此入口暂未开放", icon: "none" });
  },
  closeLogin() {
    this.setData({ loginVisible: false });
  },
  goAccount() {
    if (!require("../../session/storage").token()) {
      this.setData({ loginVisible: true });
      return;
    }
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
    } catch (error) {
      wx.showToast({ title: error.message + " 本地已退出", icon: "none" });
    } finally {
      // 退出会使原页面的会话代次失效，由游客页面重新读取状态。
      if (!session.token()) wx.reLaunch({ url: "/pages/mine/index" });
    }
  },
});
