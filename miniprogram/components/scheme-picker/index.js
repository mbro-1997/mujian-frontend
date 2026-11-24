const successToast = require("../../services/success-toast");
const api = require("../../services/planning");
const account = require("../../services/account");
const session = require("../../session/storage");
const maxQuantity = 2147483647;

Component({
  properties: { prop: Object },
  data: {
    rows: [], target: null, existing: 0, amount: "1", total: 1,
    busy: false, saving: false, message: "", recovery: false,
  },
  lifetimes: {
    attached() {
      this.owner = session.capture();
      this.load();
    },
    detached() { this.owner = null; },
  },
  methods: {
    current() { return !!this.owner && session.isCurrent(this.owner); },
    async run(action, saving = false) {
      if (this.data.busy || !this.current()) return;
      this.setData({ busy: true, saving, message: "" });
      try {
        await action();
      } catch (error) {
        if (!this.current()) return;
        if (api.denied(error) || error.reason === "VERSION_CONFLICT") {
          this.detail = null;
          this.setData({ rows: [], target: null });
        }
        const pending = api.pending.get(this.slot());
        this.setData({ message: error.message, recovery: !!pending && pending.body.skuId === this.data.prop.id });
      } finally {
        if (this.current()) this.setData({ busy: false, saving: false });
      }
    },
    load() {
      return this.run(async () => {
        const context = await account.context();
        if (!this.current()) return;
        if (context.roleCode !== "demander" || context.accessMode !== "normal")
          throw new Error("当前账号不可编辑租赁方案");
        const result = await api.get("/api/me/schemes?page=1&pageSize=20&status=editing");
        if (this.current()) this.setData({ rows: result.items, target: null, recovery: false });
      });
    },
    slot() { return this.data.target ? "scheme-add:" + this.data.target.id : ""; },
    choose(event) { return this.select(event.currentTarget.dataset.id); },
    select(id) {
      return this.run(async () => {
        const detail = await api.get("/api/me/schemes/" + id);
        if (!this.current()) return;
        if (!detail.actions.canEdit) throw new Error("该方案已不可编辑，请重新选择");
        const line = detail.items.find(item => item.display.skuId === this.data.prop.id);
        this.detail = { version: detail.version, remark: line ? line.remark : null };
        const existing = line ? line.quantity : 0;
        const pending = api.pending.get("scheme-add:" + id);
        this.setData({ target: { id, name: detail.name }, existing, amount: "1", total: existing + 1,
          recovery: !!pending && pending.body.skuId === this.data.prop.id });
      });
    },
    quantity(value) {
      if (this.data.busy || this.data.recovery) return;
      const count = Number(value), total = this.data.existing + count;
      this.setData({ amount: String(value), total: /^\d+$/.test(String(value)) && count > 0 && total <= maxQuantity ? total : 0 });
    },
    input(e) { this.quantity(e.detail.value); },
    step(e) { this.quantity(Math.max(1, Number(this.data.amount) + Number(e.currentTarget.dataset.delta))); },
    submit() {
      if (!this.data.target || !this.detail || !this.data.total || this.data.recovery) return;
      return this.run(async () => {
        await api.command(this.slot(), "/api/me/schemes/" + this.data.target.id + "/items", {
          expectedVersion: this.detail.version, skuId: this.data.prop.id,
          quantity: this.data.total, remark: this.detail.remark,
        });
        this.finish();
      }, true);
    },
    recover() {
      return this.run(async () => {
        if (await api.recover(this.slot())) this.finish();
      }, true);
    },
    finish() {
      if (!this.current()) return;
      successToast("已加入方案");
      this.triggerEvent("close");
    },
    create() {
      if (this.data.busy || this.opening) return;
      this.opening = true;
      wx.navigateTo({
        url: "/pages/plan/create?skuId=" + this.data.prop.id,
        events: { schemeCreated: ({ id }) => { if (this.current()) this.select(id); } },
        complete: () => { this.opening = false; },
      });
    },
    back() {
      if (this.data.saving) return;
      if (this.data.target && !this.data.busy) return this.load();
      this.close();
    },
    close() { if (!this.data.saving) this.triggerEvent("close"); },
    noop() {},
  },
});
