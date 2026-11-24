const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(pageName, context = {}, realHttp = false, realContract = false) {
  const base = path.resolve(__dirname, "../miniprogram"),
    modules = new Map(),
    pending = [],
    uploads = [],
    storage = new Map([["mj.session", "owner-A"]]),
    nav = [], wire = [];
  let options;
  const app = { globalData: { context: null } };
  const wx = {
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    getRandomValues: (o) =>
      o.success({ randomValues: new Uint8Array(16).fill(6).buffer }),
    uploadFile: (o) => uploads.push(o),
    request: (o) => wire.push(o),
    redirectTo: (o) => nav.push(o.url),
    navigateTo: (o) => nav.push(o.url),
    showModal: (o) => o.success({ confirm: true }),
  };
  function load(file) {
    file = path.resolve(base, file);
    if (modules.has(file)) return modules.get(file).exports;
    if (file.endsWith(".json")) throw new Error("Mini runtime requires a JS module: " + file);
    const module = { exports: {} };
    modules.set(file, module);
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {
      module,
      wx,
      getApp: () => app,
      Page: (o) => (options = o),
      Uint8Array,
      require: (n) => {
        const target = path.resolve(
          path.dirname(file),
          n + (n.endsWith(".json") ? "" : ".js"),
        );
        if (target.endsWith("/services/http.js") && !realHttp)
          return {
            request: (...args) =>
              new Promise((resolve, reject) =>
                pending.push({ args, resolve, reject }),
              ),
          };
        if (target.endsWith("/services/factory-contract.js") && !realContract)
          return { assertResponse: (_p, _m, v) => v };
        if (target.endsWith("/config/environment.js"))
          return { baseUrl: "https://fixture.invalid" };
        if (target.endsWith("/session/activity.js"))
          return { interaction() {}, report() {} };
        if (target.endsWith("/services/account.js"))
          return {
            context: async () => ({
              userId: "user-A",
              accessMode: "normal",
              ...context,
            }),
          };
        return load(target);
      },
    });
    return module.exports;
  }
  const session = load("session/storage.js"),
    api = load("services/factory.js");
  if (pageName) load("pages/factory/" + pageName + ".js");
  const page = options && {
    ...options,
    data: structuredClone(options.data),
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  return { api, session, pending, uploads, storage, wx, page, nav, wire };
}
const tick = () => new Promise((r) => setImmediate(r));
function uploaded(o, id) {
  o.success({
    statusCode: 200,
    data: JSON.stringify({ code: "OK", data: { uploadId: id.repeat(32) } }),
  });
}
const fields = () => ({
  factoryAvatar: { localPath: "a" },
  businessLicense: { localPath: "b" },
  factoryPhotos: [{ localPath: "c" }],
  cases: [{ title: "", description: "测试案例", images: [{ localPath: "d" }] }],
});
test("B draft does not upload before confirmation; two workers use shared upload transport and correct purposes", async () => {
  const f = fixture();
  const data = fields();
  f.api.save({ fields: data });
  assert.equal(f.uploads.length, 0);
  const result = f.api.materialize(data);
  assert.equal(f.uploads.length, 2);
  assert.equal(f.uploads[0].formData.purpose, "factory_avatar");
  assert.equal(f.uploads[0].formData.consentAccepted, undefined);
  uploaded(f.uploads[0], "1");
  await tick();
  assert.equal(f.uploads.length, 3);
  uploaded(f.uploads[1], "2");
  await tick();
  assert.equal(f.uploads.length, 4);
  uploaded(f.uploads[2], "3");
  uploaded(f.uploads[3], "4");
  const out = await result;
  assert.equal(out.cases[0].images[0].uploadId, "4".repeat(32));
  assert.equal(data.factoryAvatar.localPath, "a");
  assert.equal([...f.storage.keys()].length, 1);
});
test("B session change discards local draft and late shared upload without navigation or command", async () => {
  const f = fixture();
  f.api.save({ fields: fields() });
  const result = f.api.materialize(fields());
  f.session.replace("owner-B");
  uploaded(f.uploads[0], "1");
  uploaded(f.uploads[1], "2");
  await assert.rejects(result, { name: "StaleSessionError" });
  assert.equal(f.api.read(), null);
  assert.equal(f.nav.length, 0);
});
test("unknown result retries recovery then exact original command/key, no new upload", async () => {
  const f = fixture(),
    d = {
      mode: "onboarding",
      userId: "user-A",
      body: { previousApplicationId: null, acceptedRules: [], materials: {} },
      fields: {},
    };
  let result = f.api.submit(d, []);
  await tick();
  const key = f.pending[0].args[4]["Idempotency-Key"];
  f.pending[0].reject(new Error("offline"));
  await assert.rejects(result);
  result = f.api.submit(d, []);
  await tick();
  assert.ok(f.pending[1].args[0].endsWith("/by-request/" + key));
  f.pending[1].reject(Object.assign(new Error("not found"), { status: 404, outcome: "business-rejection" }));
  await tick();
  assert.equal(f.pending[2].args[4]["Idempotency-Key"], key);
  f.pending[2].resolve({ application: { id: "original" } });
  assert.equal((await result).id, "original");
  assert.equal(f.uploads.length, 0);
});
test("rules load without consent, display original contentText and refresh resets check after version conflict", async () => {
  const f = fixture("rules"),
    p = f.page;
  const loading = p.load();
  f.pending[0].resolve({ rules: [{ documentId: "A" }, { documentId: "B" }] });
  await loading;
  assert.equal(p.data.checked.length, 0);
  assert.equal(p.data.rulesReady, true);
  assert.equal(p.data.allSelected, false);
  await p.submit();
  assert.equal(f.pending.length, 1);
  p.check({ detail: { value: ["A", "B"] } });
  assert.equal(
    p.data.rules.every((r) => r.selected),
    true,
  );
  const opening = p.open({ currentTarget: { dataset: { id: "A" } } });
  f.pending[1].resolve({ contentType: "html", contentText: "<p>完整规则</p>" });
  await opening;
  assert.equal(p.data.body.contentText, "<p>完整规则</p>");
  const reload = p.load();
  assert.equal(p.data.rulesReady, false);
  assert.equal(p.data.allSelected, false);
  f.pending[2].resolve({ rules: [{ documentId: "A2" }, { documentId: "B" }] });
  await reload;
  assert.equal(p.data.checked.length, 0);
  assert.equal(p.data.allSelected, false);
});
test("rejected onboarding reuses locators and drops read-only phone from submit whitelist", () => {
  const f = fixture();
  const locator = {
    sourceType: "factory_onboarding_audit",
    sourceId: "x",
    section: "source",
    field: "factoryAvatar",
    imageIndex: null,
    caseIndex: null,
  };
  const value = f.api.existing({
    factoryAvatar: locator,
    businessLicense: { ...locator, field: "businessLicense" },
    factoryPhotos: [{ ...locator, field: "factoryPhotos", imageIndex: 0 }],
    cases: [],
    specialtyCategoryNames: ["旧名称"],
    contactPhone: "+8613000000001",
  });
  assert.equal(value.factoryAvatar.kind, "existing");
  assert.equal(value.specialtyCategoryNames, undefined);
});
for (const pageName of [
  "invite",
  "form",
  "rules",
  "status",
  "profile",
  "phone",
  "index",
])
  test(
    "factory/" + pageName + " parses and registers a session-bound page",
    () => {
      const f = fixture(pageName);
      assert.ok(f.page);
      assert.equal(typeof f.page.onUnload, "function");
    },
  );
