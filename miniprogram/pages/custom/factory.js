const c = require("../../services/custom"),
  ui = require("../../services/trading-page");
require("../../session/page")({
  data: { id: "", factory: null, reference: null, busy: false, message: "" },
  onLoad(q) {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    const source = pages[pages.length - 2];
    const prop = source?.data.item;
    const reference = source?.route === "pages/props/product" && source.data.verified && prop?.factory?.id === q.id
      ? { id: prop.skuId, name: prop.propName } : null;
    this.setData({ id: q.id, reference });
  },
  onShow() {
    ui.show(this);
    return this.refresh();
  },
  onHide() {
    ui.hide(this);
  },
  onUnload() {
    ui.hide(this);
  },
  refresh() {
    return ui.run(this, async (cur) => {
      const factory = await c.get("/api/custom-factories/" + this.data.id);
      if (cur()) this.setData({ factory });
    });
  },
  onAccessLost() {
    this.setData({ factory: null });
  },
  create(e) {
    if (this.data.busy || !this.data.factory) return;
    let url = "/pages/custom/form?factoryId=" + this.data.id;
    const mode = e?.currentTarget.dataset.mode;
    if (mode === "reference" && this.data.reference) url += "&skuId=" + this.data.reference.id;
    if (mode === "template") url += "&mode=template";
    wx.navigateTo({ url });
  },
});
