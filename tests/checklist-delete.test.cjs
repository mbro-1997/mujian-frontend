const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./support/planning-fixture.cjs");
const tick = () => new Promise(resolve => setImmediate(resolve));
const id = "checklist-1";
const event = { currentTarget: { dataset: { id } } };
function setup(status = "selecting") {
  const f = fixture("checklist/index");
  f.page.setData({ items: [{ id, listTitle: "测试清单", status, version: 7 }], total: "1" });
  return f;
}
test("取消及只读清单不发删除请求", async () => {
  for (const status of ["selecting", "checkout_processing", "converted_to_order"]) {
    const f = setup(status);
    let opened = 0;
    f.wx.showModal = o => { opened++; o.success({ confirm: false }); };
    await f.page.deleteRow(event);
    assert.equal(opened, status === "selecting" ? 1 : 0);
    assert.equal(f.pending.length, 0);
    assert.equal(f.page.data.items.length, 1);
  }
});
test("挂起清单删除只提交一次，回执后刷新总数与当前清单", async () => {
  const f = setup("suspended");
  const done = f.page.deleteRow(event);
  await f.page.deleteRow(event);
  await tick();
  assert.equal(f.pending.length, 1);
  const [path, method,, body, headers] = f.pending[0].args;
  assert.equal(path, "/api/me/checklists/" + id + "/delete");
  assert.equal(method, "POST");
  assert.equal(JSON.stringify(body), '{"expectedVersion":7}');
  assert.ok(headers["Idempotency-Key"]);
  assert.equal(f.page.data.items.length, 1);
  f.pending[0].resolve({ operation: "deleteChecklist" });
  await tick();
  assert.equal(f.page.data.items.length, 0);
  assert.match(f.pending[1].args[0], /scope=active/);
  f.pending[1].resolve({ items: [], total: "0" });
  await tick();
  assert.equal(f.pending[2].args[0], "/api/me/planning-context");
  f.pending[2].resolve({ currentChecklist: null });
  await done;
  assert.equal(f.page.data.total, "0");
  assert.equal(f.page.data.checklistContext.currentChecklist, null);
  assert.equal(f.pending.length, 3);
});
test("结果不明时保留卡片，重试复用原键和原请求体，版本冲突回读", async () => {
  const f = setup();
  const first = f.page.deleteRow(event);
  await tick();
  f.pending[0].reject(Object.assign(new Error("断网"), { outcome: "unknown" }));
  await first;
  assert.equal(f.page.data.items.length, 1);
  assert.equal(f.pending.length, 1);
  f.page.data.items[0].version = 8;
  const retry = f.page.deleteRow(event);
  await tick();
  assert.deepEqual(f.pending[1].args, f.pending[0].args);
  f.pending[1].reject(Object.assign(new Error("版本已变化"), { status: 409, outcome: "rejected" }));
  await tick();
  assert.equal(f.page.data.items.length, 1);
  f.pending[2].resolve({ items: [{ id, version: 9, status: "checkout_processing" }], total: "1" });
  await tick();
  f.pending[3].resolve({ currentChecklist: null });
  await retry;
  assert.equal(f.page.data.items[0].version, 9);
  assert.match(f.page.data.message, /版本/);
});
test("从方案列表创建返回列表并提示，从道具新建回到选择器", () => {
  for (const sku of ["", "sku1"]) {
    const f = fixture("plan/create");
    let toast, target, emitted;
    f.wx.showToast = options => { toast = options; };
    f.wx.switchTab = options => { target = options.url; options.success(); };
    f.wx.navigateBack = options => { target = "back"; options.success(); };
    f.page.getOpenerEventChannel = () => ({ emit: (name, data) => { emitted = [name, data.id]; } });
    f.page.skuId = sku;
    f.page.created("scheme1");
    assert.equal(target, sku ? "back" : "/pages/plan/index");
    if (sku) assert.deepEqual(emitted, ["schemeCreated", "scheme1"]);
    assert.equal(toast.title, "创建成功");
    assert.equal(toast.mask, false);
  }
});

