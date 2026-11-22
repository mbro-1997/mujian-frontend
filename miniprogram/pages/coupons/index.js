const api = require('../../services/trading'),
  ui = require('../../services/trading-page');
require('../../session/page')({
  data: {
    exhausted: false,
    loadedRevision: -1,
    nextCheckAt: 0,
    items: [],
    status: 'available',
    availableCount: '0',
    unavailableCount: '0',
    page: 0,
    total: '0',
    busy: false,
    message: '',
  },
  onShow() {
    ui.show(this);
    if (
      this.data.page &&
      this.data.loadedRevision === api.revision.wallet &&
      (!this.data.nextCheckAt || Date.now() < this.data.nextCheckAt)
    )
      return;
    return this.load(null, false, true);
  },
  onHide() {
    ui.hide(this);
  },
  onUnload() {
    ui.hide(this);
  },
  load(e, append = false, restore = false) {
    return ui.run(this, async (current) => {
      this.retryOptions = { append, restore };
      const revision = api.revision.wallet;
      if (
        this.data.loadedRevision !== revision ||
        (this.data.nextCheckAt && Date.now() >= this.data.nextCheckAt)
      ) {
        append = false;
        restore = true;
      }
      const target = append
        ? this.data.page + 1
        : restore
        ? Math.max(1, this.data.page)
        : 1;
      let counts;
      let rows = append ? [...this.data.items] : [];
      let loadedPage = 0;
      const startedAt = Date.now();
      let emptyBatch = false;
      for (let page = append ? target : 1; page <= target; page++) {
        const result = await api.get(
          '/api/me/coupons?status=' + this.data.status + '&page=' + page
        );
        if (!current()) return;
        loadedPage = page;
        const seen = new Set(rows.map((item) => item.id));
        const previousCount = rows.length;
        for (const item of result.items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          rows.push(api.coupon(item));
        }
        emptyBatch = rows.length === previousCount;
        counts = {
          availableCount: result.availableCount,
          unavailableCount: result.unavailableCount,
          total: result.total,
        };
        if (emptyBatch || rows.length >= Number(result.total)) break;
      }
      let nextCheckAt = 0;
      for (const row of rows) {
        if (!['available', 'returned'].includes(row.status)) continue;
        for (const raw of [row.validFrom, row.validUntil]) {
          const time = raw && api.dateMillis(raw);
          if (time > startedAt && (!nextCheckAt || time < nextCheckAt))
            nextCheckAt = time;
        }
      }
      ui.showList(this, rows, append);
      this.setData({
        ...counts,
        page: loadedPage,
        loadedRevision: revision,
        nextCheckAt,
        exhausted: emptyBatch || rows.length >= Number(counts.total),
      });
    });
  },
  retry() {
    const { append, restore } = this.retryOptions || {};
    return this.load(null, !!append, !!restore);
  },
  filter(e) {
    if (this.data.busy) return;
    this.setData({
      status: e.currentTarget.dataset.status,
      page: 0,
      items: [],
      total: '0',
      exhausted: false,
    });
    return this.load();
  },
  onPullDownRefresh() {
    return Promise.resolve(this.load(null, false, true)).finally(() =>
      wx.stopPullDownRefresh()
    );
  },
  onReachBottom() {
    if (
      !this.data.exhausted &&
      this.data.items.length < Number(this.data.total)
    )
      return this.load(null, true);
  },
  detail(e) {
    wx.navigateTo({
      url: '/pages/coupons/detail?id=' + e.currentTarget.dataset.id,
    });
  },
  openOffers() {
    this.selectComponent('#couponOffers')?.open();
  },
  refreshWallet() {
    return this.load(null, false, true);
  },
  records() {
    wx.navigateTo({ url: '/pages/coupons/records' });
  },
});
