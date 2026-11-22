const api = require("../../services/planning"),
  ui = require("../../services/planning-page");
require("../../session/page")({
  data: { name: "", description: "", busy: false, message: "", limit: false },
  async onLoad(q) {
    this.skuId = q.skuId || "";
    return this.loadLimit();
  },
  async loadLimit() {
    this.setData({ contextReady: false, message: "", pendingCreate: api.pending.has("create-scheme") });
    try {
      const context = await api.get("/api/me/planning-context");
      this.setData({ contextReady: true, limit: context.editingSchemeCount >= 10 });
    } catch (error) {
      this.setData({ message: error.message });
    }
  },
  input(e) {
    if (this.data.busy) return;
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value, ...(field === "name" ? { hasName: !!e.detail.value.trim() } : {}) });
    ui.dirty(this);
  },
  async save() {
    if (!this.data.contextReady || this.data.limit || this.data.pendingCreate) return;
    await ui.run(this, async () => {
      if (!this.data.name.trim()) throw new Error("请填写方案名称");
      const receipt = await api.command("create-scheme", "/api/me/schemes", {
        name: this.data.name.trim(),
        description: this.data.description.trim() || null,
      });
      this.created(receipt.resourceId);
    });
    this.setData({ pendingCreate: api.pending.has("create-scheme") });
  },
  recover() {
    return ui.run(this, async () => {
      const receipt = await api.recover("create-scheme");
      if (!receipt) throw new Error("没有待确认的创建操作");
      this.created(receipt.resourceId);
    });
  },
  created(id) {
    ui.dirty(this, false);
    if (this.skuId) {
      this.getOpenerEventChannel?.()?.emit("schemeCreated", { id });
      wx.navigateBack();
    } else {
      wx.redirectTo({ url: "/pages/plan/detail?id=" + id });
    }
  },
  back() {
    this.navigationBack();
  },
});
