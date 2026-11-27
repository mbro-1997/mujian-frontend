const { hint, ValidationError } = require("./form-error");
const successToast = require("./success-toast");
const yuanToFen = require("./yuan-input");
const { displayTime } = require("./display-time");
const c = require("./custom"),
  ui = require("./trading-page"),
  trade = require("./trading");
const actions = {
  saveCustomDraft: ["编辑草稿", "draft"],
  submitCustomRequirement: ["提交需求", "submit"],
  withdrawCustomRequirement: ["撤回需求", "withdraw"],
  requestExpiredRequote: ["请求重新报价", "request-requote"],
  requestQuoteRevision: ["要求调整报价", "request-revision"],
  acceptCustomQuote: ["确认报价并全款支付", "accept-quote"],
  startCustomReview: ["开始评估", "start-review"],
  declineCustomRequirement: ["婉拒需求", "decline"],
  saveCustomQuote: ["编辑报价草稿", "quote-draft"],
  publishCustomQuote: ["发布当前报价", "publish-quote"],
  launchCustomPayment: ["重新发起支付", "payments"],
  getCustomPayment: ["查看原支付单", "payment"],
  cancelBeforeProduction: ["生产前取消并全退", "cancel"],
  startCustomProduction: ["开始生产", "start-production"],
  readyCustomDelivery: ["登记待交付", "ready"],
  dispatchCustomDelivery: ["登记发运", "dispatch"],
  deliverCustomOrder: ["登记实际交付", "deliver"],
  registerCustomPickup: ["登记自提交接", "register-pickup"],
  confirmCustomPickup: ["确认已自提", "confirm-pickup"],
  acceptCustomDelivery: ["验收通过", "accept-delivery"],
  reportCustomAfterSale: ["报告售后", "after-sales"],
  saveCustomExtension: ["编辑延期申请", "extension-drafts"],
  submitCustomExtension: ["提交延期审核", "submit"],
  startAfterSaleHandling: ["开始处理售后", "start"],
};
const types = [
    "spec_mismatch",
    "quality_issue",
    "transport_damage",
    "quantity_mismatch",
    "other",
  ],
  solutions = [
    "record_only",
    "rework",
    "partial_refund",
    "full_refund",
    "platform_intervention",
  ];