test("initial form accepts a text-only case and navigates to consent without uploading", async () => {
  const f = fixture("form"),
    p = f.page;
  Object.assign(p.data, {
    mode: "onboarding",
    userId: "user-A",
    fields: {
      ...fields(),
      factoryName: "测试工厂",
      unifiedSocialCreditCode: "123456789012345678",
      contactName: "测试",
      factoryAddress: "测试地址",
      workerCount: 3,
      specialtyCategoryIds: ["x"],
      mainBusiness: "",
      remark: "",
      cases: [{ title: "", description: "只提交说明", images: [] }],
    },
  });
  await p.next();
  assert.equal(f.uploads.length, 0);
  assert.equal(f.nav[0], "/pages/factory/rules");
  assert.equal(f.api.read().fields.cases[0].images.length, 0);
});
test("refresh with only original key permits explicit refill but never allocates a different key", async () => {
  const f = fixture(),
    key = "1".repeat(32);
  f.api.shared.remember("factory-onboarding", "user-A", key);
  const result = f.api.submit(
    {
      mode: "onboarding",
      userId: "user-A",
      previous: null,
      fields: {
        factoryAvatar: { kind: "existing", locator: {} },
        businessLicense: { kind: "existing", locator: {} },
        factoryPhotos: [],
        cases: [],
      },
    },
    [],
  );
  await tick();
  f.pending[0].reject(Object.assign(new Error("not found"), { status: 404, outcome: "business-rejection" }));
  await tick();
  assert.equal(f.pending[1].args[4]["Idempotency-Key"], key);
  f.pending[1].resolve({ application: { id: "original" } });
  await result;
  assert.equal(f.uploads.length, 0);
});

