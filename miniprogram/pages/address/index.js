const api = require("../../services/planning"),
  ui = require("../../services/planning-page");
require("../../session/page")({
  data: {
    items: [],
    page: 0,
    total: "0",
    busy: false,
    message: "",
    select: false,
  },
  onLoad(q) {
    this.setData({ select: q.select === "1" });
  },
  onShow() {
    if (!this.data.page || this.seenRevision !== api.revision.addresses) return this.load();
  },
  async load(e, append = false) {
    await ui.run(this, async () => {
      this.retryAppend = append;
      const revision = api.revision.addresses;
      const page = append ? this.data.page + 1 : 1,
        result = await api.get("/api/me/addresses?page=" + page);
      const seen = new Set(
          (append ? this.data.items : []).map((item) => item.id),
        ),
        added = result.items.filter((item) => !seen.has(item.id));
      if (append) ui.appendItems(this, added);
      else ui.replaceItems(this, result.items);
      this.exhausted =
        !result.items.length ||
        !added.length ||
        this.data.items.length >= Number(result.total);
      this.seenRevision = revision;
      this.setData({ page, total: result.total });
    });
  },
  retry() { return this.load(null, !!this.retryAppend); },
  onReachBottom() {
    if (!this.exhausted && this.data.items.length < Number(this.data.total))
      this.load(null, true);
  },
  async recover() {
    let receipt;
    await ui.run(this, async () => {
      receipt = await api.recoverNext("/api/me/addresses/");
      if (!receipt) throw new Error("没有待确认的原操作");
    });
    if (receipt) await this.load();
  },
  create() {
    wx.navigateTo({ url: "/pages/address/edit" });
  },
  edit(e) {
    wx.navigateTo({
      url: "/pages/address/edit?id=" + e.currentTarget.dataset.id,
    });
  },
  choose(e) {
    if (!this.data.select) return;
    const item = this.data.items.find(
      (x) => x.id === e.currentTarget.dataset.id,
    );
    this.getOpenerEventChannel().emit("addressSelected", {
      addressId: item.id,
      version: item.version,
    });
    wx.navigateBack();
  },
  async remove(e) {
    const item = this.data.items.find(
      (x) => x.id === e.currentTarget.dataset.id,
    );
    if (
      !(await ui.confirm("删除收货地址？", "删除后不影响已有订单的地址快照。"))
    )
      return;
    const receipt = await ui.run(this, () =>
      api.command(
        "address-delete:" + item.id,
        "/api/me/addresses/" + item.id + "/delete",
        { expectedVersion: item.version },
      ),
    );
    if (receipt) await this.load();
  },
  async default(e) {
    const item = this.data.items.find(
      (x) => x.id === e.currentTarget.dataset.id,
    );
    const receipt = await ui.run(this, () =>
      api.command(
        "address-default:" + item.id,
        "/api/me/addresses/" + item.id + "/set-default",
        { expectedVersion: item.version },
      ),
    );
    if (receipt) await this.load();
  },
});
