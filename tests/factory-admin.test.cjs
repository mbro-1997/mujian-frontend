const test = require("node:test"),
  assert = require("node:assert/strict");
const { fixture } = require("./web-fixture.cjs");
function setup(kind = "changes", permissions = ["admin:factory-profile-change:review"]) {
  let epoch = 1,
    resolve, reject;
  const calls = [],
    mocks = {
      "../../session/state": {
        me: {
          value: {
            userId: "admin-A",
            permissions,
          },
        },
        explain: (e) => e,
      },
      "../../session/view": {
        useSessionView: () => ({
          capture: () => epoch,
          current: (o) => o === epoch,
        }),
      },
      "../../api/http": {
        errorText: {},
        isStale: () => false,
        refreshCsrf: async () => {},
        api: async (...args) => {
          calls.push(args);
          if (args[1] === "POST") return new Promise((r,j) => {resolve = r; reject=j;});
          return { items: [], total: "0" };
        },
      },
    };
  for (const component of ["tag", "checkbox", "drawer", "dialog"])
    mocks["element-plus/es/components/" + component + "/style/css"] = {};
  const f = fixture({ props: { kind }, mocks });
  const c = f.load("views/factory/FactoryPanel.vue", [
    "remember",
    "resume",
    "originalKey",
    "send",
    "command",
    "unknown",
    "refilling",
    "status",
    "load",
    "onboarding",
    "change",
    "profile",
    "clearSensitive",
    "message", "canReview", "canApprove", "baseChanged", "review", "remark", "statuses", "labels", "fieldLabels",
  ]);
  return {
    ...f,
    c,
    calls,
    switchOwner() {
      epoch++;
    },
    resolve: (v) => resolve(v),
    reject: (e) => reject(e),
  };
}
test("admin restore after refresh uses original operation/target key and rejects different action", () => {
  const f = setup(),
    path = "/api/admin/factory-profile-changes/abc/approve",
    key = "a".repeat(32);
  f.stored.set(
    "mj.factory.pending.admin-A.changes",
    JSON.stringify({ key, path, type: "review" }),
  );
  f.c.resume();
  assert.equal(f.c.originalKey("review", path), key);
  assert.throws(() =>
    f.c.originalKey("review", path.replace("approve", "reject")),
  );
  assert.equal(f.c.unknown.value, false);
});
test("admin retains only operation metadata; late review result cannot write another session", async () => {
  const f = setup(),
    key = "b".repeat(32),
    path = "/api/admin/factory-profile-changes/abc/approve";
  f.c.remember({
    key,
    path,
    type: "review",
    body: { remark: "private remark" },
  });
  assert.equal(
    f.stored
      .get("mj.factory.pending.admin-A.changes")
      .includes("private remark"),
    false,
  );
  const send = f.c.send();
  await new Promise((r) => setImmediate(r));
  f.switchOwner();
  f.resolve({});
  await send;
  assert.equal(f.calls.length, 1);
  assert.equal(f.c.unknown.value, true);
});
test("admin default queue omits unsupported query names", async () => {
  const f = setup();
  await f.c.load();
  const q = new URL(f.calls[0][0], "https://example.invalid").searchParams;
  assert.equal(q.get("status"), "pending");
  assert.equal(q.has("auditStatus"), false);
});

test('changed baseline permits reject, disables approve, and cannot send an approve command',async()=>{
 const f=setup();f.c.change.value={id:'source',canReview:true,baseProfileVersion:'1',currentProfileVersion:'2',version:0};
 assert.equal(f.c.canReview.value,true);assert.equal(f.c.canApprove.value,false);
 await f.c.review(true);assert.equal(f.calls.length,0);assert.match(f.c.message.value,/不能批准/);
 f.c.remark.value='请基于新版重提';const task=f.c.review(false);await new Promise(r=>setImmediate(r));
 assert.equal(f.calls[0][0],'/api/admin/factory-profile-changes/source/reject');f.resolve({});await task;
});
test('without review permission both commands remain unavailable even with stale baseline',async()=>{
 const f=setup('changes',[]);f.c.change.value={id:'source',canReview:true,baseProfileVersion:'1',currentProfileVersion:'2'};
 assert.equal(f.c.canReview.value,false);assert.equal(f.c.canApprove.value,false);await f.c.review(true);await f.c.review(false);assert.equal(f.calls.length,0);
});
test('factory suspended filter and shared detail label are defined, change fields use Chinese labels',()=>{
 const f=setup('profiles');assert.ok(f.c.statuses.value.includes('suspended'));assert.equal(f.c.labels.suspended,'暂停');assert.equal(f.c.fieldLabels.factoryName,'工厂名称');
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../admin-web/src/views/factory/FactoryPanel.vue'),'utf8');
 assert.match(source,/prop="creditCodeMasked"/);assert.match(source,/label="本次修改项"/);assert.match(source,/!canApprove/);
});

for(const [reason,outcome]of [['UNKNOWN_RESPONSE','unknown'],['FACTORY_DATA_INCONSISTENT','unknown'],['REQUEST_INVALID','business-rejection']])test('admin recovery preserves only unknown command: '+reason,async()=>{
 const f=setup();const body={remark:'original'};f.c.remember({key:'b'.repeat(32),type:'review',path:'/api/admin/factory-profile-changes/source/reject',body});
 const task=f.c.send();await new Promise(r=>setImmediate(r));f.reject(Object.assign(new Error(reason),{reason,outcome}));await task;
 assert.equal(!!f.c.command.value,outcome==='unknown');assert.equal(f.c.unknown.value,outcome==='unknown');
 if(outcome==='unknown')assert.equal(f.c.command.value.body,body);
});
