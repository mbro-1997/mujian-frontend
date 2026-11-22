const api = require('./trading'),
  ui = require('./trading-page');
module.exports = function (factory) {
  const endpoint = '/api/me/' + (factory ? 'factory-orders' : 'rental-orders');
  return {
    data: {
      exhausted: false,
      loadedRevision: -1,
      nextCheckAt: 0,
      items: [],
      page: 0,
      total: '0',
      view: 'all',
      keyword: '',
      submittedKeyword: '',
      factory,
      busy: false,
      message: '',
      tabs: [
        { code: 'all', label: '全部' },
        { code: 'pending_accept', label: '待接单' },
        { code: 'accepted', label: '待出库' },
        ...[
          'pending_receipt',
          'renting',
          'overdue',
          'return_in_transit',
          'return_checking',
          'return_closed',
          'completed',
        ].map((code) => ({ code, label: api.labels[code] })),
        { code: 'cancelled', label: '已终止' },
        { code: 'exceptions', label: '异常与争议' },
        { code: 'refund_exception', label: '退款异常' },
      ],
    },
    onLoad(q) {
      if (q.view) this.setData({ view: q.view });
    },
    onShow() {
      ui.show(this);
      if (
        this.data.page &&
        this.data.loadedRevision === api.revision.orders &&
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
        const revision = api.revision.orders;
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
        let rows = append ? [...this.data.items] : [],
          total = '0';
        let loadedPage = 0;
        const startedAt = Date.now();
        let emptyBatch = false;
        for (let page = append ? target : 1; page <= target; page++) {
          const result = await api.get(
            endpoint +
              '?view=' +
              this.data.view +
              (this.data.submittedKeyword
                ? '&keyword=' + encodeURIComponent(this.data.submittedKeyword)
                : '') +
              '&page=' +
              page
          );
          if (!current()) return;
          loadedPage = page;
          const seen = new Set(rows.map((item) => item.id));
          const previousCount = rows.length;
          for (const item of result.items) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            rows.push(api.order(item));
          }
          emptyBatch = rows.length === previousCount;
          total = result.total;
          if (rows.length >= Number(total) || emptyBatch) {
            break;
          }
        }
        let nextCheckAt = 0;
        for (const row of rows) {
          for (const raw of [
            row.nextDeadlineAt,
            row.orderStatus === 'pending_accept' && row.acceptDeadlineAt,
          ]) {
            const time = raw && api.dateMillis(raw);
            if (time > startedAt && (!nextCheckAt || time < nextCheckAt))
              nextCheckAt = time;
          }
        }
        ui.showList(this, rows, append);
        this.setData({
          page: loadedPage,
          total,
          loadedRevision: revision,
          nextCheckAt,
          exhausted: emptyBatch || rows.length >= Number(total),
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
        view: e.currentTarget.dataset.view,
        page: 0,
        items: [],
        total: '0',
        exhausted: false,
      });
      return this.load();
    },
    clearFilters() {
      if (this.data.busy) return;
      this.setData({ view: 'all', keyword: '' });
      return this.search();
    },
    keyword(e) {
      this.setData({ keyword: e.detail.value });
    },
    search() {
      if (this.data.busy) return;
      this.setData({
        page: 0,
        items: [],
        total: '0',
        exhausted: false,
        submittedKeyword: this.data.keyword.trim(),
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
    open(e) {
      wx.navigateTo({
        url:
          (factory ? '/pages/factory/order' : '/pages/orders/detail') +
          '?id=' +
          e.currentTarget.dataset.id,
      });
    },
  };
};