test("one failed upload stops queued jobs and waits for the other active upload before retry", async () => {
  const f = fixture();
  let settled = false;
  const result = f.api.materialize(fields());
  const checked = assert.rejects(result).then(() => {
    settled = true;
  });
  f.uploads[0].fail({ errMsg: "offline" });
  await tick();
  assert.equal(f.uploads.length, 2);
  assert.equal(settled, false);
  uploaded(f.uploads[1], "2");
  await checked;
  assert.equal(f.uploads.length, 2);
});
for (const name of ["index", "form"])
  test(
    name + " returns expired or revoked reservation to invitation entry",
    async () => {
      const f = fixture(name, {
        roleCode: null,
        registrationStage: "factory_invite_locked",
      });
      const result = f.page.load();
      await tick();
      assert.ok(f.pending[0].args[0].endsWith("factory-onboarding/current"));
      f.pending[0].resolve({
        application: null,
        canSubmit: false,
        nextAction: "ENTER_FACTORY_INVITE",
      });
      await result;
      assert.equal(f.nav[0], "/pages/factory/invite");
      assert.equal(f.pending.length, 1);
    },
  );

const examples = require('../../../开发交接/D2-准入与道具可租/契约/C-D2-B接口样例.json').examples;
const protocol = require('../miniprogram/services/response-contract');
const traceId='00000000000040008000000000000001';
const errorBody = (reason,code='INVALID_ARGUMENT') => ({code,reasonCode:reason,message:'测试拒绝',data:null,traceId});
for(const mode of ['onboarding','change']) {
 for(const [label,status,body] of [
  ['malformed 200',200,{code:'OK',traceId,data:{}}],
  ['non-protocol 400',400,'gateway error'],
  ['wrong operation reason',400,errorBody('WECHAT_CREDENTIAL_INVALID')],
  ['network',null,null],['unknown 500',500,{}],
  ['valid 503',503,errorBody('OBJECT_STORAGE_UNAVAILABLE','SERVICE_UNAVAILABLE')]
 ]) test(mode+' '+label+' preserves frozen command and recovers without a second POST',async()=>{
  const f=fixture(undefined,{},true),d={mode,userId:'user-A',body:{immutable:'original'}};
  const frozen=d.body; let task=f.api.submit(d,[]);await tick();
  const originalKey=f.wire[0].header['Idempotency-Key'];
  const caught=assert.rejects(task);
  if(status===null)f.wire[0].fail();else f.wire[0].success({statusCode:status,data:body});await caught;
  assert.equal(f.api.shared.pending(f.api.domain(mode),'user-A'),originalKey);assert.equal(d.body,frozen);
  task=f.api.submit(d,[]);await tick();
  assert.ok(f.wire[1].url.endsWith('/by-request/'+originalKey));
  const operationId=mode==='onboarding'?'recoverFactoryOnboarding':'recoverFactoryChange';
  const response=examples.find(x=>x.operationId===operationId&&x.kind==='success-response').value;
  f.wire[1].success({statusCode:200,data:response});await task;
  assert.equal(f.wire.filter(x=>x.method==='POST').length,1);assert.equal(f.uploads.length,0);
 });
 for(const reason of ['REQUEST_INVALID','MATERIAL_REFERENCE_INVALID'])test(mode+' trusted '+reason+' permits correction',async()=>{
  const f=fixture(undefined,{},true),d={mode,userId:'user-A',body:{original:true}};
  const task=f.api.submit(d,[]);await tick();const rejected=assert.rejects(task);
  f.wire[0].success({statusCode:400,data:errorBody(reason)});await rejected;
  assert.equal(f.api.shared.pending(f.api.domain(mode),'user-A'),'');assert.equal(d.body,null);
 });
}
test('malformed session error cannot log out but a valid expired-session envelope clears only its owner',async()=>{
 const f=fixture(undefined,{},true);
 let task=f.api.request('factory-profile');let rejected=assert.rejects(task);
 f.wire[0].success({statusCode:401,data:{reasonCode:'LOGIN_REQUIRED'}});await rejected;assert.equal(f.session.token(),'owner-A');
 task=f.api.request('factory-profile');rejected=assert.rejects(task);
 f.wire[1].success({statusCode:401,data:errorBody('LOGIN_REQUIRED','UNAUTHORIZED')});await rejected;assert.equal(f.session.token(),'');
});

