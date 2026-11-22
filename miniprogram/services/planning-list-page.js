const uniqueRows = require("./unique-rows");
const api = require("./planning"),
  ui = require("./planning-page"),
  session = require("../session/storage");
const schemeStatuses = [
  { value: "all", label: "全部方案" },
  { value: "editing", label: "编辑中" },
  { value: "archived", label: "已归档" },
];
const checklistNotes = {
  selecting: "选品中，可继续添加道具，也可以在清单详情里调整已有道具数量。",
  suspended: "已挂起。切换为当前清单后，可以继续选品和调整数量。",
  converted_to_order: "已转为订单，可查看清单记录。",
  checkout_processing: "支付处理中，可查看清单记录。",
};

function listMoney(fen) {
  if (!Number.isSafeInteger(fen)) return "—";
  const [yuan, cents] = api.money(fen).split(".");
  return "¥" + yuan.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (cents === "00" ? "" : "." + cents);
}

function listTitle(row) {
  if (!row.startDate || !row.endDate || row.name !== row.startDate + "—" + row.endDate + "租赁清单") return row.name;
  const [year, month, day] = row.startDate.split("-");
  const [endYear, endMonth, endDay] = row.endDate.split("-");
  const end = (endYear === year ? "" : endYear + "年") + Number(endMonth) + "月" + Number(endDay) + "日";
  return year + "年" + Number(month) + "月" + Number(day) + "日-" + end + "租赁清单";
}

function listRow(row) {
  return {
    ...row, listTitle: listTitle(row), statusLabel: api.labels[row.status],
    note: checklistNotes[row.status] || row.description || "",
    dailyText: listMoney(row.estimatedDailyRentFen),
    depositText: listMoney(row.estimatedDepositFen),
  };
}

module.exports = function (kind) {
  const plan = kind === "schemes",
    tab = plan ? "plan" : "checklist";
  return {
    data: {
      isSchemeList: plan,
      schemeStatuses,
      statusOpen: false,
      items: [],
      page: 0,
      total: "0",
      busy: false,
      message: "",
      filter: plan ? "all" : "active",
      loginVisible: false,
    },
    async onShow() {
      if (!session.token()) return;
      if (this.data.page && this.seenRevision === api.revision.value)
        return;
      await this.loadPlanning();
    },
    onSessionReset() {
      this.round = (this.round || 0) + 1;
      this.seenRevision = -1;
    },
    async loadPlanning(event, append = false) {
      if (this.data.busy) return;
      const owner = session.capture(),
        round = (this.round = (this.round || 0) + 1);
      this.setData({ busy: true, message: "" });
      try {
        const revision = api.revision.value;
        const page = append ? this.data.page + 1 : 1;
        const result = await api.get(
          "/api/me/" +
            kind +
            "?page=" +
            page +
            "&pageSize=20&" +
            (plan ? "status" : "scope") +
            "=" +
            this.data.filter,
        );
        if (round !== this.round || !session.isCurrent(owner)) return;
        const added = uniqueRows(result.items, append ? this.data.items : []).map(listRow);
        if (append && result.total !== this.data.total) {
          this.setData({ busy: false });
          return this.loadPlanning();
        }
        if (append) ui.appendItems(this, added);
        else ui.replaceItems(this, added);
        this.exhausted =
          !added.length ||
          this.data.items.length >= Number(result.total);
        this.setData({ page, total: result.total });
        this.retryAppend = false;
        this.setData({ exhausted: this.exhausted });
        this.seenRevision = revision;
      } catch (error) {
        if (round === this.round) {
          this.retryAppend = append;
          if (api.denied(error)) { this.seenRevision = -1; this.setData({ items: [], page: 0, total: "0" }); }
          this.setData({ message: error.message });
        }
      } finally {
        if (round === this.round) this.setData({ busy: false });
      }
    },
    retry() {
      return this.loadPlanning(null, !!this.retryAppend);
    },
    async onPullDownRefresh() {
      try {
        await this.loadPlanning();
      } finally {
        if (wx.stopPullDownRefresh) wx.stopPullDownRefresh();
      }
    },
    onReachBottom() {
      if (!this.exhausted && this.data.items.length < Number(this.data.total))
        return this.loadPlanning(null, true);
    },
    toggleStatus() {
      if (!this.data.busy) this.setData({ statusOpen: !this.data.statusOpen });
    },
    selectSchemeStatus(e) {
      this.setData({ statusOpen: false });
      return this.setListFilter(e.currentTarget.dataset.value);
    },
    resetStatus() {
      if (this.data.busy) return;
      this.setData({ statusOpen: false });
      return this.data.filter === "all" ? this.loadPlanning() : this.setListFilter("all");
    },
    filter(e) {
      return this.setListFilter(e.currentTarget.dataset.value);
    },
    setListFilter(value) {
      if (this.data.busy || value === this.data.filter) return;
      this.setData({ filter: value, items: [], page: 0, total: "0" });
      return this.loadPlanning();
    },
    open(e) {
      wx.navigateTo({
        url: "/pages/" + tab + "/detail?id=" + e.currentTarget.dataset.id,
      });
    },
    create() {
      if (!session.token()) return this.goAccount();
      wx.navigateTo({
        url: plan
          ? "/pages/plan/create"
          : "/pages/props/dates",
      });
    },
    async activate(e) {
      const row = this.data.items.find(
        (x) => x.id === e.currentTarget.dataset.id,
      );
      if (
        !(await ui.confirm(
          "切换为当前清单？",
          "原选品中清单会自动挂起，租期和道具不变。",
        ))
      )
        return;
      const receipt = await ui.run(this, () =>
        api.command(
          "activate:" + row.id,
          "/api/me/checklists/" + row.id + "/activate",
          { expectedVersion: row.version },
        ),
      );
      if (receipt) await this.loadPlanning();
    },
    continue(e) {
      const row = this.data.items.find(
        (x) => x.id === e.currentTarget.dataset.id,
      );
      wx.navigateTo({
        url:
          "/pages/props/browse?startDate=" +
          row.startDate +
          "&endDate=" +
          row.endDate,
      });
    },
    async recover() {
      let receipt;
      await ui.run(this, async () => {
        receipt = await api.recoverNext("/api/me/" + kind + "/");
        if (!receipt) throw new Error("没有待确认的原操作");
      });
      if (receipt) await this.loadPlanning();
    },
    closeLogin() {
      this.setData({ loginVisible: false });
    },
    goAccount() {
      this.setData({ loginVisible: true });
    },
    onUnload() {
      this.round = (this.round || 0) + 1;
    },
  };
};
