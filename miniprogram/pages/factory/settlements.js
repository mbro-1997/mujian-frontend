const readWindow = require('../../services/read-list-window');
const api = require('../../services/trading');
const ui = require('../../services/trading-page');
const base = '/api/me/factory-settlements';
const stages = {
  success: '成功',
  settled: '已到账',
  included: '已入批',
  not_required: '无需分佣',
};
function yuan(fen) {
  const value = String(fen).padStart(3, '0');
  return value.slice(0, -2) + '.' + value.slice(-2);
}
// 批次金额可能超过 Number 安全范围，小程序低版本也可进行十进制加法。
function plus(a, b) {
  let i = a.length - 1,
    j = b.length - 1,
    carry = 0,
    result = '';
  while (i >= 0 || j >= 0 || carry) {
    const n = Number(a[i--] || 0) + Number(b[j--] || 0) + carry;
    result = String(n % 10) + result;
    carry = Math.floor(n / 10);
  }
  return result || '0';
}
const stamp = (t) => (t ? t.slice(0, 16).replace('T', ' ') : '');
function format(row) {
  const result = { ...row };
  Object.keys(row)
    .filter((k) => k.endsWith('Fen'))
    .forEach((k) => (result[k.slice(0, -3)] = yuan(row[k])));
  return {
    ...result,
    date: stamp(row.settledAt),
    commissionStage: stages[row.commissionStatus],
    unlockStage: stages[row.unfreezeStatus],
  };
}
require('../../session/page')({
  data: {
    id: '',
    items: [],
    page: 0,
    more: false,
    total: '0',
    detail: null,
    groups: [],
    busy: false,
    message: '',
    month: null,
    lifetime: null,
  },
  onLoad(q) {
    this.setData({ id: q.id || '' });
    wx.setNavigationBarTitle({ title: q.id ? '结算详情' : '我的结算' });
  },
  onShow() {
    ui.show(this);
    return this.refresh();
  },
  onHide() {
    ui.hide(this);
  },
  onUnload() {
    ui.hide(this);
  },
  refresh() {
    return ui.run(this, (current) =>
      this.data.id ? this.readDetail(current) : this.readList(1, current),
    );
  },
  async readList(page, current) {
    const data = await readWindow(page, Math.max(page, this.data.page),
      n => api.get(base + '?page=' + n + '&pageSize=20'), current);
    if (!data) return;
    const rows = page === 1 ? [] : this.data.items.slice();
    const seen = new Set(rows.map(row => row.id)), before = rows.length;
    for (const row of data.items) if (!seen.has(row.id)) rows.push(format(row));
    const more = !data.exhausted && rows.length > before && rows.length < Number(data.total);
    const shanghai = new Date(Date.now() + 8 * 3600000)
      .toISOString()
      .slice(0, 7);
    const complete = !more && rows.length === Number(data.total);
    this.setData({
      items: rows,
      page: data.page,
      more,
      total: data.total,
      month: complete
        ? yuan(
            rows
              .filter((r) => r.settledAt.slice(0, 7) === shanghai)
              .reduce((v, r) => plus(v, r.actualUnlockFen), '0'),
          )
        : null,
      lifetime: complete
        ? yuan(rows.reduce((v, r) => plus(v, r.actualUnlockFen), '0'))
        : null,
    });
  },
  moreBatches() {
    return ui.run(this, (current) =>
      this.readList(this.data.page + 1, current),
    );
  },
  open(e) {
    wx.navigateTo({
      url: '/pages/factory/settlements?id=' + e.currentTarget.dataset.id,
    });
  },
  async readDetail(current) {
    const path = base + '/' + this.data.id;
    const readGroup = async key => {
      const last = this.data.groups.find(group => group.key === key)?.page || 1;
      const result = await readWindow(1, last, n => api.get(path + '/' + key + '?pageSize=10' +
        (n === 1 ? '' : '&page=' + n)), current);
      return result && this.group(key, { ...result, pageSize: 10 });
    };
    const [detail, items, executions] = await Promise.all([api.get(path), readGroup('items'), readGroup('executions')]);
    if (current()) this.setData({ detail: { ...detail, summary: format(detail.summary) }, groups: [items, executions] });
  },
  group(key, page) {
    return {
      key,
      title: key === 'items' ? '订单明细' : '分佣与解冻记录',
      rows: page.items.map(format),
      page: page.page,
      more: page.page * page.pageSize < Number(page.total),
    };
  },
  moreRows(e) {
    return ui.run(this, async (current) => {
      const i = e.currentTarget.dataset.index,
        g = this.data.groups[i],
        page = await api.get(
          base +
            '/' +
            this.data.id +
            '/' +
            g.key +
            '?pageSize=10&page=' +
            (g.page + 1),
        );
      if (current()) {
        const next = this.group(g.key, page),
          groups = this.data.groups.slice();
        next.rows = g.rows.concat(next.rows);
        groups[i] = next;
        this.setData({ groups });
      }
    });
  },
  rules() {
    wx.showModal({
      title: '结算规则',
      content:
        '平台按优惠后实付租金的结算基数收取 20% 佣金。押金赔付和线上应结运费单独计入工厂收入。每笔到账均可查看对应订单和渠道流水。',
      showCancel: false,
    });
  },
});