test('unexpected inherited property name does not turn an error into a trusted rejection',()=>{
 const b=errorBody('REQUEST_INVALID');b.constructor='unexpected';
 assert.equal(protocol.failure('/api/me/factory-onboarding','POST',400,b).outcome,'unknown');
});
for (const [name, file] of [
  ['工厂首页', 'navigation/factory-root.wxml'],
  ['工厂资料', 'pages/factory/profile.wxml'],
]) test(name + ' displays suspended status', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../miniprogram', file), 'utf8');
  assert.match(source, /factoryStatus\s*===\s*'suspended'/);
  assert.match(source, /经营暂停|已暂停/);
});

// Regression: Node's JSON require and a mocked parser hid a real mini runtime failure.
test('mini JS module regression: new account reaches invitation using real factory parser', async () => {
  const f = fixture('index', {roleCode:null, registrationStage:'new'}, true, true);
  const task = f.page.load(); await tick();
  assert.equal(f.wire.length, 1);
  assert.ok(f.wire[0].url.endsWith('/factory-onboarding/current'));
  f.wire[0].success({statusCode:200, data:{code:'OK', message:'成功', traceId,
    data:{application:null, invitationId:null, invitationStatus:null,
      canSubmit:false, nextAction:'ENTER_FACTORY_INVITE'}}});
  await task;
  assert.equal(f.page.data.message, '');
  assert.deepEqual(f.nav, ['/pages/factory/invite']);
});
test('mini JS module regression: invitation success reaches form using real factory parser', async () => {
  const f = fixture('invite', {roleCode:null, registrationStage:'factory_invite_locked'}, true, true);
  f.page.data.code = 'FIXTURE-ONLY';
  const task = f.page.claim(); await tick();
  assert.ok(f.wire[0].url.endsWith('/factory-invitations/claim'));
  f.wire[0].success({statusCode:200, data:examples.find(e=>e.operationId==='claimFactoryInvitation' && e.kind==='success-response').value});
  await task;
  assert.equal(f.page.data.message, '');
  assert.deepEqual(f.nav, ['/pages/factory/form']);
});
test('mini JS module regression: common factory parser retains success validation and rejects malformed data', async () => {
  const source = require('../../../开发交接/D2-准入与道具可租/契约/C-D2-B工厂准入与资料管理.openapi.json');
  const f = fixture(undefined, {}, true, true);
  for (const [route, ops] of Object.entries(source.paths)) {
    if (!route.startsWith('/api/me/')) continue;
    for (const [method, op] of Object.entries(ops)) {
      const sample = examples.find(e=>e.operationId===op.operationId && e.kind==='success-response');
      assert.ok(sample, op.operationId);
      const actualPath = route.replace(/\{[^}]+\}/g,'00000000000040008000000000000001').slice('/api/me/'.length);
      const task = f.api.request(actualPath, method.toUpperCase());
      f.wire.at(-1).success({statusCode:200, data:sample.value});
      assert.equal(await task, sample.value.data, op.operationId);
    }
  }
  const broken = fixture(undefined, {}, false, true);
  const task = broken.api.request('factory-onboarding/current');
  broken.pending[0].resolve({application:null});
  await assert.rejects(task, e=>e.reason==='UNKNOWN_RESPONSE');
});

