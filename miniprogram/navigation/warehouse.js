const api = require("../services/props");
const warehouseFilters = [
  { key: "assetType", title: "道具类型", options: [
    { code: "", label: "全部类型" }, { code: "A_ASSET", label: "A 类" }, { code: "B_CONSUMABLE", label: "B 类" },
  ] },
  { key: "tab", title: "上架状态", options: [
    { code: "", label: "全部状态" }, { code: "pending", label: "待审核" },
    { code: "online", label: "已上架" }, { code: "offline", label: "已下架" },
  ] },
];

module.exports = {
  data: {
    warehouseFilters,
    warehouseLoaded: false,
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
    const filters = {
      page: this.data.page,
      keyword: this.data.submittedKeyword || undefined,
      assetType: this.data.assetType || undefined,
    };
    if (this.data.tab === "pending") filters.auditing = true;
    else if (this.data.tab) filters.skuStatus = this.data.tab;
    const query = api.query(filters);
    const changed = query !== this.warehouseQuery;
    this.warehouseQuery = query;
    this.setData({ busy: true, message: "", ...(changed ? { items: [], total: "0", warehouseLoaded: false } : {}) });
    try {
      const r = await api.request("me/factory-props?" + query);
      if (round !== this.warehouseRound) return;
      this.setData({
        items: r.items.map((x) => ({ ...x, state: api.names[x.skuStatus] })),
        total: r.total, warehouseLoaded: true,
      });
    } catch (e) {
      if (round === this.warehouseRound) this.setData({ items: [], warehouseLoaded: false, message: e.message });
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
  resetWarehouse() {
    this.setData({ keyword: "", submittedKeyword: "", assetType: "", tab: "", page: 1 });
    return this.load();
  },
  selectWarehouseFilter(e) {
    const { field, value } = e.detail;
    if (field !== "assetType" && field !== "tab") return;
    this.setData({ [field]: value, page: 1 });
    return this.load();
  },
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
