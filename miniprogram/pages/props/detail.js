const api = require("../../services/props");
require("../../session/page")({
  data: {
    id: "",
    sku: null,
    message: "",
    busy: false,
    dialog: false,
    reason: "",
    action: "",
  },
  onLoad(q) {
    this.setData({ id: q.id || "" });
  },
  onShow() {
    this.load();
  },
  async load() {
    this.setData({ busy: true });
    try {
      const sku = await api.request("me/factory-props/" + this.data.id);
      this.setData({ sku, state: api.names[sku.skuStatus], message: "" });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  update() { wx.navigateTo({ url: "/pages/props/form?mode=update&id=" + this.data.id }); },
  edit() {
    wx.navigateTo({ url: "/pages/props/form?mode=edit&id=" + this.data.id });
  },
  inventory() {
    wx.navigateTo({ url: "/pages/inventory/index?id=" + this.data.id });
  },
  review() {
    wx.navigateTo({
      url:
        "/pages/props/review?type=sku_audit&id=" +
        this.data.sku.pendingApplicationId,
    });
  },
  history() {
    wx.navigateTo({ url: "/pages/props/reviews?skuId=" + this.data.id });
  },
  status(e) {
    this.setData({
      dialog: true,
      action: e.currentTarget.dataset.action,
      reason: "",
    });
  },
  close() {
    if (!this.data.busy) this.setData({ dialog: false });
  },
  input(e) {
    this.setData({ reason: e.detail.value });
  },
  async confirm() {
    if (this.data.busy || !this.data.reason.trim()) return;
    this.setData({ busy: true, message: "" });
    try {
      const r = await api.command(
        "status-" + this.data.id,
        "change_sku_status",
        "me/factory-props/" + this.data.id + "/status-applications",
        {
          expectedSkuVersion: this.data.sku.version,
          actionType: this.data.action,
          applyRemark: this.data.reason.trim(),
        },
      );
      this.setData({ dialog: false });
      wx.navigateTo({
        url: "/pages/props/review?type=sku_audit&id=" + r.targetId,
      });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
});
