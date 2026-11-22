const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./support/planning-fixture.cjs');
const id = '123456789abc4def8abc123456789abc';
const tick = () => new Promise((r) => setImmediate(r));
const empty = { items: [], total: '0' };
const time = '2030-03-02T12:00:00.000+08:00';

function context() {
  return {
    serverTime: time,
    disputeProtectionReady: true,
    outbound: {
      id: null,
      status: 'pending',
      version: 0,
      items: [
        {
          itemId: id,
          skuId: id,
          name: '桌',
          checkedQuantity: 0,
          expectedQuantity: 2,
          assetType: 'B_CONSUMABLE',
        },
      ],
      availableActions: ['set_quantity', 'save', 'confirm'],
    },
    receipt: { status: 'not_dispatched', availableActions: [] },
    shipment: { method: 'user_return', availableActions: [] },
    returnCheck: {
      id: null,
      items: [],
      availableActions: [],
      depositStatus: 'paid',
    },
  };
}
test('factory page retains entered remarks and reloads the actual root on version conflict without reconfirming', async () => {
  const f = fixture('factory/fulfillment'),
    p = f.page;
  f.wx.setNavigationBarTitle = () => {};
  await p.onLoad({ id });
  const show = p.onShow();
  await tick();
  const ctx = context();
  f.pending[0].resolve(ctx);
  f.pending[1].resolve({
    items: [{ skuId: id, transportRequirement: '保护桌角' }],
  });
  await tick();
  f.pending[2].resolve(empty);
  await show;
  assert.equal(p.data.view, 'outbound');
  assert.equal(p.data.items[0].requirement, '保护桌角');
  p.edit({
    currentTarget: { dataset: { field: 'remark' } },
    detail: { value: '新包装说明' },
  });
  const submit = p.submit({ currentTarget: { dataset: { action: 'save' } } });
  await tick();
  assert.equal(f.pending[3].args[3].expectedVersion, 0);
  f.pending[3].reject({
    status: 409,
    outcome: 'business-rejection',
    reason: 'VERSION_CONFLICT',
    message: '版本变化',
  });
  await tick();
  ctx.outbound.version = 4;
  f.pending[4].resolve(ctx);
  f.pending[5].resolve({ items: [] });
  await tick();
  f.pending[6].resolve(empty);
  await submit;
  assert.equal(p.data.root.version, 4);
  assert.equal(p.data.form.remark, '新包装说明');
  assert.equal(f.pending.length, 7);
  p.onHide();
});
test('a native scan completed after identity change cannot submit material or a scan', async () => {
  const f = fixture('factory/fulfillment'),
    p = f.page;
  await p.onLoad({ id });
  p.setData({ root: { version: 7 }, view: 'returnCheck' });
  let finish;
  f.wx.scanCode = (opts) => {
    finish = opts.success;
  };
  const scan = p.scan();
  await tick();
  f.session.replace('other-user');
  finish({ result: id });
  await scan;
  assert.equal(f.pending.length, 0);
  assert.equal(p.data.id, '');
});
test('login continuation validates fulfillment routes by role and original order', () => {
  const f = fixture(),
    routes = f.load('constants/routes.js'),
    login = f.load('navigation/login-target.js');
  for (const [role, directory] of [
    ['demander', 'orders'],
    ['supplier', 'factory'],
  ]) {
    const url =
      '/pages/' + directory + '/fulfillment?id=' + id + '&view=returnCheck';
    assert.equal(login.select({ roleCode: role }, url), url);
    assert.equal(routes.safeReturn(url + '&token=x'), '/pages/home/index');
    assert.equal(
      login.select(
        { roleCode: role === 'supplier' ? 'demander' : 'supplier' },
        url,
      ),
      '/pages/home/index',
    );
  }
});

test('supplier settlement totals retain every fen and wait for the final page', async () => {
  const f = fixture('factory/settlements'),
    page = f.page;
  f.wx.setNavigationBarTitle = () => {};
  await page.onLoad({});
  const first = page.onShow();
  await tick();
  const row = { id, settledAt: time, actualUnlockFen: '9007199254740993' };
  f.pending[0].resolve({ items: [row], pageSize: 1, page: 1, total: '2' });
  await first;
  assert.equal(page.data.items[0].actualUnlock, '90071992547409.93');
  assert.equal(page.data.lifetime, null);
  const next = page.moreBatches();
  await tick();
  f.pending[1].resolve({
    items: [{ ...row, id: id.slice(0, -1) + 'd', actualUnlockFen: '9' }],
    pageSize: 1,
    page: 2,
    total: '2',
  });
  await next;
  assert.equal(page.data.lifetime, '90071992547410.02');
  assert.equal(page.data.more, false);
  page.onHide();
});

test('leaving the expense page while it loads never restores an earlier supplier draft', async () => {
  const f = fixture('factory/expense'),
    page = f.page;
  await page.onLoad({ id });
  const loading = page.onShow();
  await tick();
  page.onHide();
  f.session.replace('new-supplier');
  for (const request of f.pending)
    request.resolve({ items: [], total: '0', latest: null });
  await loading;
  assert.equal(page.data.id, '');
  assert.equal(page.data.detail, null);
  assert.equal(page.data.legs.length, 0);
});
