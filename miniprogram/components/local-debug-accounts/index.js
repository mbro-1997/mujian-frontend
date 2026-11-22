const debug = require("../../services/local-debug-accounts");
Component({
  options: { virtualHost: true },
  data: { visible: false, busy: false, message: "" },
  lifetimes: { attached() { this.setData({ visible: debug.available() }); } },
  methods: {
    async choose(e) {
      if (this.data.busy) return;
      this.setData({ busy: true, message: "" });
      try {
        await debug.switchAccount(e.currentTarget.dataset.role, { logoutFirst: true });
      } catch (error) {
        this.setData({ busy: false, message: error.message || "切换失败，请重试。" });
        this.triggerEvent("switchfailed");
      }
    },
  },
});
