const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { fixture } = require("./support/planning-fixture.cjs");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const id = "123456789abc4def8abc123456789abc",
  sku = "223456789abc4def8abc123456789abc";
function array(text) {
  return new TextEncoder().encode(text).buffer;
}
function error(reason = "PDF_COOLDOWN") {
  return {
    code: "RATE_LIMITED",
    message: "操作过于频繁",
    data: null,
    traceId: id,
    reasonCode: reason,
    retryAfterSeconds: 180,
  };
}
function entry() {
  return {
    id: sku,
    quantity: 2,
    remark: "旧备注",
    display: {
      skuId: sku,
      name: "中文道具",
      factoryId: id,
      factoryName: "工厂",
      typeLabel: "道具",
      styleLabels: ["现代"],
      prices: { dailyRentPriceFen: 100, depositAmountFen: 200 },
      image: null,
    },
  };
}
function detail() {
  return {
    id,
    name: "方案",
    description: "简介",
    version: 3,
    contentVersion: 4,
    status: "editing",
    items: [entry()],
    actions: { canEdit: true },
    share: { status: "disabled" },
    estimatedDailyRentFen: 200,
    estimatedDepositFen: 400,
    quantityTotal: "2",
  };
}
test("PDF bytes pass only with correct media, signature, length and export headers", async () => {
  const f = fixture(null, {}, true),
    http = f.load("services/http.js"),
    promise = http.request(
      "/api/me/schemes/" + id + "/exports",
      "POST",
      false,
      { hidePrice: false },
      {},
      { pdf: true },
    );
  const body = array("%PDF-1.7\nexample");
  f.wire[0].success({
    statusCode: 200,
    header: {
      "Content-Type": "application/pdf",
      "Content-Length": body.byteLength,
      "X-Export-Id": id,
      "X-Cache-Hit": "false",
      "X-File-Expires-At": "2026-11-06T14:00:00+08:00",
    },
    data: body,
  });
  assert.equal((await promise).buffer, body);
  assert.equal(f.wire[0].responseType, "arraybuffer");
  for (const data of [array("not a PDF"), array("%PDF-1.7")]) {
    const failed = http.request(
      "/api/me/schemes/" + id + "/exports",
      "POST",
      false,
      { hidePrice: true },
      {},
      { pdf: true },
    );
    f.wire.at(-1).success({
      statusCode: 200,
      header: {
        "content-type": "application/pdf",
        "content-length": 999,
        "x-export-id": id,
      },
      data,
    });
    await assert.rejects(failed, (e) => e.outcome === "unknown");
  }
});
test("PDF JSON errors keep business classification and never resolve as file", async () => {
  const f = fixture(null, {}, true),
    http = f.load("services/http.js"),
    promise = http.request(
      "/api/me/schemes/" + id + "/exports",
      "POST",
      false,
      {},
      {},
      { pdf: true },
    );
  f.wire[0].success({
    statusCode: 429,
    header: { "Content-Type": "application/json;charset=UTF-8" },
    data: array(JSON.stringify(error())),
  });
  await assert.rejects(
    promise,
    (e) => e.reason === "PDF_COOLDOWN" && e.outcome === "business-rejection",
  );
});
test("anonymous share omits authorization and stale session rejects a binary reply", async () => {
  const f = fixture(null, {}, true),
    api = f.load("services/planning.js");
  const reading = api.get("/api/public/scheme-shares/" + "a".repeat(43), true);
  assert.equal(f.wire[0].header.Authorization, undefined);
  f.wire[0].fail();
  await assert.rejects(reading);
  const downloading = api.exportPdf(id,false);
  f.session.clear();
  f.wire[1].success({ statusCode: 200, data: array("%PDF-1.7"), header: {} });
  await assert.rejects(downloading, (e) => e.name === "StaleSessionError");
});
test("unknown write recovers original receipt; missing receipt retries exact original key and body", async () => {
  const f = fixture(),
    api = f.load("services/planning.js"),
    body = { expectedVersion: 2, items: [] };
  let command = api.command(
    "save:" + id,
    "/api/me/checklists/" + id + "/save",
    body,
  );
  await tick();
  const first = f.pending[0];
  first.reject(new Error("network"));
  await tick();
  assert.match(f.pending[1].args[0], /by-request/);
  f.pending[1].reject({ reason: "RESOURCE_NOT_FOUND" });
  await assert.rejects(command);
  await assert.rejects(
    api.command("save:" + id, "/api/me/checklists/" + id + "/save", {
      expectedVersion: 3,
      items: [],
    }),
    /尚未确认/,
  );
  command = api.command(
    "save:" + id,
    "/api/me/checklists/" + id + "/save",
    body,
  );
  await tick();
  assert.deepEqual(f.pending[2].args[4], first.args[4]);
  assert.equal(f.pending[2].args[3], body);
  f.pending[2].resolve({ resourceId: id, outcome: "replayed" });
  assert.equal((await command).resourceId, id);
  assert.equal(api.pending.size, 0);
});
test("PDF interrupted response and explicit retry both use only the same POST", async () => {
  const f = fixture(), api = f.load("services/planning.js");
  const first = api.exportPdf(id, true);
  f.pending[0].reject(new Error("网络中断"));
  await assert.rejects(first);
  assert.equal(f.pending.length, 1);
  const again = api.exportPdf(id, true);
  for (const request of f.pending) {
    assert.deepEqual(JSON.parse(JSON.stringify(request.args)), [
      "/api/me/schemes/" + id + "/exports", "POST", false, { hidePrice:true }, {}, {pdf:true},
    ]);
  }
  f.pending[1].resolve({exportId:sku});
  await again;
  api.pending.set("pdf:" + id, { path: "/api/me/schemes/" + id + "/exports" });
  assert.equal(await api.recoverNext("/api/me/schemes/"), null);
  assert.equal(f.pending.length,2);
});
test("plan local price and edit controls emit no write; save sends only final changed objects", async () => {
  const f = fixture("plan/detail"),
    p = f.page;
  p.savedScheme = f.load("services/scheme-edits.js").baseline(detail(),[entry()]);
  p.setData({
    id,
    detail: detail(),
    items: [entry()],
    name: "修改后的方案",
    description: "简介",
  });
  p.togglePrice();
  p.itemField({
    currentTarget: { dataset: { index: "0", field: "quantity" } },
    detail: { value: "3" },
  });
  assert.equal(f.pending.length, 0);
  assert.equal(p.data.hidePrice, true);
  const saving = p.save();
  await tick();
  assert.equal(f.pending.length, 1);
  assert.equal(f.pending[0].args[0], "/api/me/schemes/" + id + "/update");
  assert.equal(f.pending[0].args[3].actions[0].quantity, 3);
  assert.deepEqual(Object.keys(f.pending[0].args[3]), ["actions"]);
  f.pending[0].resolve({ resourceId: id });
  await tick();
  f.pending[1].resolve({ ...detail(), version: 4 });
  await saving;
  assert.equal(p.data.dirty, false);
});
test("version conflict preserves draft and manual refresh permits explicit draft restore", async () => {
  const f = fixture("plan/detail"),
    p = f.page;
  p.savedScheme = f.load("services/scheme-edits.js").baseline(detail(),[entry()]);
  p.setData({
    id,
    detail: detail(),
    items: [entry()],
    name: "保留输入",
    description: "文本",
    dirty: true,
  });
  p.field({currentTarget:{dataset:{field:"name"}},detail:{value:"保留输入"}});
  const saving = p.save();
  await tick();
  f.pending[0].reject({
    reason: "VERSION_CONFLICT",
    outcome: "business-rejection",
    status: 409,
    message: "版本冲突",
  });
  await saving;
  assert.equal(p.data.name, "保留输入");
  assert.equal(p.data.dirty, true);
  const refreshing = p.refresh();
  await tick();
  f.pending[1].resolve({ ...detail(), name: "服务器新值", version: 4 });
  await refreshing;
  assert.equal(p.data.name, "服务器新值");
  p.restoreDraft();
  assert.equal(p.data.name, "保留输入");
  assert.equal(p.data.detail.version, 4);
});
test("shared page revalidates each entry, clears invalid content and ignores late old token", async () => {
  const f = fixture("plan/share"),
    p = f.page;
  await p.onShow();
  assert.equal(p.data.invalid, true);
  assert.equal(f.pending.length, 0);
  p.setData({ token: "a".repeat(43) });
  const first = p.onShow();
  await tick();
  p.onHide();
  p.setData({ token: "b".repeat(43) });
  const second = p.onShow();
  await tick();
  f.pending[1].reject({
    reason: "SHARE_INVALID",
    status: 404,
    message: "分享已失效",
  });
  await second;
  f.pending[0].resolve({ ...detail(), hidePrice: false });
  await first;
  assert.equal(p.data.detail, null);
  assert.equal(p.data.items.length, 0);
  assert.equal(p.data.invalid, true);
});
test("renter checklist events and supplier warehouse events share root without overwriting each other", () => {
  const f = fixture("checklist/index"),
    p = f.page;
  p.setData({ factoryRoot: false });
  p.open({ currentTarget: { dataset: { id } } });
  p.create();
  assert.equal(f.nav[0], "/pages/checklist/detail?id=" + id);
  assert.equal(f.nav[1], "/pages/props/dates");
  p.setData({ factoryRoot: true });
  p.open({ currentTarget: { dataset: { id } } });
  assert.equal(f.nav[2], "/pages/props/detail?id=" + id);
});
test("道具页在原页打开清单弹层，关闭不写入；不可租时不打开", () => {
  const f = fixture("props/product"), p = f.page;
  const props = f.load("services/props.js");
  props.card = row => ({id:sku,name:row.propName});
  p.setData({id:sku,item:{propName:"长桌"},verified:true,startDate:"2026-12-01",endDate:"2026-12-03",availability:{maxRentableQuantity:6,rentableStatus:"rentable"}});
  p.unavailable();
  assert.equal(p.data.checklistProp.id,sku);
  assert.equal(p.data.checklistProp.startDate,"2026-12-01");
  assert.equal(p.data.checklistProp.maxQuantity,6);
  assert.equal(f.pending.length,0);
  p.closeChecklistPicker();assert.equal(p.data.checklistProp,null);
  p.setData({availability:{maxRentableQuantity:0,rentableStatus:"unavailable"}});
  p.unavailable();assert.equal(p.data.checklistProp,null);assert.equal(f.pending.length,0);
});
test("calendar creates real manual checklist once and preserves browse filters after response", async () => {
  const f = fixture("props/dates"),
    p = f.page;
  p.onLoad({
    return:
      "/pages/props/browse?keyword=" +
      encodeURIComponent("木椅") +
      "&styles=" +
      encodeURIComponent('["retro"]'),
  });
  const today = f.load("services/rental-calendar.js").earliestStart();
  p.setData({ startDate: today, endDate: today });
  const creating = p.confirm();
  await tick();
  assert.equal(f.pending[0].args[0], "/api/me/checklists");
  assert.equal(f.pending[0].args[3].sourceType, "manual");
  p.confirm();
  assert.equal(f.pending.length, 1);
  f.pending[0].resolve({ resourceId: id });
  await creating;
  assert.match(f.nav[0], /keyword=/);
  assert.match(f.nav[0], /startDate=/);
});
test("address failure keeps inputs; default submits address data without login phone operation", async () => {
  const f = fixture("address/edit"),
    p = f.page;
  p.setData({
    id,
    version: 2,
    receiverName: "联系人",
    phone: "13800000001",
    regionText: "上海市 静安区",
    detailAddress: "测试路1号",
    isDefault: true,
    dirty: true,
  });
  const saving = p.save();
  await tick();
  assert.equal(f.pending[0].args[0], "/api/me/addresses/" + id + "/update");
  assert.equal(f.pending[0].args[3].expectedVersion, 2);
  f.pending[0].reject({
    outcome: "business-rejection",
    reason: "VERSION_CONFLICT",
    message: "冲突",
    status: 409,
  });
  await saving;
  assert.equal(p.data.detailAddress, "测试路1号");
  assert.equal(p.data.dirty, true);
  assert.equal(f.nav.length, 0);
});
test("historical images renew from resource-scoped projection, not public SKU detail", async () => {
  const f = fixture(),
    images = f.load("services/public-images.js"),
    old = {
      url: "https://example.invalid/old",
      expiresAt: "2020-01-01T00:00:00Z",
      cacheKey: "a".repeat(64),
    },
    fresh = {
      ...old,
      url: "https://example.invalid/new",
      expiresAt: "2099-01-01T00:00:00Z",
    };
  let requests = 0;
  const renew = async () => {
    requests++;
    return { items: [{ display: { image: fresh } }] };
  };
  const options = {
    scope: "scheme:" + id + ":1",
    extract: (r) => r.items.map((i) => i.display.image),
    current: () => true,
  };
  const result = await Promise.all([
    images.ensure(old, "", renew, false, options),
    images.ensure(old, "", renew, false, options),
  ]);
  assert.equal(requests, 1);
  assert.equal(result[0].url, fresh.url);
});

