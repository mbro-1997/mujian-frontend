const uniqueRows = require("../../services/unique-rows");
const { request } = require('../../services/http');
const ui = require('../../services/trading-page');
require('../../session/page')({
  data: { items: [], page: 0, total: '0', direction: 'received', busy:false, message:'' },
  onShow() { ui.show(this); if (!this.data.page) return this.load(); },
  onHide() { ui.hide(this); }, onUnload() { ui.hide(this); },
  filter(e) { if (this.data.busy) return; this.setData({ direction:e.currentTarget.dataset.direction, page:0, items:[] }); return this.load(); },
  load() { return ui.run(this, async current => {
    const page = this.data.page + 1;
    const result = await request('/api/me/order-reviews?direction=' + this.data.direction + '&page=' + page);
    if (!current()) return;
    const added = uniqueRows(result.items, this.data.items);
    require("../../services/planning-page").appendItems(this, added);
    this.setData({ page, total: result.total, exhausted: !added.length });
  }); },
  onReachBottom() { if (!this.data.exhausted && this.data.items.length < Number(this.data.total)) return this.load(); },
});
