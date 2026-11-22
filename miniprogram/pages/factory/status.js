const { minuteFields } = require("../../services/display-time");
const api = require("../../services/factory");
const labels = {
  pending: "审核中",
  approved: "审核已通过",
  rejected: "审核未通过",
  cancelled: "已取消",
};
require("../../session/page")({
  data: {
    mode: "onboarding",
    application: null,
    fields: null,
    label: "",
    message: "",
    busy: false,
    historyId: "",
  },
  onLoad(q) {
    this.setData({
      mode: q.mode === "change" ? "change" : "onboarding",
      historyId: q.id || "",
    });
  },
  onShow() {
    this.load();
  },
  async load() {
    this.setData({ busy: true });
    try {
      const name = api.domain(this.data.mode);
      const out = await api.request(
        name + (this.data.historyId ? "/" + this.data.historyId : "/current"),
      );
      const a = this.data.historyId ? out : out.application;
      this.setData({
        application: minuteFields(a, ["submittedAt", "reviewedAt"]),
        label: a ? labels[a.auditStatus] : "尚未提交申请",
        fields: a && (a.materials || a.proposed),
        message: "",
      });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  edit() {
    wx.navigateTo({ url: "/pages/factory/form?mode=" + this.data.mode });
  },
  profile() {
    wx.navigateTo({ url: "/pages/factory/profile" });
  },
  history() {
    wx.navigateTo({
      url:
        "/pages/factory/status?mode=" +
        this.data.mode +
        "&id=" +
        this.data.application.previousApplicationId,
    });
  },
  async preview(e) {
    try {
      const url = (
        await api.request(
          "factory-materials/view",
          "POST",
          e.currentTarget.dataset.locator,
        )
      ).url;
      wx.previewImage({ urls: [url] });
    } catch (e) {
      this.setData({ message: e.message });
    }
  },
});
