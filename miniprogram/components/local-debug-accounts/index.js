const debug = require("../../services/local-debug-accounts");
Component({
  options: { virtualHost: true },
  data: { visible: false, busy: false, message: "" },
  lifetimes: { attached() { this.setData({ visible: debug.available() }); } },
  methods: {
    async choose(e) {
      if (this.data.busy) return;
      this.setData({ busy: true, message: "" });
      const role = e.currentTarget.dataset.role;
      const label = role === "supplier" ? "工厂" : "租赁方";
      try {
        const slot = await new Promise((resolve, reject) => wx.showActionSheet({
          itemList: [label + "1", label + "2"],
          success: ({ tapIndex }) => resolve(tapIndex + 1),
          fail: error => error.errMsg?.includes("cancel") ? resolve(null) : reject(new Error("无法打开账号选择，请重试。")),
        }));
        if (slot !== null) await debug.switchAccount(role, { slot, logoutFirst: true });
      } catch (error) {
        this.setData({ message: error.message || "切换失败，请重试。" });
        this.triggerEvent("switchfailed");
      } finally {
        this.setData({ busy: false });
      }
    },
  },
});
