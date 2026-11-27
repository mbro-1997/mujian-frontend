const api = require('../../services/trading'),
  ui = require('../../services/trading-page');
require('../../session/page')({
  data: {
    id: '',
    detail: null,
    busy: false,
    message: '',
    remaining: '',
    manual: false,
    pending: false,
  },
  onLoad(q) {
    this.setData({ id: q.id });
  },
  onShow() {
    ui.show(this);
    this.polls = 0;
    return this.load();
  },
  onHide() {
    ui.hide(this);
  },
  hasPendingOperation() {
    return ['pay:', 'close:'].some(key => api.pending.has(key + this.data.id));
  },
  onUnload() {
    ui.hide(this);
  },
  async load() {
    return ui.run(this, async (current) => {
      const detail = await api.get('/api/me/checkout-batches/' + this.data.id);
      if (!current()) return;
      const left = Math.max(
        0,
        Math.ceil((api.dateMillis(detail.payment.expireAt) - Date.now()) / 1000),
      );
      this.setData({
        detail: {
          ...detail,
          couponReturn: {
            ...detail.couponReturn,
            validUntilText: api.displayTime(detail.couponReturn.validUntil),
          },
          label: api.labels[detail.status] || detail.status,
          amounts: api.amounts(detail.amounts),
          paid: api.money(detail.payment.paidFen),
          refunded: api.money(detail.payment.refundedFen),
        },
        remaining: Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'),
        pending: api.pending.has('pay:' + this.data.id) || api.pending.has('close:' + this.data.id),
      });
      if (detail.status === 'pending_payment' && !detail.canContinuePay && !this.data.pending) {
        const debts = await Promise.all(['pending', 'paying'].map(status =>
          api.get('/api/me/compensation-receivables?page=1&pageSize=1&status=' + status)));
        if (!current()) return;
        this.setData({ outstandingCompensation: debts.some(page => Number(page.total) > 0) });
      } else this.setData({ outstandingCompensation: false });
      const launch = api.launches.get(this.data.id);
      api.launches.delete(this.data.id);
      if (launch && detail.canContinuePay) {
        await api.nativePayment(launch, current);
        if (!current()) return;
      }
      if (['pending_payment', 'payment_exception', 'refund_processing'].includes(detail.status)) {
        if ((this.polls = (this.polls || 0) + 1) < 30)
          this.tradeTimer = setTimeout(() => {
            if (current()) this.load();
          }, 2000);
        else this.setData({ manual: true });
      }
    });
  },
  refresh() {
    this.polls = 0;
    this.setData({ manual: false });
    return this.load();
  },
  pay() {
    return ui.act(this, async (current) => {
      const result = await api.command(
        'pay:' + this.data.id,
        '/api/me/checkout-batches/' + this.data.id + '/pay',
        { expectedVersion: this.data.detail.version },
      );
      if (!current()) return;
      if (result.parameters) await api.nativePayment(result.parameters, current);
      if (current()) this.tradeTimer = setTimeout(() => this.refresh(), 0);
    });
  },
  async cancel() {
    if (
      !(await ui.confirm(
        '取消这次付款？',
        '平台将核实原付款并关闭未付单。结果确认前库存和优惠券仍保留，已收到的款项按原路退款。',
      ))
    )
      return;
    await ui.act(this, async (current) => {
      await api.command(
        'close:' + this.data.id,
        '/api/me/checkout-batches/' + this.data.id + '/cancel',
        { expectedVersion: this.data.detail.version },
      );
      if (current()) this.tradeTimer = setTimeout(() => this.refresh(), 0);
    });
  },
  recover() {
    return ui.act(this, async (current) => {
      let found = false;
      for (const slot of ['pay:', 'close:'])
        if (api.pending.has(slot + this.data.id)) {
          await api.recover(slot + this.data.id);
          found = true;
        }
      if (!found) throw new Error('没有待确认操作，请查询当前付款状态');
      if (current()) this.tradeTimer = setTimeout(() => this.refresh(), 0);
    });
  },
  order(e) {
    wx.navigateTo({ url: '/pages/orders/detail?id=' + e.currentTarget.dataset.id });
  },
  refund(e) {
    wx.navigateTo({ url: '/pages/refund/detail?id=' + e.currentTarget.dataset.id });
  },
  checklist() {
    wx.redirectTo({ url: '/pages/checklist/detail?id=' + this.data.detail.checklistId });
  },
  coupon() {
    wx.navigateTo({
      url: '/pages/coupons/detail?id=' + this.data.detail.couponReturn.userCouponId,
    });
  },
});