test("500-item detail renders in bounded chunks without embedding a second full array in header", async () => {
  const f = fixture("plan/detail"),
    p = f.page,
    updates = [];
  p.setData({ id });
  const set = p.setData;
  p.setData = function (value) {
    updates.push(structuredClone(value));
    set.call(this, value);
  };
  const loading = p.load();
  await tick();
  f.pending[0].resolve({
    ...detail(),
    items: Array.from({ length: 500 }, (_, i) => ({
      ...entry(),
      id: String(i),
      remark: "中".repeat(255),
    })),
  });
  await loading;
  assert.equal(p.data.items.length, 500);
  assert.equal(p.data.detail.items, undefined);
  assert.ok(
    updates.every((u) => Buffer.byteLength(JSON.stringify(u)) < 100000),
  );
});
test("planning append coalesces bottom events and retries the same failed page without clearing loaded rows", async () => {
  const f = fixture("plan/index"),
    p = f.page;
  p.setData({ rootReady: true, factoryRoot: false });
  const first = p.loadPlanning();
  await tick();
  f.pending[0].resolve({
    items: Array.from({ length: 20 }, (_, i) => ({
      ...detail(),
      id: String(i),
    })),
    total: "40",
  });
  await first;
  const next = p.onReachBottom();
  p.onReachBottom();
  await tick();
  assert.equal(f.pending.length, 2);
  f.pending[1].reject({ message: "network" });
  await next;
  assert.equal(p.data.items.length, 20);
  const retry = p.retry();
  await tick();
  assert.match(f.pending[2].args[0], /page=2/);
  f.pending[2].resolve({
    items: Array.from({ length: 20 }, (_, i) => ({
      ...detail(),
      id: String(i + 20),
    })),
    total: "40",
  });
  await retry;
  assert.equal(p.data.items.length, 40);
  p.onReachBottom();
  assert.equal(f.pending.length, 3);
});
test("uncertain share replays the same POST and key, then a fresh action makes a new request", async () => {
  const f = fixture("plan/detail"), p = f.page, path="/api/me/schemes/"+id+"/share";
  let sequence=0;
  f.wx.getRandomValues=o=>o.success({randomValues:new Uint8Array(16).fill(++sequence).buffer});
  p.setData({id,detail:detail(),hidePrice:true});
  const first=p.share(); await tick(); f.pending[0].reject(new Error("network")); await first;
  const retry=p.share(); await tick();
  assert.equal(f.pending.length,2);
  assert.equal(f.pending[1].args[0],path);
  assert.deepEqual(f.pending[0].args.slice(3),f.pending[1].args.slice(3));
  f.pending[1].resolve({receipt:{resourceVersion:4},share:{token:"a".repeat(43)}}); await retry;
  assert.match(p.onShareAppMessage().path,/a{43}$/);
  p.closeShare(); assert.equal(f.pending.length,2);
  p.togglePrice(); assert.equal(f.pending.length,2);
  const next=p.share(); await tick();
  assert.equal(f.pending[2].args[3].hidePrice,false);
  assert.equal(f.pending[2].args[3].expectedVersion,4);
  assert.notEqual(f.pending[2].args[4]["Idempotency-Key"],f.pending[1].args[4]["Idempotency-Key"]);
  f.pending[2].resolve({receipt:{resourceVersion:5},share:{token:"b".repeat(43)}});await next;
  assert.match(p.onShareAppMessage().path,/b{43}$/);
});
test("one detached image consumer does not cancel another consumer of the same historical resource", async () => {
  const f = fixture(),
    images = f.load("services/public-images.js"),
    old = {
      url: "https://example.invalid/old",
      expiresAt: "2020-01-01T00:00:00Z",
      cacheKey: "b".repeat(64),
    },
    fresh = {
      ...old,
      url: "https://example.invalid/new",
      expiresAt: "2099-01-01T00:00:00Z",
    };
  let resolve,
    current = true;
  const renew = () => new Promise((r) => (resolve = r)),
    base = { scope: "scheme:" + id, extract: (r) => r.items };
  const first = images.ensure(old, "", renew, false, {
      ...base,
      current: () => current,
    }),
    second = images.ensure(old, "", renew, false, {
      ...base,
      current: () => true,
    });
  await tick();
  current = false;
  resolve({ items: [fresh] });
  await assert.rejects(first, (e) => e.name === "StaleSessionError");
  assert.equal((await second).url, fresh.url);
});
test("unchanged HTTP projections remain valid; receipt-only shares and legacy links without expiry are rejected", () => {
  const evidence = path.resolve(
    __dirname,
    "../../../开发交接/D3-最小首次交易/证据/D3-A/http-success.jsonl",
  );
  assert.ok(
    fs.existsSync(evidence),
    "Run D3PlanningTest to capture real isolated HTTP projections first",
  );
  const protocol = fixture().load("services/response-contract.js"),
    rows = fs.readFileSync(evidence, "utf8").trim().split("\n").map(JSON.parse);
  assert.ok(rows.length > 20);
  for (const row of rows) {
    const response = { code: "OK", message: "成功", data: row.data, traceId: id };
    const receiptOnly = row.method === "POST" && row.path.endsWith("/share") && !row.data.share;
    const oldExpiry = row.method === "GET" && row.data?.share?.expiresAt === null;
    assert.equal(protocol.accepts(row.path, row.method, 200, response),
      !receiptOnly && !oldExpiry, row.method + " " + row.path);
    if (oldExpiry) {
      const data = {...row.data, share: {...row.data.share, expiresAt: "2026-11-25T12:00:00.000+08:00"}};
      assert.ok(protocol.accepts(row.path, row.method, 200, {...response, data}));
    }
  }
});
test("leaving the page while export completes does not open a native document on another page", async () => {
  const f = fixture(),
    api = f.load("services/planning.js"),
    ui = f.load("services/planning-page.js");
  let resolve,
    opened = 0;
  api.exportPdf = () => new Promise((r) => (resolve = r));
  api.openPdf = async () => opened++;
  const page = {
    data: { busy: false },
    setData(values) {
      Object.assign(this.data, values);
    },
  };
  const exporting = ui.exportPdf(page, id, false);
  page.pdfStopped = true;
  resolve({ exportId: sku, buffer: array("%PDF-") });
  await exporting;
  assert.equal(opened, 0);
  assert.equal(page.data.exportingId, "");
});


