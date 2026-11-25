const { minuteFields } = require("../../services/display-time");
const api = require("../../services/props"),
  session = require("../../session/storage");
require("../../session/page")({
  data: {
    id: "",
    sku: null,
    items: [],
    message: "",
    busy: false,
    page: 1,
    total: "0",
  },
  onLoad(q) {
    this.setData({ id: q.id || "" });
  },
  onShow() {
    return this.load();
  },
  async load() {
    const round = this.loadRound = (this.loadRound || 0) + 1;
    this.setData({ busy: true, message: "" });
    try {
      const path = "me/factory-props/" + this.data.id;
      const sku = await api.request(path);
      if (round !== this.loadRound) return;
      const list = sku.inventorySummary !== null && sku.assetType === "A_ASSET"
        ? await api.request(path + "/instances?" + api.query({ page: this.data.page }))
        : { items: [], total: "0" };
      if (round !== this.loadRound) return;
      this.setData({ sku, total: list.total, items: list.items.map(i => ({
        ...minuteFields(i, ["statusChangedAt"]), state: api.names[i.instanceStatus],
      })) });
    } catch (e) {
      if (round === this.loadRound) this.setData({ sku: null, items: [], total: "0", message: e.message });
    } finally {
      if (round === this.loadRound) this.setData({ busy: false });
    }
  },
  logs(e) { wx.navigateTo({url:"/pages/inventory/logs?id="+e.currentTarget.dataset.id+"&skuId="+this.data.id+"&source="+((this._navigationQuery||{}).source==="ledger"?"ledger":"sku")}); },
  scan: require("../../navigation/prop-scan").openScanner,
  async repair(e) {
    const sn = this.data.items.find((x) => x.id === e.currentTarget.dataset.id);
    const owner = session.capture();
    wx.showModal({
      title: "确认维修完成？",
      content: "确认实物已维修完成，恢复空闲后可参与租期计算。",
      editable: true,
      placeholderText: "请填写维修完成说明",
      success: async (r) => {
        if (!r.confirm || !r.content?.trim() || !session.isCurrent(owner))
          return;
        this.setData({ busy: true });
        try {
          await api.command(
            "repair-" + sn.id,
            "repair_complete",
            "me/prop-instances/" + sn.id + "/repair-complete",
            { expectedVersion: sn.version, reason: r.content.trim() },
          );
          await this.load();
        } catch (e) {
          this.setData({ message: e.message });
        } finally {
          this.setData({ busy: false });
        }
      },
    });
  },
  next() {
    if (this.data.page * 20 < Number(this.data.total)) {
      this.setData({ page: this.data.page + 1 });
      this.load();
    }
  },
  prev() {
    if (this.data.page > 1) {
      this.setData({ page: this.data.page - 1 });
      this.load();
    }
  },
});
