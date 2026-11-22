const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./support/planning-fixture.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const instant = '2030-01-01T16:00:00.123Z';
const shown = '2030年01月02日 00:00:00.123（北京时间）';
const amounts = { rentOriginalFen: 0, couponDiscountFen: 0, rentCashFen: 0, depositFen: 0, freightFen: 0, totalFen: 0 };
const route = { serviceMode: 'self_pickup', vehicleTierName: null, distanceMeter: null, prepaidFen: 0 };
const summary = { id: 'order', orderNo: 'MO' + '1234567890'.repeat(10), factoryName: '长工厂名称'.repeat(20), displayStatus: 'pending_accept', buyerRemark: null, acceptDeadlineAt: instant, amounts, paidFen: 0, refundedFen: 0, deductedFen: 0 };

test('display boundary preserves API nulls, zero amounts and quantities, and nonempty text', () => {
  const api = fixture().load('services/trading.js');
  const input = { buyerRemark: null, items: [{ quantity: 0, image: null, dailyRentFen: 0, rentCashFen: 0, depositFen: 0 }], amounts, outbound: route, return: route };
  const result = api.group(input);
  assert.equal(result.buyerRemark, null);
  assert.equal(result.buyerRemarkText, '');
  assert.equal(result.outbound.vehicleTierName, null);
  assert.equal(result.outbound.vehicleTierNameText, '');
  assert.equal(result.outbound.distance, '');
  assert.equal(result.outbound.prepaid, '0.00');
  assert.equal(result.items[0].quantity, 0);
  assert.equal(result.items[0].daily, '0.00');
  assert.equal(result.amounts.total, '0.00');
  assert.equal(input.buyerRemark, null);
  assert.equal(api.group({ ...input, buyerRemark: '易碎，请轻放' }).buyerRemarkText, '易碎，请轻放');
  const named = api.route({ ...route, vehicleTierName: '厢式货车', distanceMeter: 0 });
  assert.equal(named.vehicleTierNameText, '厢式货车');
  assert.equal(named.distance, '0.00');
});

test('order and coupon presentation reuse Shanghai time without changing raw instants or deadline precision', () => {
  const api = fixture().load('services/trading.js');
  const order = api.order(summary);
  assert.equal(order.acceptDeadlineAtText, shown);
  assert.equal(order.acceptDeadlineAt, instant);
  assert.equal(api.dateMillis(order.acceptDeadlineAt), Date.parse(instant));
  assert.equal(order.orderNo, summary.orderNo);
  assert.equal(order.factoryName, summary.factoryName);
  const coupon = api.coupon({ status: 'returned', type: 'fixed_amount', faceAmountFen: 0, thresholdRentFen: 0, validFrom: instant, validUntil: '2030-01-02T00:00:00.123+08:00', returnedAt: null });
  assert.equal(coupon.validFromText, shown);
  assert.equal(coupon.validUntilText, shown);
  assert.equal(coupon.returnedAtText, '');
  assert.equal(coupon.returnedAt, null);
  assert.equal(coupon.value, '¥0.00');
});

for (const pageName of ['orders/detail', 'factory/order']) {
  test('both role details use common null/route/time presentation: ' + pageName, async () => {
    const f = fixture(pageName);
    f.page.setData({ id: 'order' });
    const work = f.page.load();
    await tick();
    f.pending[0].resolve({ ...summary, items: [], outbound: route, return: { ...route, serviceMode: 'factory_pickup', vehicleTierName: '测试车', distanceMeter: 0 }, availableActions: [] });
    await work;
    assert.equal(f.page.data.detail.buyerRemarkText, '');
    assert.equal(f.page.data.detail.outbound.vehicleTierNameText, '');
    assert.equal(f.page.data.detail.return.distance, '0.00');
    assert.equal(f.page.data.detail.acceptDeadlineAtText, shown);
    assert.equal(f.page.data.detail.paid, '0.00');
  });
}

test('refund and merchant display timestamps retain raw data; refund success does not start polling', async () => {
  const f = fixture('refund/detail');
  f.page.setData({ id: 'refund' });
  const work = f.page.load(); await tick();
  f.pending[0].resolve({ status: 'success', requestedAt: instant, successAt: instant, rentFen: 0, depositFen: 0, freightFen: 0, totalFen: 0, couponReturn: { status: 'returned', validUntil: instant } });
  await work;
  assert.equal(f.page.data.detail.requestedAtText, shown);
  assert.equal(f.page.data.detail.successAtText, shown);
  assert.equal(f.page.data.detail.couponReturn.validUntilText, shown);
  assert.equal(f.page.data.detail.couponReturn.validUntil, instant);
  assert.equal(f.page.data.detail.total, '0.00');
  assert.equal(f.page.tradeTimer, undefined);
  const merchant = fixture('factory/merchant');
  const load = merchant.page.load(); await tick();
  merchant.pending[0].resolve({ accountStatus: 'active', profitSharingStatus: 'active', lastSyncedAt: instant });
  await load;
  assert.equal(merchant.page.data.detail.lastSyncedAtText, shown);
  assert.equal(merchant.page.data.detail.lastSyncedAt, instant);
});