test("native display normalization keeps optional text empty across scheme, checklist and share", async () => {
  const f = fixture(), api = f.load("services/planning.js");
  assert.equal(api.summary({description:null}).description, "");
  assert.equal(api.summary({}).description, "");
  assert.equal(api.display({...entry(),remark:null}).remark, "");
  const share = fixture("plan/share");
  share.page.onLoad({token:"a".repeat(43)});
  const loading = share.page.onShow();
  share.pending[0].resolve({...detail(),description:null,hidePrice:true});
  await loading;
  assert.equal(share.page.data.detail.description, "");
});

test("HTML share clipboard is available only for a ready token and uses the configured origin", () => {
  const f = fixture("plan/detail"), copied = [];
  f.wx.setClipboardData = (options) => { copied.push(options.data); };
  f.page.copyShareLink();
  assert.equal(copied.length, 0);
  f.page.setData({shareReady:true,shareToken:"a".repeat(43)});
  f.page.copyShareLink();
  assert.equal(copied[0], "https://fixture.invalid/share/scheme.html?token=" + "a".repeat(43));
  assert.ok(!f.page.data.message, "复制成功沿用微信提示，不产生页面错误");
  f.page.setData({shareReady:false});
  f.page.copyShareLink();
  assert.equal(copied.length, 1);
});

