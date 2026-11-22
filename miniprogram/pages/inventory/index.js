const { minuteFields } = require("../../services/display-time");
const api = require("../../services/props"),
  session = require("../../session/storage");
require("../../session/page")({
  data: {
    id: "",
    sku: null,
    summary: [],
    stock: null,
    items: [],
    message: "",
    busy: false,
    page: 1,
    total: "0",
    status: "",
    statusIndex: 0,
    statuses: [
      "",
      "pending_label",
      "idle",
      "locked",
      "renting",
      "repairing",
      "lost",
      "scrapped",
      "retired",
    ],
    labels: [
      "全部",
      "待贴标",
      "空闲",
      "锁定",
      "租赁中",
      "维修中",
      "丢失",
      "报废",
      "已退库",
    ],
  },
  onLoad(q) {
    this.setData({ id: q.id || "" });
  },
  onShow() {
    this.load();
  },
  async load() {
    this.setData({ busy: true, message: "", statusIndex: Math.max(0,this.data.statuses.indexOf(this.data.status)) });
    try {
      const sku = await api.request("me/factory-props/" + this.data.id);
      this.setData({ sku });
      if (sku.assetType === "A_ASSET") {
        const [summary, list] = await Promise.all([
          api.request("me/factory-props/" + this.data.id + "/instance-summary"),
          api.request(
            "me/factory-props/" +
              this.data.id +
              "/instances?" +
              api.query({ page: this.data.page, status: this.data.status }),
          ),
        ]);
        this.setData({
          summary: Object.entries(summary).map(([k, v]) => ({
            label: {
              total: "管理总量",
              pendingLabel: "待贴标",
              idle: "空闲",
              locked: "锁定",
              renting: "租赁中",
              repairing: "维修",
              lost: "丢失",
              scrapped: "报废",
              retired: "退库",
            }[k],
            value: v,
          })),
          items: list.items.map((i) => ({
            ...minuteFields(i, ["statusChangedAt"]),
            state: api.names[i.instanceStatus],
          })),
          total: list.total,
        });
      } else
        this.setData({
          stock: await api.request(
            "me/factory-props/" + this.data.id + "/stock",
          ),
        });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  filter(e) {
    this.setData({ status: this.data.statuses[e.detail.value], statusIndex: Number(e.detail.value), page: 1 });
    this.load();
  },
  logs(e) { wx.navigateTo({url:"/pages/inventory/logs?id="+e.currentTarget.dataset.id+"&skuId="+this.data.id+"&source="+((this._navigationQuery||{}).source==="ledger"?"ledger":"sku")}); },
  adjust() {
    wx.navigateTo({ url: "/pages/inventory/adjust?id=" + this.data.id });
  },
  movements() {
    wx.navigateTo({ url: "/pages/inventory/movements?id=" + this.data.id });
  },
  qr(e) {
    wx.navigateTo({
      url: "/pages/props/scan/index?id=" + e.currentTarget.dataset.code,
    });
  },
  scan() {
    wx.navigateTo({ url: "/pages/props/scan/index" });
  },
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
