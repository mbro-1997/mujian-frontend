const session = require("../../session/storage"),
  registration = require("../../services/registration"),
  routes = require("../../constants/routes");
Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(value) {
        this.epoch = (this.epoch || 0) + 1;
        this.syncTabBar(value);
        if (value) this.loadRules();
      },
    },
    returnPath: { type: String, value: "/pages/home/index" },
  },
  data: { rules: [], agreed: false, busy: false, message: "", conflict: false },
  lifetimes: {
    attached() {
      this.alive = true;
      this.ownerPage = getCurrentPages().slice(-1)[0];
      this.syncTabBar(this.properties.visible);
      this.unsubscribe = session.subscribe(() => {
        this.epoch = (this.epoch || 0) + 1;
        this.setData({
          rules: [],
          agreed: false,
          busy: false,
          message: "",
          conflict: false,
        });
      });
    },
    detached() {
      this.syncTabBar(false);
      this.alive = false;
      this.epoch = (this.epoch || 0) + 1;
      if (this.unsubscribe) this.unsubscribe();
    },
  },
  pageLifetimes: {
    show() {
      this.syncTabBar(this.properties.visible);
    },
    hide() {
      if (this.data.busy) {
        this.epoch = (this.epoch || 0) + 1;
        this.setData({ busy: false });
      }
      this.syncTabBar(false);
    },
  },
  methods: {
    syncTabBar(hidden) {
      const bar =
        this.ownerPage &&
        this.ownerPage.getTabBar &&
        this.ownerPage.getTabBar();
      if (bar) bar.setData({ hidden: !!hidden });
    },
    async loadRules() {
      const owner = session.capture(),
        epoch = this.epoch;
      try {
        const result = await registration.rules();
        if (
          this.alive &&
          this.properties.visible &&
          epoch === this.epoch &&
          session.isCurrent(owner)
        )
          this.setData({ rules: result.rules, message: "" });
      } catch (e) {
        if (this.alive && epoch === this.epoch && session.isCurrent(owner))
          this.setData({ message: e.message });
      }
    },
    close() {
      this.epoch = (this.epoch || 0) + 1;
      this.setData({ busy: false, message: "", agreed: false });
      this.triggerEvent("close");
    },
    stop() {},
    agreement(e) {
      this.setData({ agreed: e.detail.value.includes("agree") });
    },
    rules() {
      const owner = session.capture(),
        epoch = this.epoch;
      wx.navigateTo({
        url: "/pages/rules/index?register=1",
        events: {
          consentConfirmed: (rules) => {
            if (this.alive && epoch === this.epoch && session.isCurrent(owner))
              this.setData({ rules, agreed: true });
          },
        },
      });
    },
    async phone(e) {
      if (this.data.busy) return;
      if (!this.data.agreed || this.data.rules.length !== 5) return;
      const authorizationFailure = require("../../services/phone-authorization").failure(
        e.detail,
        require("../../config/environment").development,
      );
      if (authorizationFailure) {
        this.setData({ message: authorizationFailure });
        return;
      }
      const loginReturn = routes.safeReturn(this.properties.returnPath);
      const epoch = this.epoch,
        owner = session.capture();
      this.setData({ busy: true, message: "", conflict: false });
      try {
        const result = await registration.login(
          e.detail.code,
          this.data.rules,
          () => this.alive && this.properties.visible && this.epoch === epoch,
        );
        if (this.alive && session.isCurrent(result.owner)) {
          this.triggerEvent("authenticated", {
            returnPath: loginReturn,
            context: result.result.context,
          });
        }
      } catch (e) {
        if (this.alive && this.epoch === epoch && session.isCurrent(owner)) {
          this.setData({
            message: e.message,
            conflict: e.reason === "LOGIN_IDENTITY_CONFLICT",
          });
          if (e.reason === "RULE_VERSION_CHANGED") {
            this.setData({ agreed: false });
            this.loadRules();
          }
        }
      } finally {
        if (this.alive && this.epoch === epoch && session.isCurrent(owner))
          this.setData({ busy: false });
      }
    },
  },
});