// 保留真实openPdf及公共页面流程，仅控制网络/文件/原生回调的完成时序。
function pdfRaceFixture(pageName = "plan/detail") {
  const f = fixture(pageName), api = f.load("services/planning.js"),
    ui = f.load("services/planning-page.js"), writes = [], opened = [], files = new Set();
  f.wx.env = {USER_DATA_PATH: "/isolated"};
  f.wx.getFileSystemManager = () => ({
    writeFile: options => writes.push(options),
    unlink: options => files.delete(options.filePath),
  });
  f.wx.openDocument = options => { opened.push(options); options.success(); };
  f.page.setData({id, exportId:sku, detail:detail(), items:[]});
  api.get = async () => ({status:"success", canDownload:true});
  api.exportPdf = async () => ({exportId:sku, buffer:array("%PDF-")});
  function finishWrite(index = 0) {
    files.add(writes[index].filePath);
    writes[index].success();
  }
  return {...f, api, ui, writes, opened, files, finishWrite};
}
for (const phase of ["request","writing"]) {
    test("plan/detail ignores export "+phase+" after leaving the page",async()=>{
      const f=pdfRaceFixture(); f.page.setData({items:[{id}]});
      let finish; if(phase==="request") f.api.exportPdf=()=>new Promise(r=>{finish=r});
      const done=f.page.export({currentTarget:{dataset:{id}}});
      await tick();f.page.onHide();
      if(phase==="request") finish({exportId:sku,buffer:array("%PDF-")});else f.finishWrite();
      await done;assert.equal(f.opened.length,0);assert.equal(f.files.size,0);
    });
}
test("方案只在详情提供导出入口", () => {
  const list = fixture("plan/index");
  assert.equal(list.page.export, undefined);
  const wxml = file => fs.readFileSync(path.join(__dirname, "../miniprogram/pages/plan/" + file + ".wxml"), "utf8");
  assert.doesNotMatch(wxml("index"), /bindtap="export"|导出 PDF/);
  assert.equal((wxml("detail").match(/bindtap="export"/g) || []).length, 1);
});
test("PDF writing during session replacement is discarded and its completed file is removed", async () => {
  const f = pdfRaceFixture();
  const completion = f.ui.exportPdf(f.page,id,false);
  await tick();
  f.session.replace("owner-B");
  f.finishWrite();
  await completion;
  assert.equal(f.opened.length,0);
  assert.equal(f.files.size,0);
});
test("PDF stale write cleanup cannot delete the newer operation's file for the same export", async () => {
  const f = pdfRaceFixture();
  const first = f.api.openPdf({exportId:sku,buffer:array("%PDF-")},f.ui.beginPdf(f.page));
  const second = f.api.openPdf({exportId:sku,buffer:array("%PDF-")},f.ui.beginPdf(f.page));
  assert.notEqual(f.writes[0].filePath,f.writes[1].filePath);
  f.finishWrite(1);
  await second;
  f.finishWrite(0);
  await first;
  assert.equal(f.opened.length,1);
  assert.deepEqual([...f.files],[f.writes[1].filePath]);
  f.ui.pdfShown(f.page);
  assert.equal(f.files.size,0);
});
test("PDF normal native preview keeps its file through onHide and cleans it on return", async () => {
  const f = pdfRaceFixture();
  f.wx.openDocument = options => {f.opened.push(options);f.page.onHide();options.success();};
  const completion = f.ui.exportPdf(f.page,id,false);
  await tick();
  f.finishWrite();
  await completion;
  assert.equal(f.opened.length,1);
  assert.equal(f.files.size,1);
  // 隔离页面刷新请求：仅验证真实onShow中的文件生命周期。
  f.page.load = async () => {};
  await f.page.onShow();
  assert.equal(f.files.size,0);
});
test("PDF unload while writing and native-open failure both remove only their own file", async () => {
  for (const failure of ["unload", "open failed"]) {
    const f = pdfRaceFixture();
    f.wx.openDocument = options => options.fail(new Error("native open failed"));
    const completion = f.ui.exportPdf(f.page,id,false);
    await tick();
    if (failure === "unload") f.page.onUnload();
    f.finishWrite();
    await completion;
    assert.equal(f.files.size,0);
    if (failure === "open failed") assert.equal(f.page.data.message,"native open failed");
  }
});

