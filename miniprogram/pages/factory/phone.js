const api = require("../../services/factory");
require("../../session/page")({
  data: { message: "", capability: null },
  async onShow() {
    try {
      this.setData({
        capability: await api.request("factory-phone/capability"),
      });
    } catch (e) {
      this.setData({ message: e.message });
    }
  },
  back() {
    wx.navigateBack();
  },
});
