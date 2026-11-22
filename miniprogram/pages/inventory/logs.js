const api = require("../../services/props");
const { displayTime } = require("../../services/display-time");

const sources = {
  manual_adjustment: "库存调整", repair_complete: "维修完成", order_fulfillment: "订单履约",
  arbitration: "仲裁处理", system_correction: "系统修正", label_confirm: "贴标确认",
};

require("../../session/page")({
  data: { id: "", skuId: "", items: [], page: 1, total: "0", busy: false, message: "" },
  onLoad(q) {
    this.setData({ id: q.id || "", skuId: q.skuId || "" });
  },
  onShow() { return this.load(); },
  load() { return this.readPage(this.retryPage || this.data.page); },
  async readPage(page) {
    const round = this.round = (this.round || 0) + 1;
    this.setData({ busy: true, message: "" });
    try {
      const result = await api.request("me/prop-instances/" + this.data.id + "/logs?" + api.query({ page }));
      if (round !== this.round) return;
      const items = result.items.map(row => ({
        ...row, from: row.fromStatus ? api.names[row.fromStatus] : "初始", to: api.names[row.toStatus],
        source: sources[row.sourceType] || row.sourceType, createdTime: displayTime(row.createdAt),
      }));
      this.retryPage = null;
      this.setData({ items, total: result.total, page });
    } catch (error) {
      if (round === this.round) {
        this.retryPage = page;
        this.setData({ items: [], message: error.message });
      }
    } finally {
      if (round === this.round) this.setData({ busy: false });
    }
  },
  next() {
    if (!this.data.busy && this.data.page * 20 < Number(this.data.total)) return this.readPage(this.data.page + 1);
  },
  prev() {
    if (!this.data.busy && this.data.page > 1) return this.readPage(this.data.page - 1);
  },
});
