const api = require("../../services/factory");
require("../../session/page")({
  data: { message: "", capability: null },
  onShow() { return this.load(); },
  async load() {
    this.setData({ message: "" });
    try {
      this.setData({
        capability: await api.request("factory-phone/capability"),
      });
    } catch (e) {
      this.setData({ capability: null, message: e.message });
    }
  },
  back() {
    this.navigationBack();
  },
});
