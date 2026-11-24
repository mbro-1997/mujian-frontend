const { hint } = require("../../services/form-error");
const successToast = require("../../services/success-toast");
const planning = require("../../services/planning");
const calendar = require("../../services/rental-calendar"),
  routes = require("../../constants/routes"),
  api = require("../../services/props");
const inlineLogin = require("../../navigation/login-page"),
  session = require("../../session/storage");
require("../../session/page")({
  ...inlineLogin,
  data: {
    ...inlineLogin.data,
    startDate: "",
    endDate: "",
    month: "",
    monthLabel: "",
    cells: [],
    duration: 0,
    startLabel: "请选择",
    endLabel: "请选择",
    message: "",
    canPrev: false,
    pendingCreate: false,
    week: ["一", "二", "三", "四", "五", "六", "日"],
    filters: {},
    schemeId: "",
    expectedVersion: null,
    busy: false,
  },
  onLoad(q) {
    this.setData({
      schemeId: q.schemeId || "",
      expectedVersion:
        q.expectedVersion === undefined ? null : Number(q.expectedVersion),
    });
    const raw = routes.safeReturn(q.return),
      target =
        raw.split("?")[0] === "/pages/props/browse"
          ? raw
          : "/pages/props/browse",
      filters = {};
    for (const pair of (target.split("?")[1] || "")
      .split("&")
      .filter(Boolean)) {
      const at = pair.indexOf("=");
      filters[pair.slice(0, at)] = decodeURIComponent(
        pair.slice(at + 1).replace(/\+/g, " "),
      );
    }
    for (const name of ["keyword", "styles", "typeCode"])
      if (q[name]) filters[name] = q[name];
    const start = q.startDate || filters.startDate || "",
      end = q.endDate || filters.endDate || "";
    delete filters.startDate;
    delete filters.endDate;
    const keep = calendar.allowed(start, end);
    this.setData({
      filters,
      startDate: keep ? start : "",
      endDate: keep ? end : "",
      month: (keep ? start : calendar.today()).slice(0, 7),
    });
    this.render();
  },
  render() {
    const d = this.data,
      parts = d.month.split("-");
    this.setData({
      pendingCreate: planning.pending.has("create-checklist"),
      monthLabel: parts[0] + "年" + Number(parts[1]) + "月",
      cells: calendar.cells(d.month, d.startDate, d.endDate),
      duration: calendar.days(d.startDate, d.endDate),
      startLabel: calendar.label(d.startDate),
      endLabel: calendar.label(d.endDate),
      canPrev: d.month > calendar.today().slice(0, 7),
    });
  },
  move(e) {
    const offset = Number(e.currentTarget.dataset.offset);
    if (offset !== -1 && offset !== 1) return;
    if (offset < 0 && !this.data.canPrev) return;
    this.setData({ month: calendar.month(this.data.month, offset) });
    this.render();
  },
  select(e) {
    const value = e.currentTarget.dataset.date,
      cell = this.data.cells.find((x) => x.date === value);
    if (!cell || cell.disabled) return;
    if (
      !this.data.startDate ||
      this.data.endDate ||
      value < this.data.startDate
    ) {
      this.setData({ startDate: value, endDate: "", message: "" });
    } else if (!calendar.allowed(this.data.startDate, value)) {
      hint("请选择不早于开始日期、含首尾1～120天的租期。");
      return;
    } else this.setData({ endDate: value, message: "" });
    this.render();
  },
  reset() {
    this.setData({ startDate: "", endDate: "", message: "" });
    this.render();
  },
  async recover() {
    await require("../../services/planning-page").run(this, async () => {
      const receipt = await require("../../services/planning").recover(
        "create-checklist",
      );
      if (!receipt) throw new Error("没有待确认的创建操作");
      wx.redirectTo({
        success: () => successToast("清单已创建"),
        url: "/pages/checklist/detail?id=" + receipt.resourceId,
      });
    });
    this.setData({ pendingCreate: planning.pending.has("create-checklist") });
  },
  async confirm() {
    if (this.data.busy) return;
    if (!calendar.allowed(this.data.startDate, this.data.endDate)) {
      hint("请选择今天起、含首尾1～120天的租期。");
      return;
    }
    if (!session.token()) {
      this.openLogin(
        "/pages/props/dates?" +
          api.query({
            ...this.data.filters,
            startDate: this.data.startDate,
            endDate: this.data.endDate,
            ...(this.data.schemeId
              ? {
                  schemeId: this.data.schemeId,
                  expectedVersion: this.data.expectedVersion,
                }
              : {}),
          }),
      );
      return;
    }
    const ui = require("../../services/planning-page");
    await ui.run(this, async () => {
      const body = {
        sourceType: this.data.schemeId ? "scheme" : "manual",
        startDate: this.data.startDate,
        endDate: this.data.endDate,
      };
      if (this.data.schemeId) {
        body.schemeId = this.data.schemeId;
        body.expectedSchemeVersion = this.data.expectedVersion;
      }
      const receipt = await planning.command(
        "create-checklist",
        "/api/me/checklists",
        body,
      );
      wx.redirectTo({
        success: () => successToast("清单已创建"),
        url: this.data.schemeId
          ? "/pages/checklist/detail?id=" + receipt.resourceId
          : "/pages/props/browse?" +
            api.query({
              ...this.data.filters,
              startDate: this.data.startDate,
              endDate: this.data.endDate,
            }),
      });
    });
    this.setData({ pendingCreate: planning.pending.has("create-checklist") });
  },
});
