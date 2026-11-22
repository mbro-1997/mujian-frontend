const api = require('../../services/trading'),
  ui = require('../../services/trading-page');
require('../../session/page')({
  data: { id: '', detail: null, busy: false, message: '' },
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
  onUnload() {
    ui.hide(this);
  },
  load() {
    return ui.run(this, async (current) => {
      const detail = await api.get('/api/me/refunds/' + this.data.id);
      if (!current()) return;
      this.setData({
        detail: {
          ...detail,
          couponReturn: {
            ...detail.couponReturn,
            validUntilText: api.displayTime(detail.couponReturn.validUntil),
          },
          requestedAtText: api.displayTime(detail.requestedAt),
          successAtText: api.displayTime(detail.successAt),
          label: api.labels[detail.status],
          rent: api.money(detail.goodsFen ?? detail.rentFen),
          deposit: api.money(detail.depositFen),
          freight: api.money(detail.freightFen),
          total: api.money(detail.totalFen),
        },
      });
      if (
        ['pending', 'processing', 'failed'].includes(detail.status) &&
        (this.polls = (this.polls || 0) + 1) < 30
      )
        this.tradeTimer = setTimeout(() => {
          if (current()) this.load();
        }, 2000);
    });
  },
  coupon() {
    wx.navigateTo({
      url: '/pages/coupons/detail?id=' + this.data.detail.couponReturn.userCouponId,
    });
  },
});
