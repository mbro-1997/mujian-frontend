const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./support/planning-fixture.cjs");

test("工厂从原订单重开交付和延期草稿，换单隔离，退出清空", () => {
  const f = fixture("factory/custom-detail");
  const nav = f.load("navigation/state.js");
  const service = f.load("services/custom.js");
  nav.bind({ userId: "supplier", roleCode: "supplier" }, "factory-a");
  const p = f.page;
  const open = (id, action) => {
    p.setData({
      id,
      detail: { id, allowedActions: [action], extensions: [], version: 1 },
    });
    p.choose({ currentTarget: { dataset: { k: action } } });
  };
  for (const action of ["deliverCustomOrder", "saveCustomExtension"]) {
    open("order-a", action);
    p.edit({
      currentTarget: { dataset: { path: "editor.remark" } },
      detail: { value: action },
    });
    open("order-b", action);
    assert.equal(p.data.editor.remark, "");
    open("order-a", action);
    assert.equal(p.data.editor.remark, action);
  }
  open("order-a", "deliverCustomOrder");
  f.setNow(Date.parse("2030-03-02T12:00:16.357+08:00"));
  p.occurredNow();
  assert.equal(
    service.readDraft("order-a").deliverCustomOrder.occurredAt,
    "2030-03-02T12:00:16.357+08:00",
  );
  f.session.clear();
  assert.equal(f.storage.has("mj.custom.order.draft"), false);
  f.session.replace("other-token");
  nav.bind({ userId: "other", roleCode: "supplier" }, "factory-b");
  open("order-a", "deliverCustomOrder");
  assert.equal(p.data.editor.remark, "");
});

test("返回原列表只消费本身份和本分栏变动的订单", () => {
  const f = fixture();
  const c = f.load("services/custom.js");
  c.mark(true, "orders", "a");
  c.mark(true, "orders", "a");
  c.mark(false, "requirements", "b");
  const snapshot = c.changed(true, "orders");
  assert.deepEqual([...snapshot.keys()], ["a"]);
  c.mark(true, "orders", "a");
  c.acknowledge(true, "orders", snapshot);
  assert.deepEqual([...c.changed(true, "orders").keys()], ["a"]);
  c.acknowledge(true, "orders", c.changed(true, "orders"));
  assert.deepEqual([...c.changed(true, "orders")], []);
  f.session.clear();
  assert.deepEqual([...c.changed(false, "requirements")], []);
});

test("售后页按服务器有效截止收起已打开的表单并拒绝旧按钮", async () => {
  const f = fixture("custom/detail");
  const p = f.page,
    action = "reportCustomAfterSale";
  const deadline = Date.parse("2032-11-06T12:00:00.345+08:00");
  const skew = 3600000;
  f.setNow(deadline - 1 - skew);
  p.onLoad({ id: "order-a", kind: "orders" });
  const load = p.load(() => true);
  f.pending[0].args[5].onServerTime(deadline - 1);
  f.pending[0].resolve({
    id: "order-a",
    state: "pending_acceptance",
    version: 4,
    currentDeliveryId: "d2",
    acceptanceDeadlineAt: new Date(deadline).toISOString(),
    allowedActions: [action],
    extensions: [],
  });
  await new Promise((resolve) => setImmediate(resolve));
  f.pending[1].resolve([]);
  await load;
  const click = { currentTarget: { dataset: { k: action } } };
  assert.ok(p.data.buttons.some((b) => b.k === action));
  p.choose(click);
  assert.equal(p.data.active, action);
  f.setNow(deadline - skew);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(p.data.active, "");
  assert.ok(!p.data.buttons.some((b) => b.k === action));
  p.choose(click);
  assert.equal(p.data.active, "");
  p.setData({ active: action, formVersion: 4 });
  await p.confirm();
  assert.equal(p.data.active, "");
  assert.equal(f.pending.length, 2);
  p.onHide();
});


test("定制列表失败、离页和刷新中同一订单再变更均可重试", async () => {
  const f = fixture("custom/index"), p = f.page, c = f.load("services/custom.js");
  p.setData({ page: 1, kind: "orders", status: "completed", rows: [{id:"old"}] });
  p.loaded = true;
  c.mark(false, "orders", "new");
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const reply = {items:[{id:"new", state:"completed"}], total:"1"};
  let run = p.onShow(); await tick();
  assert.match(f.pending[0].args[0], /page=1.*status=completed/);
  f.pending[0].reject(new Error("offline")); await run;
  assert.equal(c.changed(false, "orders").size, 1);
  run = p.retry(); await tick(); p.onHide();
  f.pending[1].resolve(reply); await run;
  assert.equal(c.changed(false, "orders").size, 1);
  run = p.onShow(); await tick(); c.mark(false, "orders", "new");
  f.pending[2].resolve(reply); await run;
  assert.equal(c.changed(false, "orders").size, 1);
  run = p.retry(); await tick(); f.pending[3].resolve(reply); await run;
  assert.equal(c.changed(false, "orders").size, 0);
  assert.equal(p.data.rows[0].id, "new");
});
