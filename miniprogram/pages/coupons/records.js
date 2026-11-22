const api = require('../../services/trading'),
  ui = require('../../services/trading-page');
require('../../session/page')({
  data: { items: [], page: 0, total: '0', busy: false, message: '' },
  onShow() {
    ui.show(this);
    if (!this.data.page || this.data.seenRevision !== api.revision.wallet)
      return this.load();
  },
  onHide() {
    ui.hide(this);
  },
  onUnload() {
    ui.hide(this);
  },
  load(e, append = false) {
    return ui.run(this, async (current) => {
      this.retryAppend = append;
      const revision = api.revision.wallet;
      const page = append ? this.data.page + 1 : 1;
      const result = await api.get('/api/me/coupon-use-records?page=' + page);
      if (!current()) return;
      const rows = append ? [...this.data.items] : [],
        seen = new Set(rows.map((item) => item.usageId));
      rows.push(
        ...result.items
          .filter((item) => !seen.has(item.usageId))
          .map((item) => ({
            ...item,
            usedAtText: api.displayTime(item.usedAt),
            returnedAtText: api.displayTime(item.returnedAt),
            discount: api.money(item.discountFen),
            label: api.labels[item.status] || item.status,
          }))
      );
      const exhausted =
        !result.items.length ||
        (append && rows.length === this.data.items.length);
      ui.showList(this, rows, append);
      this.setData({
        seenRevision: revision,
        page,
        total: result.total,
        exhausted,
      });
    });
  },
  retry() {
    return this.load(null, !!this.retryAppend);
  },
  onReachBottom() {
    if (
      !this.data.exhausted &&
      this.data.items.length < Number(this.data.total)
    )
      return this.load(null, true);
  },
  open(e) {
    wx.navigateTo({
      url: '/pages/payment/index?id=' + e.currentTarget.dataset.id,
    });
  },
});
