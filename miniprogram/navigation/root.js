const account = require("../services/account"),
  session = require("../session/storage"),
  factory = require("../services/factory"),
  routes = require("../constants/routes"),
  warehouse = require("./warehouse");
const menu = [
  { key: "orders", label: "租赁订单" },
  { key: "merchant", label: "收款账户" },
  { key: "custom", label: "定制需求与订单" },
  { key: "reviews", label: "道具与库存申请" },
  { key: "ledger", label: "库存流水" },
  { key: "extension", label: "延期申请" },
  { key: "claims", label: "索赔与仲裁" },
  { key: "finance", label: "资金结算" },
  { key: "ratings", label: "评价管理" },
  { key: "support", label: "平台客服" },
];
module.exports = function (index, renter) {
  const oldShow = renter.onShow;
  const inlineLogin = require("./login-page");
  const opts = {
    ...inlineLogin,
    ...renter,
    ...(index === 2 ? warehouse : {}),
    data: {
      ...inlineLogin.data,
      ...renter.data,
      catalogTabRoot: true,
      ...(index === 2 ? warehouse.data : {}),
      rootIndex: index,
      rootReady: false,
      factoryRoot: false,
      rootLoading: false,
      rootMessage: "",
      factoryProfile: null,
      factoryContext: null,
      factoryMenus: menu,
      tradeOverview: null, tradeOrders: [], tradePage: 0, tradeTotal: "0", tradeMessage: "", tradeBusy: false,
    },
    async onShow() {
      return this.resolveRoot();
    },
    onHide() {
      this.rootRound = (this.rootRound || 0) + 1;
      this.setData({ tradeBusy: false });
      renter.onHide?.call(this);
    },
    async resolveRoot() {
      const round = (this.rootRound = (this.rootRound || 0) + 1),
        owner = session.capture();
      // Keep the mounted page during same-session revalidation; session/page clears it on identity loss.
      this.setData({ rootLoading: true, rootMessage: "" });
      try {
        const c = session.token() ? await account.context() : null;
        session.assertCurrent(owner);
        if (round !== this.rootRound) return;
        if (
          c &&
          c.roleCode === null &&
          c.registrationStage !== "new" &&
          c.accessMode !== "restricted"
        ) {
          wx.navigateTo({ url: "/pages/factory/index" });
          return;
        }
        const isFactory = !!c && c.roleCode === "supplier";
        this.getTabBar().setData({
          selected: index,
          items: routes.items(c),
          hidden: !!this.data.schemeProp,
        });
        if (wx.setNavigationBarTitle)
          wx.setNavigationBarTitle({ title: routes.items(c)[index].text });
        this.setData({ factoryRoot: isFactory, factoryContext: c });
        if (isFactory) {
          const profile = await factory.request("factory-profile");
          session.assertCurrent(owner);
          if (round !== this.rootRound) return;
          require("./state").bind(c, profile.id);
          this.setData({ factoryProfile: profile, rootReady: true });
          this.restoreNavigationState();
          if (index === 2) await this.load();
          if (index === 0 && (!this.data.tradePage ||
              this.tradeRevision !== require("../services/trading").revision.orders ||
              (this.tradeDeadline && Date.now() >= this.tradeDeadline))) await this.factoryOrdersLoad();
        } else if (index === 3) {
          this.setData({
            rootReady: true,
            context: c,
            identity: c
              ? { demander_bound: "租赁方", new: "尚未选择身份" }[
                  c.registrationStage
                ] || "账号待完善"
              : "",
            ready: false,
            restricted: !!c && c.accessMode === "restricted",
            message: "",
          });
        } else {
          this.setData({ rootReady: true });
          if (index === 0 && c?.roleCode === "demander" && c.userStatus === "active")
            this.selectComponent?.("#couponOffers")?.open(c.userId);
          if (oldShow) await oldShow.call(this);
        }
      } catch (e) {
        if (
          !session.isCurrent(owner) &&
          session.token() === owner.token &&
          owner.token
        )
          return this.resolveRoot();
        if (session.isCurrent(owner) && round === this.rootRound)
          this.setData({ rootMessage: e.message, rootReady: false });
      } finally {
        if (session.isCurrent(owner) && round === this.rootRound)
          this.setData({ rootLoading: false });
      }
    },
    async factoryOrdersLoad(e, append=false) {
      if(this.data.tradeBusy)return;
      const api = require("../services/trading"), owner = session.capture(), round = this.rootRound;
      const revision = api.revision.orders;
      const startedAt = Date.now();
      if (revision !== this.tradeRevision || (this.tradeDeadline && startedAt >= this.tradeDeadline)) append = false;
      this.tradeRetryAppend = append;
      this.setData({tradeBusy: true, tradeMessage: ""});
      const current = () => session.isCurrent(owner) && round === this.rootRound;
      try {
        const lastPage = append ? this.data.tradePage + 1 : Math.max(1, this.data.tradePage);
        const overview = append ? this.data.tradeOverview : await api.get("/api/me/factory-orders/overview");
        if (!current()) return;
        const rows = append ? this.data.tradeOrders.slice() : [], seen = new Set(rows.map(item => item.id));
        let total = "0", loadedPage = 0, exhausted = false;
        for (let page = append ? lastPage : 1; page <= lastPage; page++) {
          const result = await api.get("/api/me/factory-orders?view=factory_pending&page=" + page);
          if (!current()) return;
          const before = rows.length;
          for (const item of result.items) {
            if (seen.has(item.id)) continue;
            rows.push(api.order(item));
            seen.add(item.id);
          }
          total = result.total;
          loadedPage = page;
          exhausted = rows.length === before || rows.length >= Number(total);
          if (exhausted) break;
        }
        let deadline = 0;
        for (const row of rows) {
          for (const raw of [row.nextDeadlineAt, row.orderStatus === 'pending_accept' && row.acceptDeadlineAt]) {
            const time = raw && api.dateMillis(raw);
            if (time > startedAt && (!deadline || time < deadline)) deadline = time;
          }
        }
        this.tradeDeadline = deadline;
        this.tradeRevision = revision;
        this.setData({ tradeOverview: overview, tradeOrders: rows, tradePage: loadedPage, tradeTotal: total, tradeExhausted: exhausted });
      } catch (error) {
        if (current()) {
          if ([401,403,404].includes(error.status)) this.setData({ tradeOrders: [], tradeOverview: null, tradePage: 0, tradeTotal: "0" });
          this.setData({tradeMessage: api.message(error)});
        }
      } finally {
        if (current()) this.setData({tradeBusy: false});
      }
    },
    factoryOrdersRetry() { return this.factoryOrdersLoad(null, !!this.tradeRetryAppend); },
    factoryOrdersMore() {
      if (!this.data.tradeExhausted && this.data.tradeOrders.length < Number(this.data.tradeTotal)) return this.factoryOrdersLoad(null, true);
    },
    factoryOrder(e){wx.navigateTo({url:"/pages/factory/order?id="+e.currentTarget.dataset.id});},
    factoryOrderList(e){wx.navigateTo({url:"/pages/factory/orders?view="+(e.currentTarget.dataset.view||"all")});},
    factoryOpen(e) {
      const key = e.currentTarget.dataset.key;
      const paths = {
        orders: "/pages/factory/orders",
        custom: "/pages/factory/custom",
        merchant: "/pages/factory/merchant",
        extension: "/pages/factory/extensions",
        claims: "/pages/factory/disputes",
        finance: "/pages/factory/settlements",
        reviews: "/pages/props/reviews",
        support: "/pages/service/index",
        ratings: "/pages/factory/ratings",
        ledger: "/pages/inventory/select",
        profile: "/pages/factory/profile",
        phone: "/pages/factory/phone",
        rules: "/pages/factory/rules?readOnly=1",
        account: "/pages/account/index?return=/pages/mine/index",
      };
      if (paths[key]) wx.navigateTo({ url: paths[key] });
      else wx.showToast({ title: "此服务暂未开放", icon: "none" });
    },
    factoryCreate(e) {
      if (
        this.data.rootLoading ||
        !this.data.factoryProfile ||
        this.data.factoryContext.accessMode === "restricted" ||
        this.data.factoryProfile.factoryStatus !== "active"
      )
        return;
      const type = e.currentTarget.dataset.type;
      if (["A_ASSET", "B_CONSUMABLE"].includes(type))
        wx.navigateTo({ url: "/pages/props/form?assetType=" + type });
    },
    async factoryLogout() {
      try {
        await account.logout();
      } catch (e) {
        wx.showToast({ title: e.message, icon: "none" });
      }
      if (!session.token()) wx.switchTab({ url: routes.tabs[0] });
    },
    onSessionReset() {
      if (renter.onSessionReset) renter.onSessionReset.call(this);
      this.rootRound = (this.rootRound || 0) + 1;
      const bar = this.getTabBar && this.getTabBar();
      if (bar) bar.setData({ items: routes.items(null), selected: index });
    },
  };
  // 仓库与清单复用Tab，事件按已确认身份分派，避免同名覆盖。
  if (index === 2)
    for (const [name, handler] of Object.entries(warehouse)) {
      if (typeof handler !== "function" || name === "onShow") continue;
      const renterHandler = renter[name];
      if (renterHandler)
        opts[name] = function (...args) {
          return (this.data.factoryRoot ? handler : renterHandler).apply(
            this,
            args,
          );
        };
    }
  require("../session/page")(opts);
};