for (const route of ["address/edit", "plan/detail", "checklist/detail"]) {
  test(route + " private draft is discarded on denial, missing object or account change", async () => {
    for (const outcome of [403, 404, "switch"]) {
      const { page, pending, session } = fixture(route);
      page.setData({ id, dirty: true, detail: detail(), items: [entry()], name: "旧方案",
        description: "旧简介", receiverName: "旧联系人", phone: "13800000000", detailAddress: "旧门牌" });
      const refreshing = page.refresh();
      await tick();
      assert.equal(page.data.canRestoreDraft, true);
      if (outcome === "switch") session.replace("owner-B");
      pending[0].reject({ status: outcome === "switch" ? 403 : outcome, message: "不可见" });
      await refreshing;
      assert.equal(page.savedDraft, null);
      assert.equal(page.data.canRestoreDraft, false);
      page.restoreDraft();
      if (route === "address/edit") {
        assert.equal(page.data.receiverName, "");
        assert.equal(page.data.phone, "");
        assert.equal(page.data.detailAddress, "");
      } else {
        assert.equal(page.data.name, "");
        assert.equal(page.data.description, "");
        assert.equal(page.data.items.length, 0);
      }
    }
    const template = fs.readFileSync(path.resolve(__dirname, "../miniprogram/pages", route + ".wxml"), "utf8");
    assert.match(template, /<button wx:if="{{canRestoreDraft}}"[^>]*bindtap="restoreDraft"/);
  });
  test(route + " same-account draft survives temporary failure and version conflict", async () => {
    for (const error of [new Error("网络中断"), {status: 409, reason: "VERSION_CONFLICT", message: "版本变化"}]) {
      const { page, pending } = fixture(route);
      page.setData({ id, dirty: true, items: [entry()], name: "草稿", receiverName: "草稿" });
      const refreshing = page.refresh();
      await tick();
      pending[0].reject(error);
      await refreshing;
      assert.equal(page.data.canRestoreDraft, true);
      page.setData({ name: "", receiverName: "", items: [] });
      page.restoreDraft();
      assert.equal(route === "address/edit" ? page.data.receiverName : page.data.name, "草稿");
      if (route !== "address/edit") assert.equal(page.data.items.length, 1);
      assert.equal(page.data.canRestoreDraft, false);
      assert.equal(page.data.dirty, true);
    }
  });
}

