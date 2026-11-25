const { minuteFields } = require("../../services/display-time");
const api = require("../../services/props");
require("../../session/page")({
  data: {
    skuId: "",
    items: [],
    message: "",
    busy: false,
    page: 1,
    total: "0",
  },
  onLoad(q) {
    this.setData({ skuId: q.skuId || "" });
  },
  onShow() {
    return this.load();
  },
  async load() {
    const round=this.listRound=(this.listRound||0)+1;
    this.setData({ busy: true, message: "" });
    try {
      const p = await api.request(
        "me/prop-reviews?" +
          api.query({
            skuId: this.data.skuId,
            page: this.data.page,
          }),
      );
      if(round!==this.listRound)return;
      this.setData({
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
