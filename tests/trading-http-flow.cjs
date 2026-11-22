// 生产页面JS与真实隔离HTTP联调；wx为Node适配，不代表开发工具或真机。
const fs = require('node:fs'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const { fixture } = require('./support/planning-fixture.cjs');
const state = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const opened = [];
let nativeCalls = 0;
function page(name, token) {
  const f = fixture(name, {}, true);
  f.session.replace(token);
  f.wx.getRandomValues = (o) =>
    o.success({ randomValues: Uint8Array.from(crypto.randomBytes(16)).buffer });
  f.wx.request = (o) => {
    fetch(o.url.replace('https://fixture.invalid', state.baseUrl), {
      method: o.method,
      headers: o.header,
      body: o.data === undefined ? undefined : JSON.stringify(o.data),
    })
      .then(async (response) => {
        const data = await response.json();
        o.success({
          statusCode: response.status,
          header: Object.fromEntries(response.headers.entries()),
          data,
        });
      })
      .catch((error) => o.fail({ errMsg: error.message }));
  };
  f.wx.requestPayment = (o) => {
    nativeCalls++;
    assert.match(o.package, /^prepay_id=/);
    o.complete({ errMsg: 'requestPayment:fail cancel' });
  };
  opened.push(f);
  return f;
}
function clearPoll(f) {
  if (f.page.tradeTimer) clearTimeout(f.page.tradeTimer);
  f.page.tradeTimer = null;
}
async function run() {
  const checkout = page('checkout/index', state.buyerToken);
  checkout.page.setData({ id: state.checklistId });
  await checkout.page.load();
  assert.equal(checkout.page.data.message, '');
  assert.ok(checkout.page.data.address);
  await checkout.page.quote();
  assert.equal(checkout.page.data.message, '');
  assert.equal(checkout.page.data.couponId, state.couponId);
  assert.equal(checkout.page.data.quote.amounts.couponDiscountFen, 5000);
  await checkout.page.submit();
  assert.equal(checkout.page.data.message, '');
  const target = checkout.nav.at(-1);
  assert.match(target, /\/pages\/payment\/index\?id=/);
  const batchId = target.split('id=')[1];
  const launch = checkout.load('services/trading.js').launches.get(batchId);
  assert.ok(launch);
  const payment = page('payment/index', state.buyerToken);
  payment.page.setData({ id: batchId });
  payment.load('services/trading.js').launches.set(batchId, launch);
  await payment.page.load();
  clearPoll(payment);
  assert.equal(nativeCalls, 1);
  assert.equal(payment.page.data.detail.status, 'pending_payment');
  assert.equal(payment.page.data.detail.orderIds.length, 0);
  assert.equal((await fetch(state.controlUrl + '/paid', { method: 'POST' })).status, 204);
  await payment.page.refresh();
  clearPoll(payment);
  assert.equal(payment.page.data.message, '');
  assert.equal(payment.page.data.detail.status, 'paid');
  const orderId = payment.page.data.detail.orderIds[0];
  assert.ok(orderId);
  const supplier = page('factory/order', state.supplierToken);
  supplier.page.setData({ id: orderId });
  await supplier.page.load();
  assert.equal(supplier.page.data.message, '');
  assert.equal(supplier.page.data.canAccept, true);
  await supplier.page.accept();
  assert.equal(supplier.page.data.message, '');
  assert.equal(supplier.page.data.detail.orderStatus, 'accepted');
  const order = page('orders/detail', state.buyerToken);
  order.page.setData({ id: orderId });
  await order.page.load();
  assert.equal(order.page.data.message, '');
  assert.equal(order.page.data.canCancel, true);
  order.page.rules();
  assert.match(order.nav.at(-1), /^\/pages\/rules\/index\?id=[a-f0-9]{32}$/);
  await order.page.cancelQuote();
  assert.equal(order.page.data.message, '');
  assert.equal(order.page.data.quote.deductionFen, 0);
  order.page.setData({ reason: '隔离前端HTTP取消' });
  await order.page.confirmCancel();
  assert.equal(order.page.data.message, '');
  assert.equal(order.page.data.detail.orderStatus, 'user_cancelled');
  assert.equal(order.page.data.detail.refundIds.length, 1);
  const refund = page('refund/detail', state.buyerToken);
  refund.page.setData({ id: order.page.data.detail.refundIds[0] });
  await refund.page.load();
  clearPoll(refund);
  assert.equal(refund.page.data.message, '');
  assert.equal(refund.page.data.detail.status, 'pending');
  assert.equal((await fetch(state.controlUrl + '/refund', { method: 'POST' })).status, 204);
  await refund.page.load();
  clearPoll(refund);
  assert.equal(refund.page.data.message, '');
  assert.equal(refund.page.data.detail.status, 'success');
  assert.equal(refund.page.data.detail.couponReturn.status, 'returned');
  const coupon = page('coupons/detail', state.buyerToken);
  coupon.page.setData({ id: state.couponId });
  await coupon.page.load();
  assert.equal(coupon.page.data.message, '');
  assert.equal(coupon.page.data.detail.status, 'returned');
  console.log(
    'PASS production mini JS + real HTTP: checkout/address/coupon/submit/native-cancel-still-pending/all-paid/order/factory-accept/cancel/refund/return-coupon',
  );
  console.log(
    'BOUNDARY: wx adapter and payment channel are explicit fakes; no native device or real money was used.',
  );
}
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const f of opened) {
      clearPoll(f);
      f.page.onHide?.();
      f.page.onUnload?.();
    }
  });