test("read-only scheme and checklist keep the server view and discard the editing draft", async () => {
  for (const route of ["plan/detail", "checklist/detail"]) {
    const { page, pending } = fixture(route);
    page.setData({ id, dirty: true, name: "旧输入", items: [entry()] });
    const refreshing = page.refresh();
    await tick();
    pending[0].resolve({ ...detail(), name: "服务器名称", actions: {canEdit: false} });
    await refreshing;
    assert.equal(page.savedDraft, null);
    assert.equal(page.data.canRestoreDraft, false);
    page.restoreDraft();
    assert.equal(page.data.name, "服务器名称");
  }
});

function schemePicker() {
  const f = fixture(null, { roleCode: "demander" });
  f.load("components/scheme-picker/index.js");
  const sheet = {
    ...f.component.methods,
    owner: f.session.capture(),
    data: { ...structuredClone(f.component.data), prop: { id: sku } },
    setData(values) { Object.assign(this.data, values); },
    events: [],
    triggerEvent(name) { this.events.push(name); },
  };
  return { f, sheet };
}

test("方案弹层按选中的版本合并数量和备注，双击仅提交一次，冲突后须重新选择", async () => {
  const { f, sheet } = schemePicker();
  const selecting = sheet.select(id);
  f.pending.shift().resolve(detail());
  await selecting;
  sheet.quantity("0");
  await sheet.submit();
  assert.equal(f.pending.length, 0);
  sheet.quantity("3");
  const commit = sheet.submit();
  await sheet.submit();
  await tick();
  assert.equal(f.pending.length, 1);
  const request = f.pending.shift();
  assert.deepEqual({ ...request.args[3] }, { expectedVersion: 3, skuId: sku, quantity: 5, remark: "旧备注" });
  request.reject(Object.assign(new Error("方案已更新"), {
    reason: "VERSION_CONFLICT", outcome: "business-rejection",
  }));
  await commit;
  assert.equal(sheet.data.target, null);
  await sheet.submit();
  assert.equal(f.pending.length, 0);
  assert.deepEqual(sheet.events, []);
});

test("关闭或切换账号后，迟到的方案详情不会恢复数量表单", async () => {
  for (const action of ["close", "switch"]) {
    const { f, sheet } = schemePicker();
    const selecting = sheet.select(id);
    if (action === "close") f.component.lifetimes.detached.call(sheet);
    else f.session.replace("owner-B");
    f.pending.shift().resolve(detail());
    await selecting;
    assert.equal(sheet.data.target, null);
    assert.deepEqual(sheet.events, []);
  }
});

function checklistPicker() {
  const f = fixture(null, { roleCode: "demander" });
  f.load("components/checklist-picker/index.js");
  const sheet = {
    ...f.component.methods, owner: f.session.capture(),
    data: { ...structuredClone(f.component.data), prop: { id: sku, startDate: "2026-12-01", endDate: "2026-12-03", maxQuantity: 5 } },
    setData(values) { Object.assign(this.data, values); },
    events: [], triggerEvent(name) { this.events.push(name); },
  };
  return { f, sheet };
}
async function loadChecklistSheet(f, sheet) {
  const loading = sheet.load();
  f.pending.shift().resolve({currentChecklist: {id, name:"测试清单", status:"selecting", startDate:"2026-12-01", endDate:"2026-12-03"}});
  await tick();
  f.pending.shift().resolve({id, version:3, groups:[{items:[entry()]}]});
  await loading;
}
test("清单底部弹层按真实剩余数量合并，保留原备注和版本，重复点击仅写一次", async () => {
  const {f,sheet}=checklistPicker();
  await loadChecklistSheet(f,sheet);
  assert.equal(sheet.data.max,3);
  assert.equal(sheet.data.remark,"旧备注");
  for(const invalid of ["0","4","1.5","-1","2x"]) {
    sheet.quantity(invalid);await sheet.submit();assert.equal(f.pending.length,0);
  }
  sheet.quantity("2");
  const saving=sheet.submit();await sheet.submit();await tick();
  assert.equal(f.pending.length,1);
  const request=f.pending.shift();
  assert.deepEqual({...request.args[3]}, {expectedVersion:3,skuId:sku,quantity:4,remark:"旧备注"});
  request.reject(Object.assign(new Error("版本变化"),{reason:"VERSION_CONFLICT",outcome:"business-rejection"}));
  await saving;assert.equal(sheet.data.target,null);
  await sheet.submit();assert.equal(f.pending.length,0);
});
test("清单弹层关闭或换号后的迟到读取不恢复表单，也不在旧租期写入", async () => {
  for(const leave of ["detach","switch","dates"]) {
    const {f,sheet}=checklistPicker(),loading=sheet.load();
    if(leave==="detach")f.component.lifetimes.detached.call(sheet);
    if(leave==="switch")f.session.replace("owner-B");
    f.pending.shift().resolve({currentChecklist:{id,status:"selecting",startDate:"2026-12-10",endDate:"2026-12-12"}});
    await loading;
    assert.equal(sheet.data.target,null);assert.equal(f.pending.length,0);
    await sheet.submit();assert.equal(f.pending.length,0);
  }
});

