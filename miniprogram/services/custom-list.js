const c = require('./custom'),
  ui = require('./trading-page');
module.exports = (factory) =>
  require('../session/page')({
    data: {
      factory,
      filterGroups: [{"key": "kind", "title": "业务类型", "options": [{"code": "requirements", "label": "定制需求"}, {"code": "orders", "label": "购买订单"}]}],
      kind: 'requirements',
      loadedRevision: -1,
      status: '',
      choices: [],
      rows: [],
      page: 0,
      total: 0,
      busy: false,
      message: '',
    },
    onShow() {
      ui.show(this);
      if (
        !this.data.page ||
        this.data.loadedRevision !== c.revision(factory, this.data.kind) ||
        c.changed(factory, this.data.kind).size
      )
        return this.load(false);
    },
    onHide() {
      ui.hide(this);
    },
    onUnload() {
      ui.hide(this);
    },
    load(append) {
      return ui.run(this, async (current) => {
        this.retryAppend = append;
        const { kind, status } = this.data,
          rows = append ? [...this.data.rows] : [];
        const revision = c.revision(factory, kind);
        const changes = c.changed(factory, kind);
        if (changes.size || revision !== this.data.loadedRevision) {
          append = false;
          rows.length = 0;
        }
        const last = append ? this.data.page + 1 : Math.max(1, this.data.page);
        let exhausted = false;
        const seen = new Set(rows.map((row) => row.id));
        let page = 0,
          total = 0;
        for (let i = append ? last : 1; i <= last; i++) {
          const result = await c.get(
            c.root(factory, kind) +
              '?page=' +
              i +
              '&pageSize=20' +
              (status ? '&status=' + status : '')
          );
          if (!current()) return;
          const previousCount = rows.length;
          for (const row of result.items) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            rows.push(c.display(row));
          }
          total = Number(result.total);
          page = i;
          exhausted = rows.length === previousCount || rows.length >= total;
          if (exhausted) break;
        }
        ui.showList(this, rows, append, 'rows');
        this.setData({
          page,
          total,
          exhausted,
          loadedRevision: revision,
          choices: ['全部状态', ...c.states[kind].map((k) => c.labels[k])],
          filterIndex: c.states[kind].indexOf(status) + 1,
          filterLabel: c.labels[status] || '全部状态',
        });
        c.acknowledge(factory, kind, changes);
      });
    },
    onPullDownRefresh() {
      return Promise.resolve(this.load(false)).finally(() =>
        wx.stopPullDownRefresh()
      );
    },
    resetFilters() {
      if (this.data.busy) return;
      this.setData({ kind: 'requirements', status: '', rows: [], page: 0, total: 0, exhausted: false });
      return this.load(false);
    },
    tab(e) {
      if (this.data.busy) return;
      this.setData({
        kind: e.detail.value,
        status: '',
        page: 0,
        rows: [],
      });
      return this.load(false);
    },
    filter(e) {
      if (this.data.busy) return;
      this.setData({
        status: c.states[this.data.kind][Number(e.detail.value) - 1] || '',
        rows: [],
        total: 0,
        exhausted: false,
        page: 0,
      });
      return this.load(false);
    },
    more() {
      if (!this.data.exhausted && this.data.rows.length < this.data.total)
        return this.load(true);
    },
    retry() {
      return this.load(!!this.retryAppend);
    },
    open(e) {
      wx.navigateTo({
        url:
          (factory ? '/pages/factory/custom-detail' : '/pages/custom/detail') +
          '?kind=' +
          this.data.kind +
          '&id=' +
          e.currentTarget.dataset.id,
      });
    },
    create() {
      wx.navigateTo({ url: '/pages/custom/form' });
    },
  });
