const test = require('node:test'),
  assert = require('node:assert/strict');
const { fixture } = require('./support/planning-fixture.cjs');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const id = '123456789abc4def8abc123456789abc';
const amounts = {
  rentOriginalFen: 1000,
  couponDiscountFen: 200,
  rentCashFen: 800,
  depositFen: 300,
  freightFen: 0,
  totalFen: 1100,
};
function batch() {
  return {
    id,
    version: 2,
    batchNo: id,
    checklistId: id,
    status: 'pending_payment',
    amounts,
    payment: { expireAt: '2030-01-01T12:10:00+08:00', paidFen: 0, refundedFen: 0 },
    orderIds: [],
    refundIds: [],
    nextAction: 'wait',
    canContinuePay: false,
    canCancelPayment: true,
    couponReturn: { status: 'none' },
  };
}
test('unknown write keeps original key and body; recovery projects original resource', async () => {
  const f = fixture(),
    api = f.load('services/trading.js');
  const first = api.command('submit', '/api/me/checkout-batches', { quoteToken: 'original' });
  await tick();
  const key = f.pending[0].args[4]['Idempotency-Key'];
  f.pending[0].reject({ status: 500, outcome: 'unknown', message: 'unknown' });
  await tick();
  assert.match(f.pending[1].args[0], new RegExp(key));
  f.pending[1].reject({ reason: 'RESOURCE_NOT_FOUND' });
  await assert.rejects(first);
  await assert.rejects(
    api.command('submit', '/api/me/checkout-batches', { quoteToken: 'changed' }),
  );
  assert.equal(f.pending.length, 2);
  const retry = api.command('submit', '/api/me/checkout-batches', { quoteToken: 'original' });
  await tick();
  assert.equal(f.pending[2].args[4]['Idempotency-Key'], key);
  f.pending[2].reject({ status: 503, outcome: 'unknown' });
  await tick();
  f.pending[3].resolve({ resourceId: id });
  assert.equal((await retry).receipt.resourceId, id);
  assert.equal(api.pending.size, 0);
});
test('identity change clears pending operations and late response cannot restore private result', async () => {
  const f = fixture(),
    api = f.load('services/trading.js');
  const result = api.command('pay', '/api/me/checkout-batches/' + id + '/pay', {
    expectedVersion: 0,
  });
  await tick();
  api.launches.set(id, { paySign: 'private' });
  f.session.clear();
  f.pending[0].resolve({ batch: batch() });
  await assert.rejects(result);
  assert.equal(api.pending.size, 0);
  assert.equal(api.launches.size, 0);
  assert.equal(
    [...f.storage.keys()].some((key) => /trading|payment/.test(key)),
    false,
  );
});
test('payment response after leaving never invokes native payment or sets a poll', async () => {
  const f = fixture('payment/index');
  f.page.setData({ id, detail: batch() });
  f.wx.requestPayment = () => assert.fail('native payment after leave');
  const result = f.page.pay();
  await tick();
  f.page.onHide();
  f.pending[0].resolve({
    parameters: {
      timeStamp: '1',
      nonceStr: 'n',
      package: 'prepay_id=p',
      signType: 'RSA',
      paySign: 's',
    },
  });
  await result;
  assert.equal(f.page.tradeTimer, null);
});
test('native cancel completion queries original batch and never assumes closed', async () => {
  const f = fixture('payment/index'),
    api = f.load('services/trading.js');
  f.page.setData({ id });
  let calls = 0;
  f.wx.requestPayment = (o) => {
    calls++;
    o.complete({ errMsg: 'requestPayment:fail cancel' });
  };
  api.launches.set(id, {
    timeStamp: '1',
    nonceStr: 'n',
    package: 'prepay_id=p',
    signType: 'RSA',
    paySign: 's',
  });
  const result = f.page.load();
  const state = { ...batch(), canContinuePay: true };
  f.pending[0].resolve(state);
  await result;
  assert.equal(calls, 1);
  assert.equal(f.page.data.detail.status, 'pending_payment');
  assert.ok(f.page.tradeTimer);
  f.page.onHide();
  assert.equal(f.page.tradeTimer, null);
});
test('factory order list appends distinct rows; failures preserve existing rows and show error', async () => {
  const f = fixture('factory/orders');
  const row = {
    id,
    displayStatus: 'pending_accept',
    amounts,
    paidFen: 1100,
    refundedFen: 0,
    deductedFen: 0,
  };
  let work = f.page.load();
  f.pending[0].resolve({ items: [row], total: '3' });
  await work;
  work = f.page.load(null, true);
  f.pending[1].resolve({
    items: [row, { ...row, id: '223456789abc4def8abc123456789abc' }],
    total: '3',
  });
  await work;
  assert.equal(f.page.data.items.length, 2);
  assert.equal(f.page.data.page, 2);
  assert.doesNotMatch(f.pending[0].args[0], /keyword=/);
  work = f.page.load(null, true);
  f.pending[2].reject({ status: 503, message: '不可用' });
  await work;
  assert.equal(f.page.data.items.length, 2);
  assert.equal(f.page.data.message, '不可用');
  f.page.onHide();
});
test('checkout unknown submit keeps confirmation and does not refresh into a new quote', async () => {
  const f = fixture('checkout/index'),
    api = f.load('services/trading.js');
  f.page.setData({
    id,
    quote: { quoteToken: 'signed', groups: [], amounts },
    detail: { version: 1 },
  });
  const work = f.page.submit();
  await tick();
  f.pending[0].reject({ status: 500, outcome: 'unknown' });
  await tick();
  f.pending[1].reject({ reason: 'RESOURCE_NOT_FOUND' });
  await work;
  assert.equal(f.page.data.pending, true);
  assert.equal(f.page.data.quote.quoteToken, 'signed');
  f.page.edit();
  assert.equal(f.page.data.quote.quoteToken, 'signed');
  assert.equal(api.pending.size, 1);
});
test('cancellation changed rate is displayed for fresh confirmation; no silent resubmit', async () => {
  const f = fixture('orders/detail');
  f.page.setData({ id, quote: { confirmToken: 'old' }, reason: '改变安排' });
  let notice; f.wx.showToast = options => { notice = options; };
  const work = f.page.confirmCancel();
  await tick();
  f.pending[0].reject({
    status: 409,
    outcome: 'business-rejection',
    reason: 'CANCELLATION_QUOTE_CHANGED',
  });
  await work;
  assert.equal(f.page.data.message, "");
  assert.match(notice.title, /重新核对/);
  assert.equal(f.pending.length, 1);
  assert.equal(f.page.data.quote.confirmToken, 'old');
});
test('B routes strictly retain only own resource identifiers; SKU update return is admitted', () => {
  const f = fixture(),
    routes = f.load('constants/routes.js'),
    guard = f.load('navigation/guard.js');
  for (const path of [
    '/pages/payment/index?id=' + id,
    '/pages/factory/order?id=' + id,
    '/pages/coupons/records',
    '/pages/props/form?mode=update&id=' + id,
  ])
    assert.equal(routes.safeReturn(path), path);
  assert.equal(
    routes.safeReturn('/pages/payment/index?id=' + id + '&paySign=secret'),
    '/pages/home/index',
  );
  assert.equal(guard.protectedRoute('pages/payment/index'), true);
  assert.equal(guard.protectedRoute('pages/factory/merchant'), true);
});

