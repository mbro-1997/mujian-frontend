const api = require("../../services/planning");
const session = require("../../session/storage");
Component({
  properties: { prop: Object },
  data: { target: null, amount: "1", existing: 0, total: 1, max: 0, remark: "", busy: false, saving: false, recovery: false, message: "" },
  lifetimes: {
    attached() { this.owner = session.capture(); this.load(); },
    detached() { this.owner = null; },
  },
  methods: {
    current() { return !!this.owner && session.isCurrent(this.owner); },
    slot() { return this.data.target ? "checklist-add:" + this.data.target.id : ""; },
    async run(action, saving = false) {
      if (this.data.busy || !this.current()) return;
      this.setData({ busy: true, saving, message: "" });
      try { await action(); }
      catch (error) {
        if (!this.current()) return;
        if (api.denied(error) || error.reason === "VERSION_CONFLICT") {
          this.detail = null;
          this.setData({ target: null });
        }
        const pending = api.pending.get(this.slot());
        this.setData({ message: error.message, recovery: !!pending && pending.body.skuId === this.data.prop.id });
      } finally { if (this.current()) this.setData({ busy: false, saving: false }); }
    },
    load() {
      return this.run(async () => {
        const prop = this.data.prop;
        const context = await api.get("/api/me/planning-context"), target = context.currentChecklist;
        if (!this.current()) return;
        if (!target || target.status !== "selecting" || target.startDate !== prop.startDate || target.endDate !== prop.endDate)
          throw new Error("当前清单租期已变化，请返回清单重新选品。");
        const detail = await api.get("/api/me/checklists/" + target.id);
        if (!this.current()) return;
        const line = detail.groups.flatMap(group => group.items).find(row => row.display.skuId === prop.id);
        const existing = line ? line.quantity : 0;
        this.detail = { version: detail.version };
        const max = Math.max(0, prop.maxQuantity - existing), pending = api.pending.get("checklist-add:" + target.id);
        this.setData({ target, existing, max, amount: "1", total: max ? existing + 1 : 0,
          remark: line ? line.remark || "" : "", recovery: !!pending && pending.body.skuId === prop.id });
      });
    },
    quantity(value) {
      if (this.data.busy || this.data.recovery) return;
      const number = Number(value);
      this.setData({ amount: String(value), total: /^\d+$/.test(String(value)) && number >= 1 && number <= this.data.max ? this.data.existing + number : 0 });
    },
    input(e) { this.quantity(e.detail.value); },
    step(e) { this.quantity(Math.max(1, Number(this.data.amount) + Number(e.currentTarget.dataset.delta))); },
    remark(e) { if (!this.data.busy && !this.data.recovery) this.setData({ remark: e.detail.value }); },
    submit() {
      if (!this.data.target || !this.detail || !this.data.total || this.data.recovery) return;
      return this.run(async () => {
        await api.command(this.slot(), "/api/me/checklists/" + this.data.target.id + "/items", {
          expectedVersion: this.detail.version, skuId: this.data.prop.id,
          quantity: this.data.total, remark: this.data.remark.trim() || null,
        });
        this.finish();
      }, true);
    },
    recover() {
      return this.run(async () => { if (await api.recover(this.slot())) this.finish(); }, true);
    },
    finish() {
      if (!this.current()) return;
      wx.showToast({ title: "已加入清单" });
      this.triggerEvent("added");
    },
    close() { if (!this.data.saving) this.triggerEvent("close"); },
    noop() {},
  },
});
