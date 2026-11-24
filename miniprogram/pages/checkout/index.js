const { ValidationError } = require("../../services/form-error");
const api = require('../../services/trading'),
  ui = require('../../services/trading-page');
require('../../session/page')({
  data: {
    id: '',
    detail: null,
    address: null,
    groups: [],
    deliveryFilters: [
      { key: 'outboundService', title: '送货到场', options: [
        { code: 'factory_delivery', label: '工厂配送 · 按车型与路线报价' },
        { code: 'factory_assisted_call', label: '工厂协助叫车 · 到付，当前不预收' },
        { code: 'self_pickup', label: '自行取货 · 不收配送费' },
      ] },
      { key: 'returnService', title: '使用后归还', options: [
        { code: 'user_return', label: '自行归还' },
        { code: 'factory_pickup', label: '工厂上门取回 · 单独核算返程路线' },
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
          outboundService: previous?.outboundService || 'self_pickup',
          returnService: previous?.returnService || 'user_return',
          buyerRemark: previous?.buyerRemark || '',
        };
      });
      if (this.data.detail && this.data.detail.version !== detail.version)
        this.setData({ quote: null, showCoupons: false, step: 1 });
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
            this.setData({ quote: null, showCoupons: false, step: 1 });
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
    });
  },
  address() {
    if (this.data.pending || this.data.busy) return;
    wx.navigateTo({
      url: '/pages/address/index?select=1',
      events: {
        addressSelected: (selected) => {
          this.selectedAddressId = selected.addressId;
          this.setData({ quote: null, showCoupons: false, step: 1 });
        },
      },
    });
  },
  choice(e) {
    if (this.data.busy || this.data.pending) return;
    const { index } = e.currentTarget.dataset;
    const { field, value } = e.detail;
    if (!['outboundService', 'returnService'].includes(field)) return;
    this.setData({ ['groups[' + index + '].' + field]: value, quote: null, showCoupons: false, step: 1 });
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
    return ui.run(this, current => this.fetchQuote(current, this.data.couponId, this.data.couponChosen));
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
      this.setData({ quote: null, showCoupons: true, draftCouponId: null, draftSaving: api.money(0),
        message: item?.reason || '原优惠券已不可用，请重新选择' });
      return;
    }
    const quote = await api.post('/api/me/checkout-quotes', input, { readOnly: true });
    if (current())
      this.setData({
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
    if (!this.data.pending) this.setData({ step: 1, quote: null });
  },
  coupons() {
    if (this.data.busy || this.data.pending) return;
    const selected = this.data.choices.find(item => item.id === this.data.couponId);
    this.setData({ showCoupons: true, draftCouponId: selected?.id || null,
      draftSaving: selected?.saving || api.money(0) });
  },
  cancelCoupons() {
    if (this.data.busy) return;
    this.setData({ showCoupons: false, message: '', step: this.data.quote ? 2 : 1 });
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
    return ui.run(this, current => this.fetchQuote(current, this.data.draftCouponId, true));
  },
  onAccessLost() {
    this.setData({ choices: [], usableChoices: [], unavailableChoices: [], showCoupons: false,
      address: null, groups: [], priceSheet: null, couponId: null, couponChosen: false, step: 1 });
  },
  priceSheet() {
    return ui.run(this, async (current) => {
      const result = await api.get('/api/me/transport-price-sheet');
      if (current())
        this.setData({
          priceSheet: {
            ...result,
            rules: result.rules.map((rule) => ({
              ...rule,
              vehicleName:
                result.vehicles.find((item) => item.id === rule.vehicleTierId)?.tierName || '',
              min: api.money(rule.guideMinFen),
              max: api.money(rule.guideMaxFen),
              extra: rule.extraKmFen === null ? '不支持' : api.money(rule.extraKmFen),
            })),
          },
        });
    });
  },
  closeSheet() {
    this.setData({ priceSheet: null });
  },
  async submit() {
    if (!this.data.quote || this.data.showCoupons) return;
    await ui.run(this, async (current) => {
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
    return ui.run(this, async (current) => {
      const receipt = await api.recover('checkout:' + this.data.id);
      if (!receipt) throw new Error('没有待恢复操作，请重新读取清单');
      if (current()) wx.redirectTo({ url: '/pages/payment/index?id=' + receipt.resourceId });
    });
  },
});
