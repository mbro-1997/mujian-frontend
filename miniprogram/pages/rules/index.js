const registration = require("../../services/registration"),
  http = require("../../services/http");
require("../../session/page")({
  data: {
    rules: [],
    document: null,
    busy: false,
    message: "",
    register: false,
    agreed: false,
  },
  onLoad(q) {
    this.setData({ register: q.register === "1" });
    this.documentId = q.id || "";
    this.load();
  },
  async load() {
    this.setData({ busy: true, message: "" });
    try {
      if (this.documentId)
        this.setData({
          document: await http.request("/api/public/rules/" + this.documentId),
        });
      else this.setData({ rules: (await registration.rules()).rules });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  agreement(e) {
    this.setData({ agreed: e.detail.value.includes("agree") });
  },
  accept() {
    if (!this.data.agreed || this.data.rules.length !== 5) return;
    this.getOpenerEventChannel().emit("consentConfirmed", this.data.rules);
    wx.navigateBack();
  },
  open(e) {
    wx.navigateTo({
      url: "/pages/rules/index?id=" + e.currentTarget.dataset.id,
    });
  },
  back() {
    wx.navigateBack();
  },
});
