const { minuteFields } = require("../../services/display-time");
const api = require("../../services/props");
require("../../session/page")({
  data: {
    categoryIndex: 0, assetIndex: 0, statusIndex: 0,
    skuId: "",
    items: [],
    message: "",
    busy: false,
    status: "all",
    category: "",
    assetType: "",
    counts: { total: "0", sku: "0", inventory: "0", skuStatus: "0" },
    categories: ["", "sku", "inventory", "sku_status"],
    categoryLabels: ["全部分类", "道具资料", "库存调整", "上下架 / 状态"],
    assetTypes: ["", "A_ASSET", "B_CONSUMABLE"],
    assetLabels: ["全部资产", "A 类", "B 类"],
    statuses: ["all", "pending", "approved", "rejected", "cancelled"],
    labels: ["全部状态", "待审核", "已通过", "未通过", "已撤回"],
    page: 1,
    total: "0",
  },
  onLoad(q) {
    this.setData({ skuId: q.skuId || "" });
  },
  onShow() {
    this.load();
  },
  async load() {
    this.setData({ categoryIndex: Math.max(0,this.data.categories.indexOf(this.data.category)), assetIndex: Math.max(0,this.data.assetTypes.indexOf(this.data.assetType)), statusIndex: Math.max(0,this.data.statuses.indexOf(this.data.status)) });
    const round=this.listRound=(this.listRound||0)+1;
    this.setData({ busy: true, message: "" });
    try {
      const p = await api.request(
        "me/prop-reviews?" +
          api.query({
            skuId: this.data.skuId,
            auditStatus: this.data.status,
            reviewCategory: this.data.category,
            assetType: this.data.assetType,
            page: this.data.page,
          }),
      );
      if(round!==this.listRound)return;
      this.setData({
        counts: p.pendingCounts,
        items: p.items.map((x) => ({
          ...minuteFields(x, ["submittedAt"]),
          rowKey: x.sourceType + x.id,
          state: api.names[x.auditStatus],
          action: api.names[x.actionType],
        })),
        total: p.total,
      });
    } catch (e) {
      if(round===this.listRound)this.setData({ message: e.message });
    } finally {
      if(round===this.listRound)this.setData({ busy: false });
    }
  },
  category(e) {
    this.setData({ category: this.data.categories[e.detail.value], page: 1 });
    this.load();
  },
  asset(e) {
    this.setData({ assetType: this.data.assetTypes[e.detail.value], page: 1 });
    this.load();
  },
  filter(e) {
    this.setData({ status: this.data.statuses[e.detail.value], page: 1 });
    this.load();
  },
  open(e) {
    wx.navigateTo({
      url:
        "/pages/props/review?type=" +
        e.currentTarget.dataset.type +
        "&id=" +
        e.currentTarget.dataset.id,
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
