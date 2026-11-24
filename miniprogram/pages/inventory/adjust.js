const { ValidationError, showFormError } = require("../../services/form-error");
const successToast = require("../../services/success-toast");
const { dirty } = require("../../services/planning-page");
const api = require("../../services/props");
require("../../session/page")({
  data: {
    dirty: false,
    id: "",
    sku: null,
    type: "increase",
    typeIndex:0, abnormalIndex:0,
    types: [],
    labels: [],
    quantity: "1",
    reason: "",
    abnormal: "",
    abnormalLabels: ["请选择异常结果", "丢失 / 盘亏", "报废"],
    items: [],
    selected: [],
    page: 1,
    total: "0",
    busy: false,
    message: "",
  },
  onLoad(q) {
    this.setData({ id: q.id || "" });
    return this.load();
  },
  async load() {
    this.setData({ busy: true });
    try {
      const sku = await api.request("me/factory-props/" + this.data.id),
        types =
          sku.assetType === "A_ASSET"
            ? ["increase", "decrease", "repair", "abnormal_decrease"]
            : ["increase", "decrease", "abnormal_decrease"];
      this.setData({ sku, types, labels: types.map((x) => api.names[x]) });
      if (!sku.canAdjustInventory)
        this.setData({ message: "当前道具不能调整库存，请返回查看状态。" });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  async type(e) {
    dirty(this);
    this.setData({
      type: this.data.types[e.detail.value],
      typeIndex:Number(e.detail.value), abnormalIndex:0,
      abnormal: "",
      selected: [],
      items: [],
      page: 1,
    });
    if (this.data.sku.assetType === "A_ASSET" && this.data.type !== "increase")
      await this.instances();
  },
  async instances() {
    this.setData({ busy: true });
    try {
      const p = await api.request(
        "me/factory-props/" +
          this.data.id +
          "/instances?" +
          api.query({ page: this.data.page, pageSize: 100 }),
      );
      const key = {
        decrease: "canSelectForDecrease",
        repair: "canSelectForRepair",
        abnormal_decrease: "canSelectForAbnormal",
      }[this.data.type];
      this.setData({
        items: this.data.items.concat(
          p.items.map((x) => ({
            ...x,
            selectable: x[key],
            state: api.names[x.instanceStatus],
            checked: this.data.selected.includes(x.id),
          })),
        ),
        total: p.total,
      });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  more() {
    if (this.data.page * 100 < Number(this.data.total)) {
      this.setData({ page: this.data.page + 1 });
      this.instances();
    }
  },
  select(e) {
    const id = e.currentTarget.dataset.id,
      row = this.data.items.find((x) => x.id === id);
    if (!row?.selectable) return;
    const selected = this.data.selected.includes(id)
      ? this.data.selected.filter((x) => x !== id)
      : this.data.selected.concat(id);
    dirty(this);
    this.setData({
      selected,
      items: this.data.items.map((x) => ({
        ...x,
        checked: selected.includes(x.id),
      })),
    });
  },
  input(e) {
    dirty(this);
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  abnormal(e) {
    dirty(this);
    this.setData({ abnormal: ["", "lost", "scrapped"][e.detail.value], abnormalIndex:Number(e.detail.value) });
  },
  async submit() {
    if (this.data.busy || !this.data.sku?.canAdjustInventory) return;
    this.setData({ busy: true, message: "" });
    try {
      const a = this.data.sku.assetType === "A_ASSET",
        body = {
          adjustmentType: this.data.type,
          reason: this.data.reason.trim(),
        };
      if (!body.reason) throw new ValidationError("请填写调整原因");
      if (this.data.type === "abnormal_decrease") {
        if (!this.data.abnormal) throw new ValidationError("请选择丢失或报废结果");
        body.abnormalResult = this.data.abnormal;
      }
      if (a && this.data.type !== "increase") {
        if (!this.data.selected.length) throw new ValidationError("请选择具体实物");
        body.snIds = this.data.selected;
      } else {
        body.quantity = Number(this.data.quantity);
        if (
          !Number.isInteger(body.quantity) ||
          body.quantity < 1 ||
          body.quantity > 2147483647
        )
          throw new ValidationError("数量必须为正整数");
      }
      const r = await api.command(
        "adjust-" + this.data.id,
        a ? "create_sn_adjustment" : "create_stock_adjustment",
        "me/factory-props/" +
          this.data.id +
          (a ? "/sn-adjustments" : "/stock-adjustments"),
        body,
      );
      if(wx.disableAlertBeforeUnload)wx.disableAlertBeforeUnload();
      wx.redirectTo({ success: () => successToast("库存申请已提交"),
        url: "/pages/props/review?type=" + r.targetType + "&id=" + r.targetId,
      });
    } catch (e) {
      showFormError(this, e);
    } finally {
      this.setData({ busy: false });
    }
  },
});