test("checkbox event arrays are rebuilt for rules; consent stays exact through check/uncheck", async () => {
  const f=fixture("rules"), p=f.page;
  p.setData({rules:[{documentId:"A"},{documentId:"B"}],checked:[],rulesReady:true});
  for (const [values,expected] of [[[],[]],[["A"],["A"]],[["A","B"],["A","B"]],[["B"],["B"]],[["A","A","foreign"],["A"]]]) {
    const eventValues=vm.runInNewContext(JSON.stringify(values));
    p.check({detail:{value:eventValues}});
    assert.notStrictEqual(p.data.checked,eventValues,"never pass platform event array through setData");
    assert.deepEqual(Array.from(p.data.checked),expected);
    assert.equal(p.data.allSelected,expected.length===2);
    assert.deepEqual(Array.from(p.data.rules,r=>r.selected),[expected.includes("A"),expected.includes("B")]);
    eventValues.push("mutated-after-event");
    assert.deepEqual(Array.from(p.data.checked),expected);
  }
  await p.submit();assert.equal(f.pending.length,0,"one valid rule cannot submit");
  p.check({detail:{value:["A","B"]}});p.setData({readOnly:true});await p.submit();assert.equal(f.pending.length,0);
  p.setData({readOnly:false,busy:true});await p.submit();assert.equal(f.pending.length,0);
});

test("factory category checkbox shares page-owned selection and retains an existing disabled choice", () => {
  const f=fixture("form"),p=f.page;
  p.setData({options:[{id:"old",enabled:false},{id:"current",enabled:true}]});
  const eventValues=vm.runInNewContext('["old","current","current","unknown"]');
  p.category({detail:{value:eventValues}});
  // The fixture records setData's nested-path payload without implementing a renderer.
  const selected=p.data['fields.specialtyCategoryIds'];
  assert.notStrictEqual(selected,eventValues);
  assert.deepEqual(Array.from(selected),["old","current"]);
  assert.ok(p.data.options.every(o=>o.selected));
  p.category({detail:{value:[]}});
  assert.equal(p.data['fields.specialtyCategoryIds'].length,0);
  assert.ok(p.data.options.every(o=>!o.selected));
});

test("shared checkbox selection handles arbitrary sizes, duplicates, unknown IDs and empty events", () => {
  const selection = require('../miniprogram/services/checkbox-selection');
  for (const size of [0, 1, 2, 3, 50, 10000]) {
    const options = Array.from({ length: size }, (_, i) => ({ id: `id-${i}` }));
    const ids = options.map(o => o.id);
    const values = vm.runInNewContext(JSON.stringify([...ids].reverse().concat(ids, 'foreign')));
    const result = selection(options.concat(options), values);
    assert.deepEqual(result.ids, ids, 'deduplicate and retain option order');
    assert.equal(result.allSelected, size > 0);
    assert.notStrictEqual(result.ids, values);
    values.length = 0;
    assert.deepEqual(result.ids, ids, 'later event mutation cannot alter page data');
    assert.equal(selection(options, ids.slice(1)).allSelected, false);
    for (const absent of [undefined, null, {}, 'id-0', []]) {
      assert.deepEqual(selection(options, absent), { ids: [], allSelected: false });
    }
  }
});

