const { ValidationError } = require("../../services/form-error");
const successToast = require("../../services/success-toast");
const c = require("../../services/custom"),
  ui = require("../../services/trading-page");

function compact(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([, v]) => v !== null && v !== undefined && v !== "",
    ),
  );
}
const amount = require("../../services/yuan-input");
const templateItems = [
  { title: "中世纪长桌", quantity: 4, style: "深棕做旧", acceptanceNotes: "可拆装" },
  { title: "配套长凳", quantity: 2, style: "同色同工艺", acceptanceNotes: "承重 120kg" },
];
let nextRow = 0;
function formRow(item) {
  return { ...item, rowKey: item.id || "new-" + ++nextRow };
}
require("../../session/page")({
  data: {
    id: "",
    version: 0,
    form: { items: [], attachments: [], deliveryMode: "factory_delivery" },
    low: "",
    high: "",
    factories: [],
    factoryLabel: "",
    factoryIndex: 0,
    templateItems,
    previewTemplate: false,
    ready: false,
    page: 0,
    more: true,
    busy: false,
    message: "",
  },
  onLoad(q) {
    return this.initialize(q);
  },
  retryLoad() { return this.initialize(this._navigationQuery || {}); },
  async initialize(q) {
    if (this.data.busy) return;
    this.setData({ busy: true, message: "" });
    try {
      await this.readForm(q);
      this.setData({ ready: true });
    } catch (error) {
      this.setData({ ready: false, message: error.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  async readForm(q) {
    if (q.id) {
      const r = await c.get(c.root(false, "requirements", q.id)),
        form = r.form;
      this.setData({
        id: q.id,
        version: r.version,
        form: { ...form, items: form.items.map(formRow) },
        low:
          form.budgetRangeFen?.[0] != null
            ? c.money(form.budgetRangeFen[0])
            : "",
        high:
          form.budgetRangeFen?.[1] != null
            ? c.money(form.budgetRangeFen[1])
            : "",
        factoryLabel: "已选原工厂",
      });
      // 历史需求仍可读取；工厂不再公开承接时，不因此阻断原需求。
      try {
        const factory = await c.get("/api/custom-factories/" + form.factoryId);
        this.setData({ factoryLabel: factory.name });
      } catch (_) {}
    } else if (q.factoryId) {
      const choice = await c.get("/api/custom-factories/" + q.factoryId);
      this.setData({
        "form.factoryId": q.factoryId,
        factoryLabel: choice.name,
        previewTemplate: q.mode === "template",
        "form.items": q.skuId
          ? [formRow({ sourceSkuId: q.skuId, quantity: 1, attachments: [] })]
          : [],
      });
    } else await this.factories();
  },
  async factories() {
    const result = await c.get(
        "/api/custom-factories?page=" + (this.data.page + 1) + "&pageSize=20",
      ),
      map = new Map(this.data.factories.map((f) => [f.id, f]));
    for (const f of result.items) map.set(f.id, f);
    this.setData({
      factories: [...map.values()],
      page: result.page,
      more: result.page * result.pageSize < Number(result.total),
    });
  },
  factoryHome() {
    if (this.data.busy) return;
    wx.navigateTo({
      url: "/pages/custom/factory?id=" + this.data.form.factoryId,
    });
  },
  select(e) {
    if (this.data.busy) return;
    const f = this.data.factories[Number(e.detail.value)];
    this.setData({ "form.factoryId": f.id, factoryLabel: f.name, factoryIndex: Number(e.detail.value) });
  },
  change(e) {
    if (this.data.busy) return;
    this.setData({ [e.currentTarget.dataset.path]: e.detail.value });
  },
  mode(e) {
    if (this.data.busy) return;
    this.setData({
      "form.deliveryMode": Number(e.detail.value)
        ? "buyer_pickup"
        : "factory_delivery",
    });
  },
  add() {
    if (this.data.busy) return;
    this.setData({
      "form.items": [...this.data.form.items, formRow({ quantity: 1, attachments: [] })],
    });
  },
  template() {
    if (!this.data.busy) this.setData({ previewTemplate: true });
  },
  closeTemplate() {
    this.setData({ previewTemplate: false });
  },
  useTemplate() {
    if (this.data.busy || !this.data.previewTemplate) return;
    const items = [...this.data.form.items];
    for (const example of templateItems) {
      if (!items.some(row => Object.keys(example).every(key => String(row[key]) === String(example[key]))))
        items.push(formRow({ ...example, attachments: [] }));
    }
    this.setData({ "form.items": items, previewTemplate: false });
  },
  remove(e) {
    if (this.data.busy) return;
    this.setData({
      "form.items": this.data.form.items.filter(
        (_, i) => i !== Number(e.currentTarget.dataset.index),
      ),
    });
  },
  removeFile(e) {
    if (this.data.busy) return;
    const { index, file } = e.currentTarget.dataset;
    const path =
      index == null
        ? "form.attachments"
        : "form.items[" + index + "].attachments";
    const refs =
      index == null
        ? this.data.form.attachments
        : this.data.form.items[index].attachments;
    this.setData({ [path]: refs.filter((_, i) => i !== Number(file)) });
  },
  async persist(current, reload = false) {
    const { form, id, version, low, high } = this.data;
    if (!form.factoryId) throw new ValidationError("请先选择承接工厂");
    const range = [amount(low), amount(high)];
    if (range.every((v) => v != null) && range[0] > range[1])
      throw new ValidationError("预算下限不能大于上限");
    const items = (form.items || []).map(({ rowKey, ...i }) =>
      compact({ ...i, quantity: i.quantity ? Number(i.quantity) : undefined }),
    );
    const body = {
      ...compact(form),
      items,
      budgetRangeFen: range.some((v) => v != null) ? range : null,
    };
    if (id) body.expectedVersion = version;
    const reply = await c.apply(
      c.root(false, "requirements", id) + (id ? "/draft" : ""),
      body,
    );
    if (!current()) return;
    c.mark(false, "requirements", reply.resourceId);
    this.setData({ id: reply.resourceId, version: reply.resourceVersion });
    if (reload) {
      // 保存已得到回执。回读失败时按已保存的 ID 重读，避免再次创建草稿。
      this._navigationQuery = { id: reply.resourceId };
      let latest;
      try {
        latest = await c.get(c.root(false, "requirements", reply.resourceId));
        if (!current()) return;
        if (latest.version !== reply.resourceVersion)
          throw new Error("草稿已被更新，请重新读取最新版本");
      } catch (error) {
        if (current()) this.setData({ ready: false });
        throw error;
      }
      this.setData({ version: latest.version, form: { ...latest.form, items: latest.form.items.map(formRow) } });
    }
    return reply;
  },
  onUnload() { ui.hide(this); },
  upload(e) {
    return ui.run(this, async (current) => {
      const index = e.currentTarget.dataset.index;
      if (!this.data.id) await this.persist(current, true);
      if (!current()) return;
      const rowKey = index == null ? null : this.data.form.items[index].rowKey;
      const ref = await c.attach(
        c.root(false, "requirements", this.data.id),
        "requirement",
      );
      if (!current()) return;
      const i = rowKey == null ? null : this.data.form.items.findIndex(row => row.rowKey === rowKey);
      if (i === -1) return;
      const refs =
        i == null
          ? this.data.form.attachments
          : this.data.form.items[i].attachments;
      this.setData({
        [i == null ? "form.attachments" : "form.items[" + i + "].attachments"]:
          [...(refs || []), ref],
      });
      await this.persist(current, true);
    });
  },
  save(e) {
    const submit = !!e.currentTarget.dataset.submit;
    return ui.run(this, async (current) => {
      const r = await this.persist(current);
      if (!current()) return;
      if (submit)
        await c.apply(c.root(false, "requirements", r.resourceId) + "/submit", {
          expectedVersion: r.resourceVersion,
        });
      if (current())
        wx.redirectTo({
          success: () => successToast(submit ? "需求已提交" : "草稿已保存"),
          url: "/pages/custom/detail?kind=requirements&id=" + r.resourceId,
        });
    });
  },
});