for (const [status, outcome] of [["editing", "applied"], ["archived", "replayed"]]) {
  test("方案 " + status + " 删除回执 " + outcome + "，只采用 version 并刷新列表", async () => {
    const f = fixture("plan/index");
    f.page.setData({ items: [{ id, status, listTitle: "专项样本", version: 7, contentVersion: 27 }], total: "1" });
    const done = f.page.deleteRow(event);
    await tick();
    const [path, method,, body, headers] = f.pending[0].args;
    assert.equal(method, "POST");
    assert.equal(path, "/api/me/schemes/" + id + "/delete");
    assert.deepEqual({ ...body }, { expectedVersion: 7 });
    assert.match(headers["Idempotency-Key"], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    f.pending[0].resolve({ operation: "deleteScheme", resourceId: id, resourceVersion: null, outcome });
    await tick();
    assert.equal(f.page.data.items.length, 0);
    assert.match(f.pending[1].args[0], /^\/api\/me\/schemes\?page=1&.*status=all/);
    f.pending[1].resolve({ items: [], total: "0" });
    await done;
    assert.equal(f.page.data.total, "0");
  });
}
test("方案超时重试原请求，服务端确认不存在后读取最新列表", async () => {
  const f = fixture("plan/index");
  f.page.setData({ items: [{ id, status: "editing", listTitle: "专项样本", version: 7 }], total: "1" });
  const first = f.page.deleteRow(event);
  await tick();
  f.pending[0].reject(Object.assign(new Error("超时"), { outcome: "unknown" }));
  await first;
  assert.equal(f.page.data.retryDeleteId, id);
  f.page.data.items[0].version = 13;
  const retry = f.page.deleteRow(event);
  await tick();
  assert.deepEqual(f.pending[1].args, f.pending[0].args);
  f.pending[1].reject(Object.assign(new Error("不存在"), { status: 404, reason: "RESOURCE_NOT_FOUND", outcome: "business-rejection" }));
  await tick();
  f.pending[2].resolve({ items: [], total: "0" });
  await retry;
  assert.equal(f.pending.length, 3);
  assert.equal(f.page.data.items.length, 0);
  assert.equal(f.page.data.message, "");
});

test("方案版本变化后须重新确认，确认后使用新版本和新键", async () => {
  const f = fixture("plan/index");
  let next = 0, confirmations = 0;
  f.wx.getRandomValues = o => o.success({ randomValues: new Uint8Array(16).fill(++next).buffer });
  f.wx.showModal = o => { confirmations++; o.success({ confirm: true }); };
  const row = { id, status: "archived", name: "专项样本", version: 7 };
  f.page.setData({ items: [row], total: "1" });
  const first = f.page.deleteRow(event);
  await tick();
  f.pending[0].reject(Object.assign(new Error("版本已变化"), { status: 409, reason: "VERSION_CONFLICT", outcome: "business-rejection" }));
  await tick();
  f.pending[1].resolve({ items: [{ ...row, version: 8 }], total: "1" });
  await first;
  assert.equal(f.pending.length, 2);
  assert.equal(f.page.data.items[0].version, 8);
  assert.match(f.page.data.message, /重新确认/);
  const second = f.page.deleteRow(event);
  await tick();
  assert.equal(confirmations, 2);
  assert.equal(f.pending[2].args[3].expectedVersion, 8);
  assert.notEqual(f.pending[2].args[4]["Idempotency-Key"], f.pending[0].args[4]["Idempotency-Key"]);
  f.pending[2].reject(Object.assign(new Error("提交编号已用于其他请求"), { status: 409, reason: "IDEMPOTENCY_KEY_REUSED", outcome: "business-rejection" }));
  await tick();
  f.pending[3].resolve({ items: [{ ...row, version: 8 }], total: "1" });
  await second;
  assert.equal(f.page.data.items.length, 1);
  assert.match(f.page.data.message, /编号/);
});
