const successToast = require("../../services/success-toast");
const api = require("../../services/props");
const instanceCounts = { total:"管理总量", pendingLabel:"待贴标", idle:"空闲", locked:"锁定", renting:"租赁中",
  repairing:"维修中", lost:"丢失", scrapped:"报废", retired:"退库" };
const stockCounts = { totalQuantity:"总量", rentableBaseQuantity:"可租基数", availableQuantity:"当前可用",
  lockedQuantity:"锁定", rentingQuantity:"租赁中", lostQuantity:"累计丢失", scrappedQuantity:"累计报废" };
require("../../session/page")({
  data: {
    id: "",
    sku: null,
    message: "",
    busy: false,
    counts: [],
    inventoryError: "",
    dialog: false,
    reason: "",
    action: "",
  },
  onLoad(q) {
    this.setData({ id: q.id || "" });
  },
  onShow() {
    return this.load();
  },
  async load() {
    const round = this.loadRound = (this.loadRound || 0) + 1;
    this.setData({ busy: true, inventoryError: "" });
    try {
      const sku = await api.request("me/factory-props/" + this.data.id);
      if (round !== this.loadRound) return;
      this.setData({ sku, state: api.names[sku.skuStatus], message: "",
        ...(this.data.sku?.id === sku.id && sku.inventorySummary ? {} : { counts: [] }) });
      if (!sku.inventorySummary) return;
      const isA = sku.assetType === "A_ASSET";
      try {
        const summary = await api.request("me/factory-props/" + sku.id + (isA ? "/instance-summary" : "/stock"));
        if (round === this.loadRound) this.setData({ counts: Object.entries(isA ? instanceCounts : stockCounts)
          .map(([key, label]) => ({ label, value: summary[key] == null ? "—" : summary[key] })) });
      } catch (e) {
        if (round === this.loadRound) this.setData({ inventoryError: e.message });
      }
    } catch (e) {
      if (round === this.loadRound) this.setData({ sku: null, counts: [], message: e.message });
    } finally {
      if (round === this.loadRound) this.setData({ busy: false });
    }
  },
  update() { wx.navigateTo({ url: "/pages/props/form?mode=update&id=" + this.data.id }); },
  edit() {
    wx.navigateTo({ url: "/pages/props/form?mode=edit&id=" + this.data.id });
  },
  inventory() {
    wx.navigateTo({ url: "/pages/inventory/index?id=" + this.data.id });
  },
  adjust() { wx.navigateTo({ url: "/pages/inventory/adjust?id=" + this.data.id }); },
  movements() { wx.navigateTo({ url: "/pages/inventory/movements?id=" + this.data.id }); },
  history() {
    wx.navigateTo({ url: "/pages/props/reviews?skuId=" + this.data.id });
  },
  status(e) {
    this.setData({
      dialog: true,
      message: "",
      action: e.currentTarget.dataset.action,
      reason: "",
    });
  },
  close() {
    if (!this.data.busy) this.setData({ dialog: false, message: "" });
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
      wx.navigateTo({ success: () => successToast("申请已提交"),
        url: "/pages/props/review?type=sku_audit&id=" + r.targetId,
      });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
});
