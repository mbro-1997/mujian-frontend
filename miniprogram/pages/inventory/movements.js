const { minuteFields } = require("../../services/display-time");
const api = require("../../services/props");
const labels = {
  totalQuantity: "总量",
  rentableBaseQuantity: "可租基数",
  availableQuantity: "当前可用",
  lockedQuantity: "锁定",
  rentingQuantity: "在租",
  lostQuantity: "累计丢失",
  scrappedQuantity: "累计报废",
};
require("../../session/page")({
  data: {
    id: "",
    items: [],
    page: 1,
    total: "0",
    message: "",
    busy: false,
    startDate: "",
    endDate: "",
    source: "",
    sourceIndex: 0,
    movementIndex: 0,
    movement: "",
    sources: [
      "",
      "manual_adjustment",
      "order_fulfillment",
      "arbitration",
      "system_correction",
    ],
    sourceLabels: ["全部来源", "人工调整", "订单履约", "仲裁", "系统校正"],
    types: [
      "",
      "increase",
      "decrease",
      "abnormal_decrease",
      "outbound",
      "return",
      "lock",
      "release",
      "arbitration_decrease",
    ],
    typeLabels: [
      "全部类型",
      "增加",
      "减少",
      "异常扣减",
      "出库",
      "归还",
      "锁定",
      "释放",
      "仲裁扣减",
    ],
  },
  onLoad(q) {
    this.setData({ id: q.id || "" });
  },
  onShow(){return this.load();},
  async load() {
    const round=this.listRound=(this.listRound||0)+1;
    this.setData({ busy: true, message: "", sourceIndex:Math.max(0,this.data.sources.indexOf(this.data.source)), movementIndex:Math.max(0,this.data.types.indexOf(this.data.movement)) });
    try {
      const r = await api.request(
        "me/factory-props/" +
          this.data.id +
          "/movements?" +
          api.query({
            page: this.data.page,
            startDate: this.data.startDate,
            endDate: this.data.endDate,
            sourceType: this.data.source,
            movementType: this.data.movement,
          }),
      );
      if(round!==this.listRound)return;
      this.setData({
        items: r.items.map((x) => ({
          ...minuteFields(x, ["createdAt"]),
          type: api.names[x.movementType] || x.movementType,
          values: Object.entries(labels).map(([k, label]) => ({
            label,
            before: x.before ? x.before[k] : "—",
            after: x.after ? x.after[k] : "—",
          })),
        })),
        total: r.total,
      });
    } catch (e) {
      if(round===this.listRound)this.setData({ message: e.message });
    } finally {
      if(round===this.listRound)this.setData({ busy: false });
    }
  },
  filter(e) {
    const k = e.currentTarget.dataset.key;
    this.setData({
      [k]:
        k === "source"
          ? this.data.sources[e.detail.value]
          : k === "movement"
            ? this.data.types[e.detail.value]
            : e.detail.value,
      page: 1,
    });
    this.load();
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