test('checkout submit completing after hide does not write page or navigate', async () => {
  const f = fixture('checkout/index');
  f.page.setData({ id, quote: { quoteToken: 'signed' } });
  const work = f.page.submit();
  await tick();
  f.page.onHide();
  f.page.setData = () => assert.fail('late page write');
  f.wx.redirectTo = () => assert.fail('late navigation');
  f.pending[0].resolve({ batch: { id } });
  await work;
});

test('两次并发确认只创建一个原请求，变更输入不会借用在途编号', async () => {
  const f = fixture(), api = f.load('services/trading.js');
  const first = api.command('submit','/api/me/checkout-batches',{quoteToken:'first'});
  const repeat = api.command('submit','/api/me/checkout-batches',{quoteToken:'first'});
  await assert.rejects(api.command('submit','/api/me/checkout-batches',{quoteToken:'other'}));
  await tick();
  assert.equal(f.pending.length,1);
  f.pending[0].resolve({id:'batch'});
  assert.equal((await first).id,(await repeat).id);
});

test('订单评价原页刷新资格为空时，撤下已显示的原文和奖励券', async () => {
  const f = fixture('reviews/detail');
  f.page.setData({ id, type: 'rental' });
  const first = f.page.load();
  f.pending[0].resolve({ reviewId: 'review-A', tags: [], canReview: false });
  await tick();
  f.pending[1].resolve({ id: 'review-A', content: '原文', userCouponId: 'coupon-A' });
  await first;
  assert.equal(f.page.data.review.userCouponId, 'coupon-A');
  const refresh = f.page.load();
  f.pending[2].resolve({ reviewId: null, tags: ['新标签'], canReview: false });
  await refresh;
  assert.equal(f.page.data.review, null);
  assert.equal(f.page.data.entry.canReview, false);
  assert.equal(f.page.data.choices[0].name, '新标签');
  assert.equal(f.pending.length, 3);
});

for (const status of [403, 404]) {
  test('按评价 ID 刷新收到 ' + status + ' 时清除已显示的原文和奖励券', async () => {
    const f = fixture('reviews/detail');
    f.page.setData({ id });
    const first = f.page.load();
    f.pending[0].resolve({ id, content: '原文', userCouponId: 'coupon-A' });
    await first;
    assert.equal(f.page.data.review.content, '原文');
    const refresh = f.page.load();
    f.pending[1].reject({ status, reason: status === 403 ? 'PERMISSION_DENIED' : 'RESOURCE_NOT_FOUND' });
    await refresh;
    assert.equal(f.page.data.review, null);
    assert.equal(f.page.data.entry, null);
    assert.ok(f.page.data.message);
  });
}
