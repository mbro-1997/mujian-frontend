const api = require("./props"),
  session = require("../session/storage");
const store = require("./prop-browser-store"),
  inlineLogin = require("../navigation/login-page");
module.exports = {
  ...inlineLogin,
  ...require("../navigation/scheme-picker"),
  data: {
    ...inlineLogin.data,
    schemeProp: null,
    styleOpen: false,
    typeOpen: false,
    typeLabel: "全部类型",
    items: [],
    feedState: "loading",
    message: "",
    busy: false,
    page: 0,
    total: "0",
    moreState: "idle",
    keyword: "",
    styleCodes: [],
    typeCode: "",
    options: { styles: [], types: [] },
    startDate: "",
    endDate: "",
    rental: false,
    currentChecklist: null,
    joinedQuantities: {},
    planningMessage: "",
  },
  parseStyles(raw) {
    try {
      const values = raw ? JSON.parse(raw) : [];
      return Array.isArray(values) &&
        values.length <= 3 &&
        new Set(values).size === values.length &&
        values.every(
          (x) => typeof x === "string" && /^[a-z][a-z0-9_]*$/.test(x),
        )
        ? values
        : [];
    } catch (_) {
      return [];
    }
  },
  onLoad(query) {
    this.setData({
      keyword: query.keyword || "",
      styleCodes: this.parseStyles(query.styles),
      typeCode: query.typeCode || "",
      startDate: query.startDate || "",
      endDate: query.endDate || "",
      rental: !!query.startDate,
    });
  },
  onSessionReset() {
    this.selectionRound = (this.selectionRound || 0) + 1;
    this.sequence = (this.sequence || 0) + 1;
    this.nextPending = false;
    this.rawItems = [];
    this.activeQuery = null;
    this.setData({
      items: [],
      page: 0,
      total: "0",
      busy: false,
      moreState: "idle",
      feedState: "blocked",
    });
  },
  async onShow() {
    await Promise.all([this.load(), this.loadSelection()]);
  },
  async loadSelection() {
    if (!this.data.rental || !session.token() || this.data.factoryRoot) return;
    const owner = session.capture(),
      round = (this.selectionRound = (this.selectionRound || 0) + 1);
    try {
      const result = await require("./planning-selection").read(
        this.data.startDate,
        this.data.endDate,
      );
      if (round !== this.selectionRound || !session.isCurrent(owner)) return;
      this.setData({
        currentChecklist: result.current,
        joinedQuantities: result.quantities,
        planningMessage: result.current
          ? ""
          : "此租期没有当前选品清单，请到清单页选择或新建。",
      });
      if (this.rawItems) this.renderItems(0, true);
    } catch (error) {
      if (round === this.selectionRound && session.isCurrent(owner))
        this.setData({
          currentChecklist: null,
          joinedQuantities: {},
          planningMessage: error.message,
        });
    }
  },
  openChecklist() {
    if (this.data.currentChecklist)
      wx.navigateTo({
        url: "/pages/checklist/detail?id=" + this.data.currentChecklist.id,
      });
    else wx.switchTab({ url: "/pages/checklist/index" });
  },
  onPageScroll(event) {
    this.scrollTop = event.scrollTop;
  },
  onHide() {
    this.remember();
  },
  onUnload() {
    this.remember();
    this.sequence = (this.sequence || 0) + 1;
  },
  // 存的是整批列表快照与原验证时刻，返回/翻页不会延长三分钟新鲜期。
  remember(fresh = false) {
    if (!this.activeQuery || !this.validatedAt || !this.rawItems) return;
    const existing = store.cache.peek(store.stateKey(this.activeQuery));
    store.cache.put(
      store.stateKey(this.activeQuery),
      {
        items: this.rawItems,
        page: this.data.page,
        total: this.data.total,
        exhausted: this.exhausted,
        top: this.scrollTop || 0,
        query: this.activeQuery,
      },
      this.validatedAt,
      !fresh && (this.needsRefresh || !!existing?.dirty),
    );
  },
  async load(force = false) {
    if (this.data.factoryRoot) return;
    const sequence = (this.sequence = (this.sequence || 0) + 1),
      owner = session.capture();
    this.nextPending = false;
    const query = store.query(this.data),
      key = store.stateKey(query),
      snapshot = store.cache.peek(key);
    this.activeQuery = query;
    if ((query.keyword || query.startDate) && !session.token()) {
      this.requireLogin();
      return;
    }
    const restore = snapshot && force !== true;
    if (restore) {
      this.rawItems = snapshot.value.items;
      this.validatedAt = snapshot.at;
      this.exhausted = snapshot.value.exhausted;
      this.setData({
        // 卡片另行分批提交，避免恢复多页时超过小程序setData包体限制。
        page: snapshot.value.page,
        total: snapshot.value.total,
        feedState: this.rawItems.length ? "ready" : "empty",
        busy: false,
        message: "",
        moreState: this.exhausted ? "end" : "idle",
      });
      this.renderItems(0, true);
      this.scrollTop = snapshot.value.top;
      if (wx.pageScrollTo)
        wx.pageScrollTo({ scrollTop: this.scrollTop, duration: 0 });
    } else if (!snapshot || store.stateKey(query) !== this.renderedKey) {
      this.rawItems = [];
      this.validatedAt = 0;
      this.scrollTop = 0;
      if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      this.setData({
        items: [],
        page: 0,
        total: "0",
        feedState: "loading",
        moreState: "idle",
        message: "",
      });
    }
    this.renderedKey = key;
    if (force === true || (snapshot && !snapshot.fresh)) store.staleLists();
    // 普通选项只展示启用项，完整管理选项接口不改变。
    store
      .options()
      .then((options) => {
        if (sequence !== this.sequence || !session.isCurrent(owner)) return;
        const types = options.types.filter((x) => x.enabled),
          styles = options.styles.filter((x) => x.enabled);
        this.setData({
          optionsMessage: "",
          typeLabel:
            (types.find((x) => x.code === this.data.typeCode) || {}).label ||
            "全部类型",
          options: {
            ...options,
            types,
            styles: styles.map((x) => ({
              ...x,
              selected: this.data.styleCodes.includes(x.code),
            })),
          },
        });
      })
      .catch((error) => {
        if (sequence === this.sequence && session.isCurrent(owner))
          this.setData({ optionsMessage: error.message });
      });
    this.needsRefresh = !!snapshot && !snapshot.fresh;
    if (restore && snapshot.fresh) {
      this.needsRefresh = false;
      return;
    }
    // 刷新整批重建第一页，成功后替换旧批次；暂时失败保留旧画面。
    this.needsRefresh = true;
    this.setData({ busy: true, message: "", moreState: "loading" });
    try {
      const result = await store.page(query, 1, force === true || !!snapshot);
      if (sequence !== this.sequence || !session.isCurrent(owner)) return;
      this.rawItems = [];
      this.appendResult(result, 1);
      this.validatedAt = result.fetchedAt;
      this.needsRefresh = false;
      this.remember(true);
    } catch (error) {
      if (sequence === this.sequence && session.isCurrent(owner))
        this.failure(error);
    } finally {
      if (sequence === this.sequence && session.isCurrent(owner))
        this.setData({ busy: false });
    }
  },
  // SKU去重保序；空批或只含已加载SKU时停止，避免异常分页无限请求。
  appendResult(result, page) {
    const previousCount = this.rawItems.length;
    const ids = new Set(this.rawItems.map((raw) => (raw.prop || raw).skuId));
    let added = 0;
    for (const raw of result.items) {
      const id = (raw.prop || raw).skuId;
      if (!ids.has(id)) {
        ids.add(id);
        this.rawItems.push(raw);
        added += 1;
      }
    }
    this.exhausted =
      !result.items.length ||
      !added ||
      this.rawItems.length >= Number(result.total);
    this.setData({
      page,
      total: result.total,
      feedState: this.rawItems.length ? "ready" : "empty",
      message: "",
      moreState: this.exhausted ? "end" : "idle",
    });
    this.renderItems(previousCount, page === 1);
  },
  // 追加只提交新增卡片；恢复缓存分小批渲染，不发送一个无限增长的数组。
  renderItems(start, reset) {
    if (reset) this.setData({ items: [] });
    for (
      let index = start;
      index < this.rawItems.length;
      index += store.config.pageSize
    ) {
      const update = {};
      for (
        let offset = index;
        offset < Math.min(index + store.config.pageSize, this.rawItems.length);
        offset += 1
      ) {
        const card = api.card(this.rawItems[offset]);
        update["items[" + offset + "]"] = {
          ...card,
          joinedQuantity: this.data.currentChecklist
            ? this.data.joinedQuantities[card.id] || 0
            : null,
        };
      }
      this.setData(update);
    }
  },
  onReachBottom() {
    if (!this.data.factoryRoot) return this.loadMore();
  },
  async loadMore() {
    if (
      this.nextPending ||
      this.data.busy ||
      this.exhausted ||
      !this.activeQuery
    )
      return;
    if (
      this.needsRefresh ||
      Date.now() - this.validatedAt >= store.config.freshMs
    )
      return this.load(true);
    this.nextPending = true;
    const sequence = this.sequence,
      owner = session.capture(),
      page = this.data.page + 1;
    this.setData({ moreState: "loading" });
    try {
      const result = await store.page(this.activeQuery, page);
      if (sequence !== this.sequence || !session.isCurrent(owner)) return;
      // 已知成员总数变化时重建整批，不能把新数据页拼到旧集合。
      if (String(result.total) !== String(this.data.total))
        return this.load(true);
      this.appendResult(result, page);
      this.remember();
    } catch (error) {
      if (sequence === this.sequence && session.isCurrent(owner))
        this.failure(error, true);
    } finally {
      if (sequence === this.sequence) this.nextPending = false;
    }
  },
  failure(error, append = false) {
    if (store.denied(error)) {
      store.removeInaccessible();
      this.rawItems = [];
      this.validatedAt = 0;
      this.setData({
        items: [],
        total: "0",
        page: 0,
        feedState: "blocked",
        message: error.message,
        moreState: "idle",
      });
      if (error.reason === "LOGIN_REQUIRED") this.requireLogin();
    } else
      this.setData({
        message: append ? "" : error.message,
        feedState: this.rawItems && this.rawItems.length ? "ready" : "error",
        moreState: append ? "error" : "idle",
      });
  },
  inaccessible(event) {
    this.failure({ status: 404, message: event.detail.message });
  },
  refresh() {
    return this.load(true);
  },
  retryMore() {
    return this.needsRefresh ? this.load(true) : this.loadMore();
  },
  async onPullDownRefresh() {
    try {
      await this.load(true);
    } finally {
      if (wx.stopPullDownRefresh) wx.stopPullDownRefresh();
    }
  },
  toggleStyles() {
    this.setData({ styleOpen: !this.data.styleOpen, typeOpen: false });
  },
  toggleTypes() {
    this.setData({ typeOpen: !this.data.typeOpen, styleOpen: false });
  },
  chooseType(e) {
    const code = e.currentTarget.dataset.code;
    if (code !== "" && !this.data.options.types.some((x) => x.code === code))
      return;
    this.setData({
      typeCode: code,
      typeLabel:
        (this.data.options.types.find((x) => x.code === code) || {}).label ||
        "全部类型",
      typeOpen: false,
      page: 1,
    });
    this.load();
  },
  input(e) {
    this.setData({ keyword: e.detail.value });
  },
  search() {
    this.setData({ page: 1 });
    this.load();
  },
  style(e) {
    const code = e.currentTarget.dataset.code,
      old = this.data.styleCodes;
    if (!old.includes(code) && old.length >= 3) {
      this.setData({ message: "最多选择3项风格" });
      return;
    }
    const styleCodes = old.includes(code)
      ? old.filter((x) => x !== code)
      : old.concat(code);
    const selected = new Set(styleCodes);
    this.setData({
      styleCodes,
      options: {
        ...this.data.options,
        styles: this.data.options.styles.map((x) => ({
          ...x,
          selected: selected.has(x.code),
        })),
      },
      page: 1,
    });
    this.load();
  },
  type(e) {
    this.setData({
      typeCode: this.data.options.types[Number(e.detail.value)].code,
      page: 1,
    });
    this.load();
  },
  filter(e) {
    this.setData({
      [e.currentTarget.dataset.key]:
        e.detail.value === "0"
          ? ""
          : this.data.options[e.currentTarget.dataset.group][
              Number(e.detail.value) - 1
            ].code,
      page: 1,
    });
    this.load();
  },
  reset() {
    this.setData({
      keyword: "",
      typeCode: "",
      typeLabel: "全部类型",
      styleCodes: [],
      options: {
        ...this.data.options,
        styles: this.data.options.styles.map((x) => ({
          ...x,
          selected: false,
        })),
      },
      page: 1,
    });
    this.load();
  },
  dates() {
    const target = require("../constants/routes").safeReturn(
      "/pages/props/browse?" +
        api.query({
          keyword: this.data.keyword,
          styles: JSON.stringify(this.data.styleCodes),
          typeCode: this.data.typeCode,
        }),
    );
    wx.navigateTo({
      url: "/pages/props/dates?return=" + encodeURIComponent(target),
    });
  },
  requireLogin() {
    this.setData({ items: [], total: "0", feedState: "blocked", message: "" });
    this.login();
  },
  login() {
    this.openLogin(
      "/pages/props/browse?" +
        api.query({
          keyword: this.data.keyword,
          styles: JSON.stringify(this.data.styleCodes),
          typeCode: this.data.typeCode,
          startDate: this.data.rental ? this.data.startDate : "",
          endDate: this.data.rental ? this.data.endDate : "",
        }),
    );
  },
  joinScheme(event) {
    const item = this.data.items.find(row => row.id === event.detail.id);
    if (item && !this.data.rental) this.openSchemePicker(item);
  },
  open(event) {
    const id = event.detail.id,
      dates = {
        startDate: this.data.rental ? this.data.startDate : "",
        endDate: this.data.rental ? this.data.endDate : "",
      };
    const raw = (this.rawItems || []).find(
      (value) => (value.prop || value).skuId === id,
    );
    if (raw)
      store.cache.put(
        store.cache.key("detail-baseline", { id, ...dates }),
        raw,
      );
    this.remember();
    wx.navigateTo({
      url: "/pages/props/product?" + api.query({ id, ...dates }),
    });
  },
};