test("私有参考图片只经原材料接口读取；换号后迟到签名不能显示，原表单不注入展示字段", async () => {
  const f=fixture(null,{roleCode:"demander"});
  f.load("components/private-material/index.js");
  const c=f.load("services/custom.js"), calls=[];
  let resolve;
  c.get=(url)=>{calls.push(url);return new Promise(done=>{resolve=done})};
  const file={materialId:sku,type:"image",name:"参考图"};
  const picture={...f.component.methods,alive:true,data:{...f.component.data,file,sourceId:id,kind:"requirements",factory:false},setData(v){Object.assign(this.data,v)}};
  const reading=picture.load();
  assert.equal(calls[0],"/api/custom-requirements/"+id+"/materials/"+sku+"/view");
  f.session.replace("other");
  resolve({url:"https://example.invalid/private.png"});await reading;
  assert.equal(picture.data.src,"");assert.deepEqual(file,{materialId:sku,type:"image",name:"参考图"});
  picture.data.kind="../untrusted";await picture.load();assert.equal(calls.length,1);
});

test("工厂已有材料缩略图复用鉴权查看接口，关闭后不恢复图片，提交定位符保持原样", async () => {
  const f=fixture(null,{roleCode:"supplier"});f.load("components/private-material/index.js");
  const api=f.load("services/factory.js"),calls=[];let resolve;
  api.request=(...args)=>{calls.push(args);return new Promise(done=>resolve=done)};
  const locator={objectKey:"private/factory/license.png"},factoryFile={kind:"existing",locator};
  const picture={...f.component.methods,alive:true,data:{...f.component.data,factoryFile},setData(v){Object.assign(this.data,v)}};
  const loading=picture.load();assert.deepEqual(calls[0],["factory-materials/view","POST",locator]);
  f.component.lifetimes.detached.call(picture);resolve({url:"https://example.invalid/image"});await loading;
  assert.equal(picture.data.src,"");assert.deepEqual(factoryFile,{kind:"existing",locator});
});

test("mixed changes use stable IDs, merge repeat edits and preserve sort slots after deletion", () => {
  const edits=require("../miniprogram/services/scheme-edits");
  const rows=[0,1,2,3,4,5].map(i=>({...entry(),id:"line"+i,sortOrder:i}));
  const before=edits.baseline(detail(),rows);
  for (const quantity of [4,5,7]) before.edit({...rows[2],quantity});
  before.remove(rows[4],4);
  before.editInfo("新名","简介");
  assert.deepEqual(before.actions(),[
    {action:"updateItem",itemId:"line2",quantity:7,remark:"旧备注",sortOrder:2},
    {action:"removeItem",itemId:"line4"},
    {action:"updateSchemeInfo",name:"新名",description:"简介"},
  ]);
  before.commit(); before.edit({...rows[2],quantity:7}); assert.equal(before.dirty,false);
  const edits2=edits.baseline(detail(),rows), added={...entry(),id:undefined};
  edits2.add(added); edits2.remove(added,rows.length); edits2.edit({...rows[0],quantity:''});
  assert.throws(()=>edits2.actions(),/正整数/); edits2.edit(rows[0]); assert.deepEqual(edits2.actions(),[]);
  [rows[0],rows[1]]=[rows[1],rows[0]]; edits2.move(rows,0,1); edits2.add(added);
  assert.deepEqual(edits2.actions().map(a=>[a.action,a.itemId||a.skuId,a.sortOrder]),
    [["updateItem","line1",0],["updateItem","line0",1],["addItem",sku,6]]);
  const tied=rows.map((r,i)=>({...r,id:'a'+i,sortOrder:0})), journal=edits.baseline(detail(),tied);
  [tied[1],tied[2]]=[tied[2],tied[1]];journal.move(tied,1,2);
  assert.deepEqual(journal.actions().map(a=>a.itemId),['a1','a3','a4','a5']);
  [tied[1],tied[2]]=[tied[2],tied[1]];journal.move(tied,2,1);assert.equal(journal.dirty,false);
});