const clean = () => ({
  reason: "",
  remark: "",
  files: [],
  checked: [],
  requestedDate: "",
  type: types[0],
  requestedSolution: solutions[0],
});
function quoteTerms(d) {
  if (d.quotes?.length) return JSON.parse(JSON.stringify(d.quotes[0].terms));
  return {
    items: d.form.items.map((i) => ({
      itemId: i.id,
      title: i.title,
      quantity: i.quantity,
      dimension: i.dimension,
      material: i.material,
      style: i.style,
      acceptanceStandard: i.acceptanceNotes,
      unitPriceFen: "",
    })),
    deliveryMode: d.form.deliveryMode,
    freightFen: 0,
    productionDays: "",
    promisedDate: d.form.expectedCompletionDate,
    revisionTerms: "",
    includedAndExcluded: "",
    afterSaleTerms: "",
    remark: null,
  };
}
function presentation(d) {
  const quotes = (d.quotes || (d.quote ? [d.quote] : [])).map((q) => ({
    ...c.display(q),
    validUntilText: displayTime(q.validUntil),
    goods: c.money(q.goodsFen),
    freight: c.money(q.terms.freightFen),
    terms: {
      ...q.terms,
      items: q.terms.items.map((i) => ({
        ...i,
        price: c.money(i.unitPriceFen),
      })),
    },
  }));
  return {
    ...c.display(d),
    quotes,
    budgetText: d.form?.budgetRangeFen?.map(v => v == null ? "不限" : "¥" + c.money(v)).join(" 至 "),
    responseTime: displayTime(d.responseDeadlineAt),
    productionTime: displayTime(d.productionStartedAt),
    acceptanceTime: displayTime(d.acceptanceDeadlineAt),
    pickupPending: (d.deliveries || []).some(row => row.id === d.currentDeliveryId && row.state === "awaiting_pickup_confirmation"),
    refundAmount: c.money(d.refundedFen || 0),
    payLabel: c.labels[d.payment?.status],
    extensions: (d.extensions || []).map(c.display),
    deliveries: (d.deliveries || []).map(row => ({ ...c.display(row), deliveryTime: displayTime(row.pickupRegisteredAt || row.deliveredAt) })),
    afterSales: (d.afterSales || []).map((s) => ({
      ...c.display(s),
      goods: c.money(s.goodsRefundFen),
      freight: c.money(s.freightRefundFen),
    })),
  };
}
module.exports = (factory) =>
  require("../session/page")({
    data: {
      factory,
      report: null,
      reportFiles: [],
      reportText: "",
      id: "",
      kind: "",
      detail: null,
      buttons: [],
      active: "",
      editor: clean(),
      terms: null,
      addressId: null,
      payment: null,
      message: "",
      busy: false,
      typeNames: ["规格不符", "质量问题", "运输损坏", "数量不符", "其他"],
      solutionNames: [
        "记录问题",
        "返工重交",
        "部分退款",
        "全额退款",
        "平台介入",
      ],
    },
    onLoad(q) {
      this.setData({ id: q.id, kind: q.kind });
    },
    onShow() {
      ui.show(this);
      return this.refresh();
    },
    onHide() {
      clearTimeout(this.saleTimer);
      ui.hide(this);
    },
    onUnload() {
      clearTimeout(this.saleTimer);
      ui.hide(this);
    },
    root() {
      return c.root(factory, this.data.kind, this.data.id);
    },
    saleTimeLeft(d) {
      return (
        Date.parse(d.acceptanceDeadlineAt) -
        (Date.now() + (this.serverOffset || 0))
      );
    },
    updateSaleWindow() {
      clearTimeout(this.saleTimer);
      const d = this.data.detail,
        action = "reportCustomAfterSale";
      if (!d?.allowedActions.includes(action)) return;
      const left = this.saleTimeLeft(d);
      if (left > 0) {
        this.saleTimer = setTimeout(() => this.updateSaleWindow(), left);
        return;
      }
      if (this.data.active === action) hint("本次交付的售后申请时间已截止");
      this.setData({
        buttons: this.data.buttons.filter((b) => b.k !== action),
        ...(this.data.active === action
          ? { active: "" }
          : {}),
      });
    },
    async load(current) {
      const d = await c.get(
        this.root(),
        "GET",
        false,
        undefined,
        {},
        {
          onServerTime: (ms) => {
            if (current()) this.serverOffset = ms - Date.now();
          },
        },
      );
      if (!current()) return;
      const refunds =
        !factory && this.data.kind === "orders"
          ? await c.get(this.root() + "/refunds")
          : [];
      if (!current()) return;
      this.setData({
        refunds: refunds.map((r) => ({
          ...r,
          amount: c.money(r.totalFen),
          label: {
            pending: "待退款",
            processing: "退款中",
            success: "已退款",
            failed: "退款待处理",
            cancelled: "已取消",
          }[r.status],
        })),
      });
      const buttons = d.allowedActions
        .filter((k) => actions[k])
        .map((k) => ({ k, label: actions[k][0] }));
      const overdueReview =
        d.state === "submitted" &&
        Date.parse(d.responseDeadlineAt) <= Date.now();
      this.setData({
        detail: presentation(d),
        buttons,
        overdueReview,
        needsSupport:
          !factory &&
          (overdueReview ||
            (this.data.kind === "orders" &&
              ![
                "completed",
                "user_cancelled",
                "payment_closed",
                "cancelled",
              ].includes(d.state))),
        ...(!d.allowedActions.includes(this.data.active) ? { active: "" } : {}),
      });
      this.updateSaleWindow();
    },
    refresh() {
      return ui.run(this, (cur) => this.load(cur));
    },
    facts(e) {
      return ui.act(this, async (cur) => {
        const sale = this.data.detail.afterSales.find(
          (x) => x.id === e.currentTarget.dataset.id,
        );
        const response = await c.get(
          c.root(true, "after-sales", sale.id) + "/statements",
        );
        if (cur())
          this.setData({
            report: { ...response, id: sale.id, version: sale.version,
              items: response.items.map(row => ({ ...row, timeText: displayTime(row.at) })) },
            reportText: "",
            reportFiles: [],
            active: "",
          });
      });
    },
    removeDraftFile(e) {
      if (this.data.busy) return;
      const { group, id } = e.currentTarget.dataset;
      const files = group === "report" ? this.data.reportFiles : this.data.editor.files;
      this.setData({ [group === "report" ? "reportFiles" : "editor.files"]: files.filter(file => file.materialId !== id) });
      if (group === "editor") this.persist();
    },
    proof() {
      return ui.act(this, async (cur) => {
        const ref = await c.attach(this.root(), "delivery");
        if (cur())
          this.setData({ reportFiles: [...this.data.reportFiles, ref] });
      });
    },
    addStatement() {
      return ui.act(this, async (cur) => {
        const r = this.data.report;
        await c.apply(c.root(true, "after-sales", r.id) + "/statements", {
          expectedVersion: r.version,
          summary: this.data.reportText,
          evidenceIds: this.data.reportFiles.map((f) => f.materialId),
        });
        if (cur()) {
          this.setData({ report: null, reportText: "", reportFiles: [] });
          await this.load(cur);
        }
      });
    },
    refund(e) {
      wx.navigateTo({
        url: "/pages/refund/detail?id=" + e.currentTarget.dataset.id,
      });
    },
    order() {
      wx.navigateTo({
        url:
          (factory ? "/pages/factory/custom-detail" : "/pages/custom/detail") +
          "?kind=orders&id=" +
          this.data.detail.orderId,
      });
    },
    choose(e) {
      const k = e.currentTarget.dataset.k,
        d = this.data.detail;
      if (k === "reportCustomAfterSale" && !(this.saleTimeLeft(d) > 0)) {
        this.updateSaleWindow();
        return;
      }
      if (!d.allowedActions.includes(k)) return;
      if (k === "saveCustomDraft")
        return wx.navigateTo({ url: "/pages/custom/form?id=" + d.id });
      if (k === "getCustomPayment")
        return ui.act(this, async (cur) => {
          const p = await c.get(this.root() + "/payment");
          if (cur())
            this.setData({ payment: p, active: k, actionLabel: actions[k][0] });
        });
      const existing = d.extensions.find((x) => x.state === "draft"),
        initial =
          k === "saveCustomExtension" && existing
            ? {
                requestedDate: existing.requestedDate,
                reason: existing.reason,
                files: existing.evidence,
              }
            : {};
      const draft = factory ? c.readDraft(d.id)[k] : null;
      const editor = { ...clean(), ...initial, ...draft };
      const terms = k === "saveCustomQuote" ? quoteTerms(d) : null;
      if (terms) {
        terms.freightYuan = c.money(terms.freightFen);
        for (const item of terms.items) {
          item.unitPriceYuan = item.unitPriceFen === "" || item.unitPriceFen == null ? "" : c.money(item.unitPriceFen);
          delete item.price;
        }
      }
      this.setData({
        active: k,
        editor,
        marked: Object.fromEntries(editor.checked.map((id) => [id, true])),
        typeIndex: types.indexOf(editor.type),
        requestedSolutionIndex: solutions.indexOf(editor.requestedSolution),
        terms,
        actionLabel: actions[k][0],
        formVersion: d.version,
        message: "",
      });
    },
    closeEditor() {
      if (!this.data.busy) this.setData({ active: "" });
    },
    persist() {
      const { id, active, editor } = this.data;
      if (
        factory &&
        [
          "deliverCustomOrder",
          "registerCustomPickup",
          "saveCustomExtension",
        ].includes(active)
      )
        c.writeDraft(id, { ...c.readDraft(id), [active]: editor });
    },
    edit(e) {
      const path = e.currentTarget.dataset.path;
      this.setData({
        [path]: e.detail.value,
        ...(path === "editor.checked"
          ? {
              marked: Object.fromEntries(
                e.detail.value.map((id) => [id, true]),
              ),
            }
          : {}),
      });
      this.persist();
    },
    select(e) {
      const key = e.currentTarget.dataset.key;
      this.setData({
        ["editor." + key]: (key === "type" ? types : solutions)[
          Number(e.detail.value)
        ],
        [key + "Index"]: Number(e.detail.value),
      });
    },
    address() {
      wx.navigateTo({
        url: "/pages/address/index?select=1",
        events: {
          addressSelected: ({ addressId }) => this.setData({ addressId }),
        },
      });
    },
    attach() {
      return ui.act(this, async (cur) => {
        const k = this.data.active,
          ref = await c.attach(
            this.root(),
            k === "saveCustomExtension"
              ? "extension"
              : k === "reportCustomAfterSale"
                ? "after_sale"
                : "delivery",
          );
        if (cur()) {
          this.setData({ "editor.files": [...this.data.editor.files, ref] });
          this.persist();
        }
      });
    },
    preview(e) {
      return ui.act(this, () =>
        c.preview(this.root(), e.currentTarget.dataset.file),
      );
    },
    pay() {
      return ui.act(this, async (cur) => {
        const p = await c.get(this.root() + "/payment");
        if (cur() && p?.parameters)
          await trade.nativePayment(p.parameters, cur);
        if (cur()) await this.load(cur);
      });
    },
    confirm() {
      return ui.act(this, async (cur) => {
        const {
          detail: d,
          active: k,
          editor: ed,
          terms,
          addressId,
        } = this.data;
        if (k === "reportCustomAfterSale" && !(this.saleTimeLeft(d) > 0)) {
          this.updateSaleWindow();
          return;
        }
        if (
          !d.allowedActions.includes(k) ||
          this.data.formVersion !== d.version
        )
          throw new Error("记录已更新，请重新选择操作");
        let path = this.root() + "/" + actions[k][1],
          body = { expectedVersion: d.version };
        switch (k) {
          case "saveCustomQuote": {
            const { freightYuan, ...fields } = terms;
            body.terms = {
              ...fields,
              productionDays: Number(terms.productionDays),
              freightFen: yuanToFen(freightYuan, true),
              items: terms.items.map(({ unitPriceYuan, ...item }) => ({
                ...item,
                unitPriceFen: yuanToFen(unitPriceYuan, true),
              })),
            };
            break;
          }
          case "requestQuoteRevision":
          case "declineCustomRequirement":
            body.reason = ed.reason;
            break;
          case "publishCustomQuote":
            body.quoteId = d.quotes.find((q) => q.state === "draft").id;
            break;
          case "acceptCustomQuote": {
            const q = d.quotes.find((q) => q.state === "published");
            body.quoteId = q.id;
            body.addressId =
              q.terms.deliveryMode === "buyer_pickup" ? null : addressId;
            if (q.terms.deliveryMode !== "buyer_pickup" && !addressId)
              throw new ValidationError("请选择本单收货地址");
            break;
          }
          case "deliverCustomOrder":
          case "registerCustomPickup":
            if (ed.checked.length !== d.items.length)
              throw new ValidationError("请逐件核对整单明细");
            if (!ed.occurredAt) throw new ValidationError("请填写实际交接日期和时间");
            Object.assign(body, {
              materialIds: ed.files.map((r) => r.materialId),
              orderItemIds: ed.checked,
              remark: ed.remark,
              occurredAt: ed.occurredAt,
            });
            break;
          case "confirmCustomPickup":
          case "acceptCustomDelivery":
            body.deliveryId = d.currentDeliveryId;
            break;
          case "saveCustomExtension":
            Object.assign(body, {
              reason: ed.reason,
              requestedDate: ed.requestedDate,
              evidenceIds: ed.files.map((r) => r.materialId),
            });
            break;
          case "submitCustomExtension": {
            const ext = d.extensions.find((x) => x.state === "draft");
            path = c.root(true, "extensions", ext.id) + "/submit";
            body.expectedVersion = ext.version;
            break;
          }
          case "reportCustomAfterSale":
            Object.assign(body, {
              deliveryId: d.currentDeliveryId,
              type: ed.type,
              requestedSolution: ed.requestedSolution,
              problem: ed.reason,
              evidenceIds: ed.files.map((r) => r.materialId),
            });
            break;
          case "startAfterSaleHandling": {
            const sale = d.afterSales.find((x) => x.state === "submitted");
            path = c.root(true, "after-sales", sale.id) + "/start";
            body.expectedVersion = sale.version;
            break;
          }
        }
        const result = await c.apply(path, body);
        if (!cur()) return;
        c.mark(factory, this.data.kind, d.id);
        if (result.orderId) c.mark(false, "orders", result.orderId);
        if (factory) {
          const cached = c.readDraft(d.id);
          delete cached[k];
          c.writeDraft(d.id, cached);
        }
        this.setData({ active: "", editor: clean() });
        if (result.orderId) {
          await trade.nativePayment(result.parameters, cur);
          if (!cur()) return;
          if (this.data.kind === "requirements") {
            wx.redirectTo({
              url: "/pages/custom/detail?kind=orders&id=" + result.orderId,
            });
            return;
          }
        }
        if (!result.orderId) successToast("操作已提交");
        await this.load(cur);
      });
    },
    occurredNow() {
      const beijing = new Date(Date.now() + 8 * 3600000).toISOString();
      this.setData({
        editor: {
          ...this.data.editor,
          date: beijing.slice(0, 10),
          time: beijing.slice(11, 16),
          occurredAt: beijing.slice(0, -1) + "+08:00",
        },
      });
      this.persist();
    },
    occurred(e) {
      const k = e.currentTarget.dataset.k,
        ed = { ...this.data.editor, [k]: e.detail.value };
      if (ed.date && ed.time)
        ed.occurredAt = ed.date + "T" + ed.time + ":00.000+08:00";
      this.setData({ editor: ed });
      this.persist();
    },
  });
