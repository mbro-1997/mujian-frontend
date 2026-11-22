const api = require('../../services/trading'),
  ui = require('../../services/trading-page');
require('../../session/page')({
  data: { id: '', detail: null, busy: false, message: '' },
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
  onAccessLost() { api.checkListCard("wallet", this.data.id, null); },
  load() {
    return ui.run(this, async (current) => {
      const detail = await api.get('/api/me/coupons/' + this.data.id);
      if (!current()) return;
      const card = api.coupon(detail);
      api.checkListCard("wallet", this.data.id, card);
      this.setData({ detail: card });
    });
  },
  use() {
    wx.switchTab({ url: '/pages/home/index' });
  },
});