test("历史清单按 history 独立分页，返回保留页码；工厂无法借登录回跳读取该列表", async () => {
  const route = "pages/checklist/history";
  const f = fixture("checklist/history", { roleCode: "demander" }), p = f.page;
  p.route = route;
  await p.onLoad({});
  const first = p.onShow();
  await tick();
  assert.equal(f.pending[0].args[0], "/api/me/checklists?page=1&pageSize=20&scope=history");
  const rows = Array.from({length: 20}, (_, i) => ({id: String(i), name: "历史清单 " + i, status: "converted_to_order"}));
  f.pending[0].resolve({items: rows, total: "21"});
  await first;
  const next = p.onReachBottom();
  assert.equal(f.pending[1].args[0], "/api/me/checklists?page=2&pageSize=20&scope=history");
  f.pending[1].resolve({items: [{...rows[0], id}], total: "21"});
  await next;
  p.open({ currentTarget: { dataset: { id } } });
  assert.equal(f.nav.at(-1), "/pages/checklist/detail?id=" + id);
  p.onHide();
  await p.onShow();
  assert.equal(p.data.items.length, 21);
  assert.equal(p.data.page, 2);
  assert.equal(f.pending.length, 2);
  const select = f.load("navigation/login-target.js").select;
  assert.equal(select({roleCode: "demander"}, "/" + route), "/" + route);
  assert.equal(select({roleCode: "supplier"}, "/" + route), "/pages/home/index");
});

test("清单按租期上限校正手输，历史超量仍可减量，零库存不产生零件行", () => {
  const f = fixture("checklist/detail"), p = f.page, notices = [];
  f.wx.showToast = ({ title }) => notices.push(title);
  const event = { currentTarget: { dataset: { index: 0, id: sku, field: "quantity" } } };
  function input(value) { p.itemField({ ...event, detail: { value } }); }
  function step(delta) { p.step({ currentTarget: { dataset: { index: 0, delta } } }); }
  function row(quantity, maxRentableQuantity) {
    p.setData({ items: [{ ...entry(), quantity, savedQuantity: quantity, availability: { maxRentableQuantity } }] });
  }
  row(2, 5);
  input("7");
  assert.equal(p.data.items[0].quantityDraft, "7");
  p.finishChecklistQuantity(event);
  assert.equal(p.data.items[0].quantity, 5);
  assert.match(notices.pop(), /超过上限.*5/);
  step(1);
  assert.equal(p.data.items[0].quantity, 5);
  row(5, 3);
  p.finishChecklistQuantity(event);
  assert.equal(p.data.items[0].quantity, 5);
  step(-1);
  step(1);
  assert.equal(p.data.items[0].quantity, 4);
  row(3, 0);
  input("7");
  p.finishChecklistQuantity(event);
  assert.equal(p.data.items[0].quantity, 3);
  step(-1);
  assert.equal(p.data.items[0].quantity, 2);
  assert.equal(f.pending.length, 0);
});

test("北京时间11点整切换最早取货日，跨月跨年按14天限制取货", () => {
  const c = require("../miniprogram/services/rental-calendar");
  for (const [now, min] of [
    ["2026-11-25T02:59:59.999Z", "2026-11-27"],
    ["2026-11-25T03:00:00.000Z", "2026-11-28"],
    ["2026-12-30T03:00:00.000Z", "2027-01-02"],
  ]) {
    assert.equal(c.earliestStart(Date.parse(now)), min);
    assert.equal(c.startWindow(Date.parse(now)).latest, now.startsWith("2026-11") ? "2026-12-09" : "2027-01-13");
    assert.equal(c.startWindow(Date.parse(now)).earliestDays, now.includes("T02:") ? 2 : 3);
    const window = c.startWindow(Date.parse(now));
    const cells = c.cells(min.slice(0, 7), "", "", window);
    assert.equal(cells.find(day => day.date === min).disabled, false);
    assert.ok(cells.filter(day => day.date < min).every(day => day.disabled));
    assert.ok(c.allowed(min, min, window));
    assert.equal(c.allowed("2027-02-10", "2027-02-10", window), false);
  }
});

test("单件左滑按稳定 ID 确认，取消不改清单，移除进入待保存草稿", async () => {
  const f = fixture("checklist/detail"), p = f.page, event = {currentTarget:{dataset:{id:sku}},detail:{opened:true}};
  p.setData({id,detail:{actions:{canEdit:true}},items:[entry(),{...entry(),id:"other"}]});
  let confirm;
  f.wx.showModal = o => {confirm = o.success};
  p.revealRow(event);
  const cancelled = p.removeRow(event); confirm({confirm:false}); await cancelled;
  assert.equal(p.data.items.length,2);
  p.revealRow(event);
  const removed = p.removeRow(event);p.setData({items:[...p.data.items].reverse()});confirm({confirm:true});await removed;
  assert.equal(p.data.items.length,1);assert.equal(p.data.items[0].id,"other");
  assert.equal(p.data.dirty,true);assert.equal(f.pending.length,0);
});

test("已截止清单点配送结算使用轻提示，已受理批次可查看原付款", () => {
  const f=fixture("checklist/detail"),p=f.page;let toast;
  f.wx.showToast=o=>{toast=o};
  p.setData({id,detail:{submission:{canSubmit:false,reasonCode:"RENTAL_WINDOW_CLOSED"}},reason:"已超过下单截止"});
  p.submit();assert.equal(p.data.message,"");assert.equal(toast.title,p.data.reason);assert.equal(f.nav.length,0);
  p.setData({detail:{currentCheckoutBatchId:"previous"}});
  p.submit();assert.match(f.nav[0],/payment\/index\?id=previous/);
});
