const successToast = require("./success-toast");
const uniqueRows = require("./unique-rows");
const api = require("./planning"),
  ui = require("./planning-page"),
  session = require("../session/storage");
const schemeStatuses = [
  { value: "all", label: "全部方案" },
  { value: "editing", label: "编辑中" },
  { value: "archived", label: "已归档" },
];
const readWindow = require("./read-list-window");
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

module.exports = function (kind, scope = "active") {
  const plan = kind === "schemes",
    tab = plan ? "plan" : "checklist";
  return {
    data: {
      isHistory: !plan && scope === "history",
      schemeStatuses,
      statusOpen: false,
      items: [],
      page: 0,
      total: "0",
      busy: false,
      message: "",
      ...(plan ? { filter: "all" } : {}),
      ...(!plan && scope === "active" ? { checklistContext: null } : {}),
      swipeId: "",
      retryDeleteId: "",
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
      this.refreshChecklistContext = false;
    },
    async loadPlanning(event, append = false) {
      if (this.data.busy) return;
      const owner = session.capture(),
        round = (this.round = (this.round || 0) + 1);
      this.setData({ busy: true, message: "", swipeId: "" });
      try {
        const revision = api.revision.value;
        const start = append ? this.data.page + 1 : 1;
        const last = Math.max(start, this.data.page);
        const result = await readWindow(start, last, page => api.get(
          "/api/me/" + kind + "?page=" + page + "&pageSize=20&" +
          (plan ? "status=" + this.data.filter : "scope=" + scope)
        ), () => round === this.round && session.isCurrent(owner));
        if (!result) return;
        const page = result.page;
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
        if (!plan && scope === "active") {
          if (this.refreshChecklistContext) {
            const context = await api.get("/api/me/planning-context");
            if (round !== this.round || !session.isCurrent(owner)) return;
            this.setData({ checklistContext: context });
            this.refreshChecklistContext = false;
          } else if (this.data.checklistContext) this.setData({ checklistContext: null });
        }
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
    onHide() {
      this.setData({ swipeId: "", statusOpen: false });
    },
    revealRow(e) {
      this.setData({ swipeId: e.detail.opened ? e.currentTarget.dataset.id : "" });
    },
    async deleteRow(e) {
      const id = e.currentTarget.dataset.id;
      const row = this.data.items.find(item => item.id === id);
      const statuses = plan ? ["editing", "archived"] : ["selecting", "suspended"];
      if (!row || !statuses.includes(row.status) || scope !== "active" ||
          this.data.busy || this.confirmingDelete || this.data.factoryRoot) return;
      const owner = session.capture();
      const label = plan ? "方案" : "清单";
      const slot = "delete-" + (plan ? "scheme:" : "checklist:") + id;
      const path = "/api/me/" + kind + "/" + id + "/delete";
      const body = api.pending.get(slot)?.body || { expectedVersion: row.version };
      this.confirmingDelete = true;
      this.setData({ swipeId: "" });
      try {
        const confirmed = await ui.confirm("删除" + label + "？",
          "「" + row.listTitle + "」将永久删除，无法恢复。" + (plan ? "此前发出的分享链接将失效。" : ""),
          { confirmText: "确认删除", confirmColor: "#af3429" });
        if (!confirmed || !session.isCurrent(owner) || this.data.factoryRoot || this.data.busy) return;
        this.setData({ busy: true, message: "", retryDeleteId: "" });
        let failure;
        try {
          await api.command(slot, path, body);
          if (!session.isCurrent(owner)) return;
          this.setData({ items: this.data.items.filter(item => item.id !== id),
            total: String(Math.max(0, Number(this.data.total) - 1)) });
          successToast(label + "已删除");
        } catch (error) {
          if (!session.isCurrent(owner)) return;
          failure = error;
          if (error.status !== 409 && error.status !== 404) {
            this.setData({ message: error.message, retryDeleteId: api.pending.has(slot) ? id : "" });
            return;
          }
        } finally {
          if (session.isCurrent(owner)) this.setData({ busy: false });
        }
        if (!plan) this.refreshChecklistContext = true;
        await this.loadPlanning();
        if (failure?.status === 409 && session.isCurrent(owner) && !this.data.message)
          this.setData({ message: failure.reason === "VERSION_CONFLICT"
            ? label + "已变化，请核对后重新确认删除。" : failure.message });
      } finally {
        this.confirmingDelete = false;
      }
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
      if (receipt) {
        successToast("已切换当前清单");
        await this.loadPlanning();
      }
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
      if (receipt) {
        if (!plan && scope === "active") this.refreshChecklistContext = true;
        await this.loadPlanning();
      }
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