test("rules complete-load gate and actual WXML disabled expression agree with submit guards", async () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/factory/rules.wxml'), 'utf8');
  const expression = markup.match(/bindtap="submit"[^>]*disabled="{{(.*?)}}"/)[1];
  const disabled = p => vm.runInNewContext(expression, { ...p.data });
  for (const ids of [[], ['A'], ['A', 'A'], ['A', 'B', 'C'], ['A', 'B']]) {
    const f = fixture('rules'), p = f.page;
    let submissions = 0;
    f.api.read = () => ({});
    f.api.submit = async () => { submissions++; };
    const loading = p.load();
    assert.equal(disabled(p), true);
    f.pending[0].resolve({ rules: ids.map(documentId => ({ documentId })) });
    await loading;
    p.check({ detail: { value: ids } });
    const complete = ids.length === 2 && new Set(ids).size === 2;
    assert.equal(p.data.rulesReady, complete);
    assert.equal(disabled(p), !complete);
    await p.submit();
    assert.equal(submissions, complete ? 1 : 0);
    if (!complete) continue;
    p.check({ detail: { value: ['A', 'foreign'] } });
    assert.equal(disabled(p), true);
    await p.submit();
    assert.equal(submissions, 1);
    // Cached presentation flags must never authorize stale/foreign consent.
    p.setData({ checked: ['A', 'foreign'], allSelected: true });
    await p.submit();
    assert.equal(submissions, 1);
    p.check({ detail: { value: ['A', 'B'] } });
    const reload = p.load();
    assert.equal(disabled(p), true);
    await p.submit();
    assert.equal(submissions, 1);
    f.pending[1].reject(new Error('offline'));
    await reload;
    assert.equal(p.data.rulesReady, false);
    assert.equal(p.data.allSelected, false);
    assert.equal(disabled(p), true);
    await p.submit();
    assert.equal(submissions, 1);
    const retry = p.load();
    f.pending[2].resolve({ rules: [{ documentId: 'A' }, { documentId: 'B' }] });
    await retry;
    assert.equal(p.data.rulesReady, true);
    assert.equal(disabled(p), true, 'successful retry still requires fresh consent');
  }
});

test("rules version conflict clears consent before reload and sends only the fresh accepted versions", async () => {
  const f = fixture('rules'), p = f.page;
  const oldRules = ['A', 'B'].map(documentId => ({ documentId, version: 1, contentHash: 'old' }));
  const newRules = oldRules.map(r => ({ ...r, version: 2, contentHash: 'new' }));
  const loading = p.load();
  f.pending[0].resolve({ rules: oldRules });
  await loading;
  p.check({ detail: { value: ['A', 'B'] } });
  const draft = { body: { stale: true } }, calls = [];
  f.api.read = () => draft;
  f.api.submit = async (_draft, accepted) => {
    calls.push(Array.from(accepted, r => ({ ...r })));
    if (calls.length === 1) throw Object.assign(new Error('version changed'), { reason: 'RULE_VERSION_CHANGED' });
  };
  const submitting = p.submit();
  assert.equal(p.data.busy, true);
  await p.submit();
  assert.equal(calls.length, 1, 'double click cannot submit twice');
  await tick();
  assert.equal(p.data.rulesReady, false);
  assert.equal(p.data.allSelected, false);
  assert.equal(p.data.checked.length, 0);
  assert.equal(draft.body, null);
  f.pending[1].resolve({ rules: newRules });
  await submitting;
  assert.equal(p.data.busy, false);
  await p.submit();
  assert.equal(calls.length, 1, 'new version requires a new user selection');
  p.check({ detail: { value: ['A', 'B'] } });
  await p.submit();
  assert.deepEqual(calls, [oldRules, newRules]);
  assert.deepEqual(f.nav, ['/pages/factory/status']);
});

test('factory profile presentation preserves materials, preview permission API and edit guard',async()=>{
 const f=fixture('profile'),p=f.page,fields={factoryName:'原工厂',unifiedSocialCreditCode:'91110000TEST00008X',specialtyCategoryNames:['家具','灯具'],cases:[{title:'服务案例',description:'说明',images:[]}],factoryPhotos:[{field:'factoryPhotos',imageIndex:0}]};
 const calls=[];f.api.request=async(path,method,body)=>{calls.push({path,method,body});return path==='factory-profile'?{materials:fields,canEdit:false,profileVersion:2,factoryStatus:'active'}:{url:'https://fixture.invalid/photo'}};
 let preview;f.wx.previewImage=o=>preview=o;
 await p.load();assert.strictEqual(p.data.fields,fields);assert.equal(p.data.categorySummary,'家具、灯具');assert.equal(p.data.caseSummary,'服务案例');assert.equal(p.data.creditSummary,'9111**********8X');
 p.edit();assert.equal(f.nav.length,0);p.setData({profile:{...p.data.profile,canEdit:true}});p.edit();assert.equal(f.nav.pop(),'/pages/factory/form?mode=change');
 await p.photos();assert.equal(calls.at(-1).path,'factory-materials/view');assert.strictEqual(calls.at(-1).body,fields.factoryPhotos[0]);assert.equal(preview.urls[0],'https://fixture.invalid/photo');p.toggleCases();assert.equal(p.data.casesOpen,true);
});
