const { hint } = require("../../services/form-error");
const { displayTime } = require("../../services/display-time");
const sourceNames = {
  factory_onboarding: "工厂入驻", rental_order: "租赁订单", payment_order: "付款",
  compensation_receivable: "差额补缴", order_issue: "订单问题", refund_order: "退款",
  extension_application: "延期申请", transport_order: "物流", return_verification: "归还核验",
  claim: "索赔", arbitration_case: "仲裁", custom_requirement: "定制需求",
  custom_quote: "定制报价", custom_order: "定制订单", custom_after_sale: "定制售后",
};
const { request } = require("../../services/http");
const { uuid } = require("../../services/planning");
const readWindow = require("../../services/read-list-window");
const ui = require("../../services/trading-page");
const customLabels = require("../../services/custom").labels;
const rentalLabels = require("../../services/trading").labels;
function sourceDisplay(item) {
  const type = item.source.sourceType;
  const labels = type.startsWith("custom_") ? customLabels
    : ["rental_order", "payment_order", "refund_order"].includes(type) ? rentalLabels : {};
  return { ...item, sourceLabel: sourceNames[type], statusLabel: labels[item.status] || item.status };
}

require("../../session/page")({
  data: {
    items: [],
    page: 0,
    total: "0",
    source: null,
    record: null,
    context: null,
    progress: null,
    card: null,
    checked: false,
    busy: false,
    message: "",
  },
  onLoad(query) {
    if (query.type && query.id)
      this.setData({ source: { sourceType: query.type, sourceId: query.id } });
  },
  onSessionReset() {
    this.requestKey = "";
    ui.hide(this);
  },
  onShow() {
    ui.show(this);
    return this.data.source ? this.refresh() : this.load(true);
  },
  onHide() {
    ui.hide(this);
  },
  onUnload() {
    ui.hide(this);
  },
  load(first = false) {
    return ui.run(this, async (current) => {
      this.retryFirst = first;
      const start = first ? 1 : this.data.page + 1;
      const key = item => JSON.stringify([item.source.sourceType, item.source.sourceId]);
      const result = await readWindow(start, Math.max(start, this.data.page),
        page => request("/api/me/service-sources?page=" + page), current, key);
      if (!result) return;
      const page = result.page;
      const rows = first ? [] : this.data.items.slice();
      const seen = new Set(rows.map(key)), before = rows.length;
      for (const item of result.items) {
        if (!seen.has(key(item))) rows.push({ ...sourceDisplay(item), sourceKey: key(item) });
      }
      ui.showList(this, rows, !first);
      this.setData({
          exhausted: result.exhausted || rows.length === before,
          page,
          total: result.total,
        });
    });
  },
  retryList() { return this.load(!!this.retryFirst); },
  onReachBottom() {
    if (!this.data.source && !this.data.exhausted && this.data.items.length < Number(this.data.total))
      return this.load();
  },
  select(event) {
    const record = this.data.items[event.currentTarget.dataset.index];
    this.requestKey = "";
    this.setData({ source: record.source });
    return this.refresh();
  },
  refresh() {
    // 重新进页只读。清除上次的可投递令牌，再按当前账号和来源恢复进度。
    ui.show(this);
    const source = this.data.source;
    if (!source) return this.load(true);
    this.setData({
      checked: false,
      record: null,
      context: null,
      card: null,
      progress: null,
    });
    return ui.run(this, async (current) => {
      const page = await request(
        "/api/me/service-sources?sourceType=" +
          encodeURIComponent(source.sourceType) +
          "&sourceId=" +
          encodeURIComponent(source.sourceId),
      );
      if (!current()) return;
      const record = page.items[0] && sourceDisplay(page.items[0]);
      if (!record) {
        this.requestKey = "";
        this.setData({ message: "当前账号无法查看该咨询来源" });
        return;
      }
      let context = null;
      if (record.contextId)
        context = await request(
          "/api/me/service-contexts/" + encodeURIComponent(record.contextId),
        );
      if (!current()) return;
      let progress = record.progress;
      // 同一案件取较后一次详情读取；另行登记的案件以来源查询为准。
      if (
        context?.progress &&
        (!progress || context.progress.caseNo === progress.caseNo)
      ) {
        progress = context.progress;
      }
      this.setData({ checked: true, record, context, progress });
    });
  },
  prepare() {
    if (!this.data.checked) return;
    return ui.act(this, async (current) => {
      if (!this.requestKey) {
        const key = await uuid();
        if (!current()) return;
        this.requestKey = key;
      }
      try {
        const card = await request(
          "/api/me/service-contexts",
          "POST",
          true,
          { source: this.data.source },
          { "Idempotency-Key": this.requestKey },
        );
        if (current()) {
          this.requestKey = "";
          this.setData({ card, context: card.context, expiresText: displayTime(card.context.expireAt) });
        }
      } catch (error) {
        if (
          current() &&
          ([401, 403, 404].includes(error.status) ||
            ["CONTEXT_EXPIRED", "CONTEXT_ALREADY_USED"].includes(error.reason))
        )
          this.requestKey = "";
        throw error;
      }
    });
  },
  returned() {
    if (!this.tradeHidden && this.data.source) return this.refresh();
  },
  failed() {
    this.setData({ card: null });
    hint("未能打开微信客服，请重试");
  },
  back() {
    const path = this.data.record?.returnPagePath;
    const stack =
      typeof getCurrentPages === "function" ? getCurrentPages() : [];
    const previous = stack[stack.length - 2];
    if (previous && path) {
      const [route, query = ""] = path.slice(1).split("?");
      const matches = query
        .split("&")
        .filter(Boolean)
        .every((pair) => {
          const [key, value] = pair.split("=");
          return previous.options?.[key] === decodeURIComponent(value);
        });
      if (previous.route === route && matches) return wx.navigateBack();
    }
    if (path) wx.redirectTo({ url: path });
    else if (previous) wx.navigateBack();
    else wx.switchTab({ url: "/pages/home/index" });
  },
});