test('coupon history and batch return display use the same time rule without altering payment countdown', async () => {
  const f = fixture('coupons/records');
  const work = f.page.load(); await tick();
  f.pending[0].resolve({ items: [{ usageId: 'usage', usedAt: null, returnedAt: instant, discountFen: 0, status: 'returned' }], total: '1' });
  await work;
  assert.equal(f.page.data.items[0].usedAtText, '');
  assert.equal(f.page.data.items[0].returnedAtText, shown);
  assert.equal(f.page.data.items[0].discount, '0.00');
  const payment = fixture('payment/index');
  payment.setNow(Date.parse(instant));
  payment.page.setData({ id: 'batch' });
  const load = payment.page.load(); await tick();
  payment.pending[0].resolve({ status: 'paid', amounts, payment: { expireAt: '2030-01-01T16:01:00.123Z', paidFen: 0, refundedFen: 0 }, couponReturn: { status: 'returned', validUntil: instant } });
  await load;
  assert.equal(payment.page.data.detail.couponReturn.validUntilText, shown);
  assert.equal(payment.page.data.detail.couponReturn.validUntil, instant);
  assert.equal(payment.page.data.remaining, '1:00');
});

for (const page of ['orders/index', 'factory/orders', 'coupons/index']) {
  test('列表返回保留两页并按已提交条件追加 ' + page, async () => {
    const f = fixture(page);
    const wallet = page === 'coupons/index';
    const p = f.page;
    f.setNow(Date.parse(instant) - 1000);
    if (!wallet) p.keyword({ detail: { value: '旧词' } });
    const first = wallet ? p.onShow() : p.search();
    await tick();
    const item = wallet ? { id: 'a', status: 'returned', type: 'fixed_amount', validUntil: instant } : summary;
    f.pending[0].resolve({ items: [item], total: '2', availableCount:'2', unavailableCount:'0' });
    await first;
    if (!wallet) p.keyword({ detail: { value: '未提交' } });
    const second = p.onReachBottom();
    await tick();
    assert.match(f.pending[1].args[0], /page=2/);
    if (!wallet) assert.match(decodeURIComponent(f.pending[1].args[0]), /keyword=旧词/);
    f.pending[1].resolve({ items:[{...item,id:'b'}], total:'2', availableCount:'2', unavailableCount:'0' });
    await second;
    p.onPageScroll({scrollTop: 360});
    p.onHide();
    await p.onShow();
    assert.equal(f.pending.length, 2);
    assert.equal(p.data.page, 2);
    assert.equal(p.data.items.length, 2);
    assert.equal(p._navigationScroll, 360);
    if (wallet) {
      f.setNow(Date.parse(instant));
      const refresh = p.onShow();
      await tick();
      assert.match(f.pending[2].args[0], /page=1/);
      f.pending[2].resolve({items:[], total:'0', availableCount:'0', unavailableCount:'2'});
      await refresh;
      assert.equal(p.data.availableCount,'0');
    }
  });
}

for (const page of ['orders/index', 'factory/orders', 'coupons/index']) {
  test('追加失败重试原页且权限撤回后清除私有列表 ' + page, async () => {
    const f = fixture(page), p = f.page;
    const item = page === 'coupons/index' ? {id:'a',type:'fixed_amount',status:'returned'} : summary;
    const first = p.onShow(); await tick();
    f.pending[0].resolve({items:[item], total:'3', availableCount:'3', unavailableCount:'0'}); await first;
    const second = p.onReachBottom(); await tick(); f.pending[1].reject(new Error('offline')); await second;
    assert.equal(p.data.items.length,1);
    const retry = p.retry(); await tick(); assert.equal(f.pending[1].args[0], f.pending[2].args[0]);
    f.pending[2].reject({status:403, message:'forbidden'}); await retry;
    assert.equal(p.data.page,0); assert.equal(p.data.items.length,0);
    const show = p.onShow(); await tick(); assert.match(f.pending[3].args[0],/page=1/);
    f.pending[3].resolve({items:[], total:'3', availableCount:'0', unavailableCount:'0'}); await show;
    await p.onReachBottom(); assert.equal(f.pending.length,4);
  });
}

test('详情核对相同卡片复用列表，撤回权限立即移除旧卡并失效导航快照', async () => {
  const f = fixture('orders/detail'), api = f.load('services/trading.js');
  const list = { route: 'pages/orders/index', data: { items: [api.order(summary)] },
    setData(fields) { Object.assign(this.data, fields); } };
  const state = f.load('navigation/state.js');
  state.bind({userId:'buyer',roleCode:'demander'},'');
  state.save(list);
  f.page.setData({id:summary.id});
  f.pageStack.push(list, f.page);
  const before = api.revision.orders;
  const read = f.page.load(); await tick();
  f.pending[0].resolve({...summary, items:[], outbound:route, return:route, availableActions:[]});
  await read; assert.equal(api.revision.orders,before);
  const revoked = f.page.load(); await tick();
  f.pending[1].reject({status:403, message:'forbidden'}); await revoked;
  assert.equal(list.data.items.length,0); assert.equal(api.revision.orders,before+1);
  state.restore(list); assert.equal(list.data.items.length,0);
});
