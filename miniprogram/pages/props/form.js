const { ValidationError, hint } = require("../../services/form-error");
const successToast = require("../../services/success-toast");
const { dirty } = require("../../services/planning-page");
const api = require("../../services/props");
const { skuInput } = require("../../services/prop-input");
const empty = {
  propName: "",
  typeCode: "",
  styleCodes: [],
  sizeDesc: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  materialDesc: "",
  fireResistantCode: "",
  weightKg: "",
  transportSuggestion: "",
  images: [],
  remark: null,
};
function decimal(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new ValidationError("尺寸、重量和金额最多两位小数");
  const [a, b = ""] = value.split(".");
  return String(Number(a)) + "." + b.padEnd(2, "0");
}
function cents(value) {
  const parts = decimal(value).split("."),
    n = Number(parts[0]) * 100 + Number(parts[1]);
  if (!Number.isSafeInteger(n) || n > 2147483647)
    throw new ValidationError("金额超出允许范围");
  return n;
}
require("../../session/page")({
  data: {
    dirty: false,
    fields: empty,
    assetTypes: [{"key": "assetType", "title": "资产类型 *", "options": [{"code": "A_ASSET", "label": "A 类 · 一物一码"}, {"code": "B_CONSUMABLE", "label": "B 类 · 数量管理"}]}],
    assetType: "A_ASSET",
    mode: "create",
    id: "",
    previous: "",
    expectedVersion: 0,
    initialQuantity: "1",
    rent: "",
    deposit: "",
    packaging: "",
    options: { types: [], styles: [], fireResistance: [] },
    loadError: "",
    busy: false,
    submitting: false,
    locked: false,
    applyRemark: "",
    styleOpen: false,
    selectedStyles: [],
  },
  onLoad(q) {
    this.setData({
      id: q.id || "",
      previous: q.previous || "",
      mode: q.mode || "create",
      assetType: q.assetType === "B_CONSUMABLE" ? "B_CONSUMABLE" : "A_ASSET",
    });
    return this.load();
  },
  async load() {
    this.setData({ busy: true, loadError: "" });
    try {
      const options = await api.request(
        "me/factory-props/options" +
          (this.data.id ? "?skuId=" + this.data.id : ""),
      );
      this.setData({ options });
      if (this.data.id) {
        const sku = await api.request("me/factory-props/" + this.data.id);
        let f = sku.fields;
        if (this.data.previous) {
          const r = await api.request(
            "me/prop-reviews/sku_audit/" + this.data.previous,
          );
          f = r.proposed;
          this.setData({ initialQuantity: String(r.initialQuantity || 1) });
        }
        this.setData({
          fields: {
            ...f,
            images: f.images.map((i) => ({
              kind: "existing",
              locator: i.locator,
            })),
          },
          assetType: sku.assetType,
          expectedVersion: sku.version,
          rent: api.money(f.dailyRentPriceFen),
          deposit: api.money(f.depositAmountFen),
          packaging: f.packagingFactorBps == null ? "" : String(f.packagingFactorBps / 10000),
          locked:
            !!sku.pendingApplicationId ||
            (this.data.mode === "edit" && !sku.canEditOptions),
        });
      }
      this.styles();
    } catch (e) {
      this.setData({ loadError: e.message, locked: true });
    } finally {
      this.setData({ busy: false });
    }
  },
  input(e) {
    if (this.data.busy || this.data.locked) return;
    dirty(this);
    this.setData({ ["fields." + e.currentTarget.dataset.key]: e.detail.value });
  },
  value(e) {
    if (this.data.busy || this.data.locked) return;
    dirty(this);
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  chooseType(e) {
    if (this.data.busy || this.data.locked) return;
    if (this.data.id || this.data.assetType === e.detail.value) return;
    dirty(this);
    this.setData({ assetType: e.detail.value });
  },
  select(e) {
    if (this.data.busy || this.data.locked) return;
    const key = e.currentTarget.dataset.key,
      group = e.currentTarget.dataset.group,
      o = this.data.options[group][Number(e.detail.value)];
    if (
      !o.enabled &&
      !(key === "typeCode" && o.code === this.data.fields.typeCode)
    )
      return;
    dirty(this);
    this.setData({ ["fields." + key]: o.code });
    this.styles();
  },
  styles() {
    const f = this.data.fields;
    this.setData({
      typeIndex: Math.max(0,this.data.options.types.findIndex(o=>o.code===f.typeCode)),
      fireIndex: Math.max(0,this.data.options.fireResistance.findIndex(o=>o.code===f.fireResistantCode)),
      selectedStyles: this.data.options.styles.filter(o => f.styleCodes.includes(o.code)),
      styleOptions: this.data.options.styles.map((o) => ({
        ...o,
        selected: f.styleCodes.includes(o.code),
        choiceDisabled: !f.styleCodes.includes(o.code) && (!o.enabled || f.styleCodes.length >= 3 || (o.code === "special_asset" ? f.styleCodes.length > 0 : f.styleCodes.includes("special_asset"))),
      })),
      typeLabel:
        this.data.options.types.find((o) => o.code === f.typeCode)?.label ||
        "请选择类型",
      fireLabel:
        this.data.options.fireResistance.find(
          (o) => o.code === f.fireResistantCode,
        )?.label || "请选择阻燃选项",
    });
  },
  toggleStyles() {
    if (!this.data.busy && !this.data.locked) this.setData({styleOpen: !this.data.styleOpen});
  },
  style(e) {
    if (this.data.busy || this.data.locked) return;
    const code = e.currentTarget.dataset.code,
      old = this.data.fields.styleCodes,
      option = this.data.options.styles.find((o) => o.code === code);
    if (!old.includes(code) && !option.enabled) return;
    let next = old.includes(code)
      ? old.filter((x) => x !== code)
      : old.concat(code);
    if (
      next.length > 3 ||
      (next.includes("special_asset") && next.length > 1)
    ) {
      hint("最多选3种风格，特殊资产须单选");
      return;
    }
    dirty(this);
    this.setData({ "fields.styleCodes": next });
    this.styles();
  },
  photos() {
    if (this.data.busy || this.data.locked) return;
    wx.chooseMedia({
      count: 4 - this.data.fields.images.length,
      mediaType: ["image"], sizeType: ["original", "compressed"],
      success: (r) => {
        dirty(this);
        this.setData({
          "fields.images": this.data.fields.images.concat(
            r.tempFiles.map((f) => ({ localPath: f.tempFilePath })),
          ),
        });
      },
    });
  },
  remove(e) {
    if (this.data.busy || this.data.locked) return;
    dirty(this);
    this.setData({
      "fields.images": this.data.fields.images.filter(
        (_, i) => i !== Number(e.currentTarget.dataset.index),
      ),
    });
  },
  back() { this.navigationBack(); },
  async submit() {
    if (this.data.busy || this.data.locked) return;
    this.setData({ busy: true, submitting: true, styleOpen: false });
    let failure;
    const slot = "form-" + (this.data.id || "new");
    try {
      let result = await api.resume(slot);
      if (!result) {
        let body, path, operation;
        if (this.data.mode === "edit") {
          body = {
            expectedSkuVersion: this.data.expectedVersion,
            typeCode: this.data.fields.typeCode,
            styleCodes: this.data.fields.styleCodes,
            transportSuggestion: this.data.fields.transportSuggestion.trim(),
          };
          path = "me/factory-props/" + this.data.id + "/edit-options";
          operation = "edit_sku_options";
        } else {
          const f = skuInput(this.data.fields);
          if (
            !f.propName.trim() ||
            !f.typeCode ||
            !f.fireResistantCode ||
            !f.sizeDesc.trim() ||
            !f.materialDesc.trim() ||
            !f.transportSuggestion.trim() ||
            !f.styleCodes.length ||
            !f.images.length
          )
            throw new ValidationError("请填写完整必填资料并添加1～4张图片");
          for (const k of ["lengthCm", "widthCm", "heightCm", "weightKg"]) {
            f[k] = decimal(String(f[k]));
            if (Number(f[k]) <= 0) throw new ValidationError("尺寸和重量必须大于0");
          }
          const packaging = String(this.data.packaging).trim();
          if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,4})?$/.test(packaging)) throw new ValidationError("包装体积系数最多四位小数");
          const [whole, fraction = ""] = packaging.split(".");
          f.packagingFactorBps = Number(whole) * 10000 + Number(fraction.padEnd(4, "0"));
          if (!Number.isInteger(f.packagingFactorBps) || f.packagingFactorBps < 10000 || f.packagingFactorBps > 1000000) throw new ValidationError("包装体积系数须在1～100之间");
          f.dailyRentPriceFen = cents(this.data.rent);
          f.depositAmountFen = cents(this.data.deposit);
          f.remark = f.remark?.trim() || null;
          if (f.dailyRentPriceFen < 1) throw new ValidationError("日租金须大于零");
          const quantity = Number(this.data.initialQuantity);
          if (
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 2147483647
          )
            throw new ValidationError("初始数量须为正整数");
          const applyRemark = this.data.applyRemark.trim() || null;
          if (this.data.mode === "update" && !applyRemark) throw new ValidationError("请填写申请说明");
          f.images = await api.materialize(
            f.images.map((i) =>
              i.localPath
                ? { localPath: i.localPath }
                : i.kind === "existing"
                  ? { kind: "existing", locator: i.locator }
                  : { kind: "upload", uploadId: i.uploadId },
            ),
          );
          body = {
            fields: f,
            initialQuantity: quantity,
            applyRemark,
          };
          if (this.data.mode === "update") {
            delete f.typeCode; delete f.styleCodes; delete f.transportSuggestion;
            body = { fields: f, expectedSkuVersion: this.data.expectedVersion,
              previousApplicationId: this.data.previous || null, applyRemark: this.data.applyRemark.trim() };
            path = "me/factory-props/" + this.data.id + "/change-applications";
            operation = "update_sku";
          } else if (this.data.previous) {
            Object.assign(body, {
              previousApplicationId: this.data.previous,
              expectedSkuVersion: this.data.expectedVersion,
            });
            path = "me/factory-props/" + this.data.id + "/resubmit";
            operation = "resubmit_sku";
          } else {
            body.assetType = this.data.assetType;
            path = "me/factory-props";
            operation = "create_sku";
          }
        }
        result = await api.command(slot, operation, path, body);
      }
      if(wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload();
      if (result.targetType === "sku")
        wx.redirectTo({ url: "/pages/props/detail?id=" + result.skuId, success: () => successToast("修改已保存") });
      else
        wx.redirectTo({
          success: () => successToast("已提交审核"),
          url:
            "/pages/props/review?type=" +
            result.targetType +
            "&id=" +
            result.targetId,
        });
    } catch (e) {
      failure = e;
    } finally {
      this.setData({ busy: false, submitting: false });
    }
    if (failure) hint(failure.message);
  },
});
