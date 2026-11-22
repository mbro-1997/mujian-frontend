const api = require("../services/props");
module.exports = {
  data: {
    items: [],
    message: "",
    busy: false,
    tab: "",
    assetType: "",
    selection: false,
    keyword: "",
    submittedKeyword: "",
    page: 1,
    total: "0",
  },
  onShow() {
    return this.load();
  },
  async load() {
    const round = this.warehouseRound = (this.warehouseRound || 0) + 1;
    this.setData({ busy: true, message: "" });
    try {
      const q = {
        page: this.data.page,
        keyword: this.data.submittedKeyword || undefined,
        assetType: this.data.assetType || undefined,
      };
      if (this.data.tab === "pending") q.auditing = true;
      else if (this.data.tab) q.skuStatus = this.data.tab;
      const r = await api.request("me/factory-props?" + api.query(q));
      if (round !== this.warehouseRound) return;
      this.setData({
        items: r.items.map((x) => ({ ...x, state: api.names[x.skuStatus] })),
        total: r.total,
      });
    } catch (e) {
      if (round === this.warehouseRound) this.setData({ items: [], message: e.message });
    } finally {
      if (round === this.warehouseRound) this.setData({ busy: false });
    }
  },
  searchInput(e) {
    this.setData({ keyword: e.detail.value });
  },
  search() {
    this.setData({ page: 1, submittedKeyword: this.data.keyword.trim() });
    this.load();
  },
  filter(e) {
    this.setData({ tab: e.currentTarget.dataset.tab, page: 1 });
    this.load();
  },
  asset(e) { this.setData({assetType:e.currentTarget.dataset.type,page:1}); this.load(); },
  open(e) {
    if (this.data.selection) {
      const item=this.data.items.find(x=>x.id===e.currentTarget.dataset.id);
      if(!item) return;
      wx.navigateTo({url:(item.assetType==="A_ASSET"?"/pages/inventory/index":"/pages/inventory/movements")+"?id="+item.id+"&source=ledger"}); return;
    }
    wx.navigateTo({
      url: "/pages/props/detail?id=" + e.currentTarget.dataset.id,
    });
  },
  create(e) {
    wx.navigateTo({
      url: "/pages/props/form?assetType=" + e.currentTarget.dataset.type,
    });
  },
  reviews() {
    wx.navigateTo({ url: "/pages/props/reviews" });
  },
  scan() {
    wx.navigateTo({ url: "/pages/props/scan/index" });
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
};
