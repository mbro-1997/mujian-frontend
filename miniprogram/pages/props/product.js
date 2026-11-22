const api = require("../../services/props"),
  session = require("../../session/storage");
const store = require("../../services/prop-browser-store"),
  inlineLogin = require("../../navigation/login-page");
require("../../session/page")({
  ...inlineLogin,
  ...require("../../navigation/scheme-picker"),
  data: {
    ...inlineLogin.data,
    schemeProp: null,
    checklistProp: null,
    id: "",
    startDate: "",
    endDate: "",
    item: null,
    details: null,
    availability: null,
    loginRequired: false,
    rows: [],
    message: "",
    busy: false,
    verified: false,
    currentImage: 0,
    loadedImages: [],
    joinedQuantity: null,
    selectionMessage: "",
  },
  onLoad(query) {
    this.openLegacyPicker = query.picker === "scheme";
    this.setData({
      id: query.id || "",
      startDate: query.startDate || "",
      endDate: query.endDate || "",
    });
  },
  customFactory(){wx.navigateTo({url:"/pages/custom/factory?id="+this.data.item.factory.id});},
  customize(){
    wx.navigateTo({url:"/pages/custom/form?factoryId="+this.data.item.factory.id+"&skuId="+this.data.id});
  },
  async onShow() {
    await Promise.all([this.load(), this.loadSelection()]);
    if (this.openLegacyPicker && this.data.verified) {
      this.openLegacyPicker = false;
      this.unavailable();
    }
  },
  async loadSelection() {
    if (!this.data.startDate || !session.token()) return;
    const owner = session.capture(),
      round = (this.selectionRound = (this.selectionRound || 0) + 1);
    try {
      const result = await require("../../services/planning-selection").read(
        this.data.startDate,
        this.data.endDate,
      );
      if (round !== this.selectionRound || !session.isCurrent(owner)) return;
      this.setData({
        joinedQuantity: result.current
          ? result.quantities[this.data.id] || 0
          : null,
        selectionMessage: result.current ? "" : "请先选择当前租期清单",
      });
    } catch (error) {
      if (round === this.selectionRound && session.isCurrent(owner))
        this.setData({ joinedQuantity: null, selectionMessage: error.message });
    }
  },
  onUnload() {
    this.loadRound = (this.loadRound || 0) + 1;
  },
  onSessionReset() {
    this.closeChecklistPicker();
    this.selectionRound = (this.selectionRound || 0) + 1;
    this.loadRound = (this.loadRound || 0) + 1;
    this.setData({
      item: null,
      details: null,
      verified: false,
      loadedImages: [],
    });
  },
  dates() {
    return { startDate: this.data.startDate, endDate: this.data.endDate };
  },
  applyResult(r) {
    const previous = this.data.details;
    const same =
      previous &&
      previous.images.length === r.details.images.length &&
      previous.images.every(
        (image, i) =>
          (image && image.cacheKey) ===
          (r.details.images[i] && r.details.images[i].cacheKey),
      );
    this.setData({
      item: r.prop,
      details: r.details,
      availability: r.availability,
      rent: api.money(r.prop.dailyRentPriceFen),
      deposit: api.money(r.prop.depositAmountFen),
      currentImage: same ? this.data.currentImage : 0,
      loadedImages: same
        ? this.data.loadedImages
        : r.details.images.map((_, i) => i === 0),
      rows: [
        ["尺寸说明", r.details.sizeDesc],
        [
          "长 × 宽 × 高",
          r.details.lengthCm +
            " × " +
            r.details.widthCm +
            " × " +
            r.details.heightCm +
            " cm",
        ],
        ["材质", r.details.materialDesc],
        ["重量", r.details.weightKg + " kg"],
        ["阻燃", r.details.fireResistance.label],
        ["运输建议", r.details.transportSuggestion],
      ].map(([label, value]) => ({ label, value })),
    });
  },
  async load() {
    const round = (this.loadRound = (this.loadRound || 0) + 1),
      owner = session.capture();
    this.setData({
      busy: true,
      verified: false,
      message: "",
      loginRequired: false,
    });
    if (this.data.startDate && !session.token()) {
      this.setData({
        busy: false,
        item: null,
        details: null,
        loginRequired: true,
        message: "请登录租赁方账号后查看租期库存",
      });
      return;
    }
    const cached = store.cache.peek(
      store.detailKey(this.data.id, this.dates()),
    );
    if (cached && !this.data.item) this.applyResult(cached.value);
    try {
      const r = await store.detail(this.data.id, this.dates(), true);
      if (round !== this.loadRound || !session.isCurrent(owner)) return;
      this.applyResult(r);
      this.setData({ verified: true });
      if (r.changed)
        wx.showModal({
          title: "道具信息已更新",
          content: "已展示当前信息，返回列表后将刷新相关结果。",
          showCancel: false,
        });
    } catch (error) {
      if (round !== this.loadRound || !session.isCurrent(owner)) return;
      if (store.denied(error))
        this.setData({
          item: null,
          details: null,
          availability: null,
          loadedImages: [],
        });
      this.setData({
        message:
          error.message +
          (this.data.item ? " 当前保留上次画面，尚未核验成功。" : ""),
      });
    } finally {
      if (round === this.loadRound && session.isCurrent(owner))
        this.setData({ busy: false });
    }
  },
  // 切换轮播才激活对应图片，已加载的相邻项继续保留。
  imageChanged(event) {
    const index = event.detail.current;
    this.setData({
      currentImage: index,
      ["loadedImages[" + index + "]"]: true,
    });
  },
  async preview(event) {
    if (!this.data.details) return;
    const owner = session.capture(),
      round = this.loadRound,
      index = Number(event.currentTarget.dataset.index) || 0;
    try {
      // 原生大图左右滑动需要完整URL集合，此时才为过期地址合并续取。
      const urls = await Promise.all(
        this.data.details.images.map((image) =>
          image
            ? store.images.ensure(image, this.data.id, () =>
                store.detail(this.data.id, this.dates(), true),
              )
            : null,
        ),
      );
      if (!session.isCurrent(owner) || round !== this.loadRound) return;
      const current = urls[index];
      if (current)
        wx.previewImage({
          urls: urls.filter(Boolean).map((image) => image.url),
          current: current.url,
        });
    } catch (error) {
      if (session.isCurrent(owner) && round === this.loadRound) {
        if (store.denied(error))
          this.setData({ item: null, details: null, verified: false });
        this.setData({ message: error.message });
      }
    }
  },
  inaccessible(event) {
    this.setData({
      item: null,
      details: null,
      verified: false,
      message: event.detail.message,
    });
  },
  unavailable() {
    if (this.data.busy || !this.data.verified || !this.data.item) return;
    if (!this.data.availability) return this.openSchemePicker(api.card(this.data.item));
    if (!session.token()) return this.login();
    if (this.data.availability.rentableStatus === "unavailable") return;
    this.setData({ checklistProp: { ...api.card(this.data.item), ...this.dates(), maxQuantity: this.data.availability.maxRentableQuantity } });
  },
  closeChecklistPicker() { this.setData({ checklistProp: null }); },
  checklistAdded() { this.closeChecklistPicker(); return this.loadSelection(); },
  login() {
    this.openLogin(
      "/pages/props/product?" +
        api.query({ id: this.data.id, ...this.dates() }),
    );
  },
});
