const api = require("../../services/factory"),
  account = require("../../services/account");
require("../../session/page")({
  data: { code: "", busy: false, message: "" },
  input(e) {
    this.setData({ code: e.detail.value });
  },
  async claim() {
    if (this.data.busy) return;
    this.setData({ busy: true, message: "" });
    try {
      await api.request("factory-invitations/claim", "POST", {
        inviteCode: this.data.code,
      });
      await account.context();
      wx.redirectTo({ url: "/pages/factory/form" });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
});
