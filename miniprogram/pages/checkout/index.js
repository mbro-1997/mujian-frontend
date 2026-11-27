const { hint, ValidationError } = require("../../services/form-error");
const api = require('../../services/trading'),
  ui = require('../../services/trading-page');
// 每个城市按真实里程档排列。某车型缺档时不推算价格。
function priceTables(sheet) {
  const cities = new Map();
  const vehicles = new Map(sheet.vehicles.map(vehicle => [vehicle.id, vehicle]));
  for (const rule of sheet.rules) {
    const city = cities.get(rule.cityCode) || { ranges: new Map(), rows: new Map() };
    cities.set(rule.cityCode, city);
    const key = rule.distanceMinMeter + '/' + rule.distanceMaxMeter;
    const min = rule.distanceMinMeter / 1000;
    city.ranges.set(key, { key, min, label: rule.distanceMaxMeter == null
      ? min + ' km 起' : min + '–' + rule.distanceMaxMeter / 1000 + ' km' });
    const row = city.rows.get(rule.vehicleTierId) || new Map();
    city.rows.set(rule.vehicleTierId, row);
    row.set(key, {
      price: '¥' + api.money(rule.guideMinFen) + '–' + api.money(rule.guideMaxFen),
      basis: '含 ' + rule.includedDistanceMeter / 1000 + ' km',
      extra: rule.extraKmFen == null ? '不支持超程' : '超程 ¥' + api.money(rule.extraKmFen) + '/km',
    });
  }
  return Array.from(cities, ([cityCode, city]) => {
    const ranges = Array.from(city.ranges.values()).sort((a, b) => a.min - b.min);
    const rows = Array.from(city.rows, ([id, cells]) => ({
      id, name: vehicles.get(id)?.tierName || '车型资料缺失',
      prices: ranges.map(range => ({ key: range.key, ...cells.get(range.key) })),
    }));
    return { cityCode, ranges, rows };
  });
}
require('../../session/page')({
  data: {
    id: '',
    detail: null,
    address: null,
    groups: [],
    deliveryFilters: [
      { key: 'outboundService', title: '去程', options: [
        { code: 'factory_delivery', label: '工厂配送', note: '按路线报价' },
        { code: 'factory_assisted_call', label: '工厂代叫', note: '运费到付' },
        { code: 'self_pickup', label: '用户自提', note: '免配送费' },
      ] },
      { key: 'returnService', title: '回程', options: [
        { code: 'user_return', label: '用户送回', note: '自行安排' },
        { code: 'factory_pickup', label: '工厂取回', note: '按回程报价' },
      ] },
    ],
    quote: null,
    couponId: null,
    couponChosen: false,
    choices: [],
    showCoupons: false,
    draftCouponId: null,
    draftSaving: '0.00',
    priceSheet: null,
    step: 1,
    busy: false,
    message: '',
    pending: false,
  },
  onLoad(q) {
    this.setData({ id: q.id });
  },
  onShow() {
    ui.show(this);
    return this.load();
  },
  onHide() {
    ui.hide(this);
  },
  onUnload() {
    ui.hide(this);
  },
  load() {
    return ui.run(this, async (current) => {
      const detail = await api.get('/api/me/checklists/' + this.data.id);
      if (!current()) return;
      if (detail.currentCheckoutBatchId) {
        wx.redirectTo({ url: '/pages/payment/index?id=' + detail.currentCheckoutBatchId });
        return;
      }
      const groups = detail.groups.map((group) => {
        const previous = this.data.groups.find((item) => item.factoryId === group.factoryId);
        return {
          factoryId: group.factoryId,
          factoryName: group.factoryName,
          itemCount: group.items.length,
          outboundService: previous?.outboundService || 'self_pickup',
          returnService: previous?.returnService || 'user_return',
          buyerRemark: previous?.buyerRemark || '',
        };
      });
      if (this.data.detail && this.data.detail.version !== detail.version)
        this.setCheckoutView({ quote: null, showCoupons: false, step: 1 });
      this.setData({ detail, groups, pending: api.pending.has('checkout:' + this.data.id) });
      if (this.selectedAddressId || this.data.address) {
        const address = await api.get(
          '/api/me/addresses/' + (this.selectedAddressId || this.data.address.id),
        );
        if (current()) {
          if (
            this.data.address &&
            (this.data.address.id !== address.id || this.data.address.version !== address.version)
          )
            this.setCheckoutView({ quote: null, showCoupons: false, step: 1 });
          this.selectedAddressId = null;
          this.setData({ address });
        }
      } else {
        const addresses = await api.get('/api/me/addresses');
        if (current())
          this.setData({
            address: addresses.items.find((item) => item.isDefault) || addresses.items[0] || null,
          });
      }
      if (current() && !this.data.priceSheet) await this.readPrices(current);
    });
  },
  setCheckoutView(changes) {
    this.setData(changes);
    const title = this.data.showCoupons ? '选择优惠券' : this.data.step === 2 ? '确认结算' : '选择配送';
    wx.setNavigationBarTitle({ title });
  },
  address() {
    if (this.data.pending || this.data.busy) return;
    wx.navigateTo({
      url: '/pages/address/index?select=1',
      events: {
        addressSelected: (selected) => {
          this.selectedAddressId = selected.addressId;
          this.setCheckoutView({ quote: null, showCoupons: false, step: 1 });
        },
      },
    });
  },
  choice(e) {
    if (this.data.busy || this.data.pending) return;
    const { index, field, value } = e.currentTarget.dataset;
    if (!['outboundService', 'returnService'].includes(field)) return;
    this.setCheckoutView({ ['groups[' + index + '].' + field]: value, quote: null, showCoupons: false, step: 1 });
  },
  remark(e) {
    if (this.data.pending || this.data.busy) return;
    this.setData({
      ['groups[' + e.currentTarget.dataset.index + '].buyerRemark']: e.detail.value,
      quote: null,
    });
  },
  input() {
    if (!this.data.address) throw new ValidationError('请先选择收货地址');
    return {
      checklistId: this.data.id,
      expectedVersion: this.data.detail.version,
      addressId: this.data.address.id,
      addressVersion: this.data.address.version,
      couponId: this.data.couponId,
      deliveries: this.data.groups.map(
        ({ factoryId, outboundService, returnService, buyerRemark }) => ({
          factoryId,
          outboundService,
          returnService,
          buyerRemark: buyerRemark.trim() || null,
        }),
      ),
    };
  },
  quote() {
    if (this.data.pending) return;
    return ui.act(this, current => this.fetchQuote(current, this.data.couponId, this.data.couponChosen));
  },
  async fetchQuote(current, couponId, chosen) {
    const input = { ...this.input(), couponId };
    const choices = await api.post('/api/me/checkout-coupons', input, { readOnly: true });
    if (!current()) return;
    const best = choices.items.find((item) => item.usable && item.savingFen > 0);
    if (!chosen) {
      input.couponId = best ? best.coupon.id : null;
    }
    const options = choices.items.map((item) => ({
        ...item,
        id: item.coupon.id,
        coupon: api.coupon(item.coupon),
        saving: api.money(item.savingFen),
        reason:
          api.reasons[item.reasonCode] ||
          {
            COUPON_SCOPE_MISMATCH: '本次不含适用工厂',
            COUPON_THRESHOLD_NOT_MET: '未达到使用门槛',
          }[item.reasonCode] ||
          '当前结算不符合此券条件',
      }));
    this.setData({ choices: options, usableChoices: options.filter(item => item.usable),
      unavailableChoices: options.filter(item => !item.usable) });
    if (chosen && couponId && !options.some(item => item.id === couponId && item.usable)) {
      const item = options.find(item => item.id === couponId);
      this.setCheckoutView({ quote: null, showCoupons: true, draftCouponId: null, draftSaving: api.money(0) });
      hint(item?.reason || '原优惠券已不可用，请重新选择');
      return;
    }
    const quote = await api.post('/api/me/checkout-quotes', input, { readOnly: true });
    if (current())
      this.setCheckoutView({
        quote: {
          ...quote,
          groups: quote.groups.map(api.group),
          amounts: api.amounts(quote.amounts),
        },
        couponId: input.couponId,
        couponChosen: chosen,
        step: 2,
        showCoupons: false,
      });
  },
  edit() {
    if (!this.data.pending) this.setCheckoutView({ step: 1, quote: null });
  },
  coupons() {
    if (this.data.busy || this.data.pending) return;
    const selected = this.data.choices.find(item => item.id === this.data.couponId);
    this.setCheckoutView({ showCoupons: true, draftCouponId: selected?.id || null,
      draftSaving: selected?.saving || api.money(0) });
  },
  cancelCoupons() {
    if (this.data.busy) return;
    this.setCheckoutView({ showCoupons: false, message: '', step: this.data.quote ? 2 : 1 });
  },
  chooseCoupon(e) {
    if (this.data.busy || !this.data.showCoupons) return;
    const id = e.currentTarget.dataset.id || null;
    const item = this.data.choices.find(row => row.id === id && row.usable);
    if (id && !item) return;
    this.setData({ draftCouponId: id, draftSaving: item?.saving || api.money(0) });
  },
  confirmCoupon() {
    if (!this.data.showCoupons || this.data.pending) return;
    return ui.act(this, current => this.fetchQuote(current, this.data.draftCouponId, true));
  },
  onAccessLost() {
    this.setCheckoutView({ choices: [], usableChoices: [], unavailableChoices: [], showCoupons: false,
      address: null, groups: [], priceSheet: null, couponId: null, couponChosen: false, step: 1 });
  },
  retryPrices() {
    return ui.act(this, current => this.readPrices(current));
  },
  async readPrices(current) {
    try {
      const result = await api.get('/api/me/transport-price-sheet');
      if (current())
        this.setData({
          priceSheet: priceTables(result),
        });
    } catch (error) {
      if (current()) hint(api.message(error).split(' 追踪号：')[0]);
    }
  },
  async submit() {
    if (this.data.pending || !this.data.quote || this.data.showCoupons) return;
    await ui.act(this, async (current) => {
      try {
        const result = await api.command('checkout:' + this.data.id, '/api/me/checkout-batches', {
          quoteToken: this.data.quote.quoteToken,
        });
        if (!current()) return;
        const id = result.recovered ? result.receipt.resourceId : result.batch.id;
        if (result.parameters) api.launches.set(id, result.parameters);
        wx.redirectTo({ url: '/pages/payment/index?id=' + id });
      } finally {
        if (current()) this.setData({ pending: api.pending.has('checkout:' + this.data.id) });
      }
    });
  },
  recover() {
    return ui.act(this, async (current) => {
      const receipt = await api.recover('checkout:' + this.data.id);
      if (!receipt) throw new Error('没有待恢复操作，请重新读取清单');
      if (current()) wx.redirectTo({ url: '/pages/payment/index?id=' + receipt.resourceId });
    });
  },
});
