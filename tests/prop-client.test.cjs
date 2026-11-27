const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(pageName, context = {}, realHttp = false) {
  const base = path.resolve(__dirname, "../miniprogram"),
    modules = new Map(),
    pending = [],
    uploads = [],
    storage = new Map([["mj.session", "owner-A"]]),
    nav = [],
    wire = [];
  let options,
    componentOptions,
    clockNow = null;
  class TestDate extends Date {
    constructor(...args) {
      super(
        ...(args.length ? args : [clockNow === null ? Date.now() : clockNow]),
      );
    }
    static now() {
      return clockNow === null ? Date.now() : clockNow;
    }
  }
  const app = { globalData: { context: null } };
  const wx = {
    showToast(options) { wx.lastToast = options; },
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    getRandomValues: (o) =>
      o.success({ randomValues: new Uint8Array(16).fill(6).buffer }),
    uploadFile: (o) => uploads.push(o),
    getFileSystemManager: () => ({
      stat: (o) => o.success({ stats: { size: 800_000 } }),
    }),
    getImageInfo: (o) => o.success({ width: 1200, height: 900, orientation: "up" }),
    request: (o) => wire.push(o),
    redirectTo: (o) => nav.push(o.url),
    navigateTo: (o) => nav.push(o.url),
    showModal: (o) => o.success({ confirm: true }),
  };
  function load(file) {
    file = path.resolve(base, file);
    if (modules.has(file)) return modules.get(file).exports;
    if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file));
    const module = { exports: {} };
    modules.set(file, module);
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {
      module,
      wx,
      getApp: () => app,
      Page: (o) => (options = o),
      Component: (o) => (componentOptions = o),
      Date: TestDate,
      Uint8Array,
      setTimeout,
      clearTimeout,
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
        if (target.endsWith("/services/factory-contract.js"))
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
    api = load("services/props.js");
  if (pageName) load("pages/" + pageName + ".js");
  const page = options && {
    ...options,
    data: structuredClone(options.data),
    setData(v) {
      for (const [key, value] of Object.entries(v)) {
        const match = /^items\[(\d+)\]$/.exec(key);
        if (match) this.data.items[Number(match[1])] = value;
        else this.data[key] = value;
      }
    },
  };
  return {
    api,
    session,
    pending,
    uploads,
    storage,
    wx,
    page,
    nav,
    wire,
    load,
    app,
    setNow(value) {
      clockNow = value;
    },
    get component() {
      return componentOptions;
    },
  };
}
const tick = () => new Promise((r) => setImmediate(r));
const id = "123456789abc4def8abc123456789abc";
function labelRow() {
  const f = fixture();
  f.load("components/inventory-label/index.js");
  const qr = {id, skuId:"sku", targetType:"SN", targetId:"sn", snCode:"SN-1", skuCode:"SKU-1", imageStatus:"ready", status:"bound"};
  const row = { ...f.component.methods, data:{...f.component.data, qrId:id, targetId:"sn", sku:{id:"sku",assetType:"A_ASSET",fields:{propName:"椅"}}},
    setData(patch){Object.assign(this.data,patch);} };
  row.reset();
  f.api.request = async () => qr;
  f.wx.getSetting = o => o.success({authSetting:{}});
  f.wx.downloadFile = o => {f.download = o};
  f.wx.saveImageToPhotosAlbum = o => {f.album = o};
  f.load("services/prop-label.js").render = async (_row, path, data) => {
    assert.equal(path,"raw.png");assert.equal(data.serial,"SN-1");return "printed.png";
  };
  return {f, row, qr};
}
test("行内生成标签并在本行保存同一张 PNG，生成时不打开新页或大图", async () => {
  const {f,row} = labelRow();
  const generating = row.print();await tick();
  assert.equal(f.download.header.Authorization,"Bearer owner-A");
  assert.equal(f.download.url,"https://fixture.invalid/api/me/prop-qr/"+id+"/image");
  f.download.success({statusCode:200,tempFilePath:"raw.png"});await generating;
  assert.equal(row.data.file,"printed.png");assert.equal(f.album,undefined);assert.deepEqual(f.nav,[]);
  const saving = row.print();await tick();assert.equal(f.album.filePath,row.data.file);
  f.album.success();await saving;assert.equal(f.wx.lastToast.title,"已保存标签图片");
});
test("原码下载错误保留重试，迟到的旧会话结果不能生成标签", async () => {
  for (const [msg,expected] of [["downloadFile:fail privacy permission denied",/授权/],["downloadFile:fail timeout",/图片下载失败/]]) {
    const {f,row} = labelRow();const run = row.print();await tick();f.download.fail({errMsg:msg});await run;
    assert.match(f.wx.lastToast.title,expected);assert.equal(row.data.file,"");
  }
  const {f,row}=labelRow();const run=row.print();await tick();f.session.clear();
  f.download.success({statusCode:200,tempFilePath:"raw.png"});await run;assert.equal(row.data.file,"");
});
test("保存时处理相册授权、撤销绑定与账号变化", async () => {
  const {f,row,qr}=labelRow();row.setData({file:"printed.png"});
  f.wx.getSetting=o=>o.success({authSetting:{"scope.writePhotosAlbum":false}});
  await row.print();assert.match(f.wx.lastToast.title,/相册权限/);assert.equal(f.album,undefined);
  f.wx.getSetting=o=>o.success({authSetting:{}});
  const saving=row.print();await tick();f.album.fail({errMsg:"saveImageToPhotosAlbum:fail auth deny"});await saving;
  assert.match(f.wx.lastToast.title,/相册权限/);
  f.album=undefined;qr.status="revoked";await row.print();assert.equal(row.data.file,"");assert.equal(f.album,undefined);
});
test("C factory material previews use the authenticated file endpoint and a temporary path", async () => {
  const f = fixture("props/scan/index");
  const api = f.load("services/props.js");
  const locator = { sourceType: "sku_audit", sourceId: id, section: "proposed", index: 0 };
  f.wx.downloadFile = (o) => { f.download = o; };
  f.wx.previewImage = (o) => { f.viewer = o; };
  const preview = api.preview(locator);
  assert.equal(f.download.url, "https://fixture.invalid/api/me/prop-materials/content?sourceType=sku_audit&sourceId=" + id + "&section=proposed&index=0");
  assert.equal(f.download.header.Authorization, "Bearer owner-A");
  f.download.success({ statusCode: 200, tempFilePath: "photo.jpg" });
  await preview;
  assert.equal(f.viewer.urls[0], "photo.jpg");
});
test("C B scan confirmation opens the identified inventory without history or writes", () => {
  const f = fixture("props/scan/index");
  f.page.setData({ qr: { status: "bound", targetType: "SKU", skuId: id } });
  f.wx.navigateBack = () =>
    assert.fail("recognition must not depend on navigation history");
  f.page.recognize();
  assert.deepEqual(f.nav, ["/pages/props/detail?id=" + id]);
  assert.equal(f.pending.length, 0);
});
test("C B scan confirmation reports navigation failure and ignores stale callbacks", () => {
  const f = fixture("props/scan/index");
  f.page.setData({ qr: { status: "bound", targetType: "SKU", skuId: id } });
  let navigation;
  f.wx.redirectTo = (o) => {
    navigation = o;
  };
  f.page.recognize();
  navigation.fail({ errMsg: "redirectTo:fail" });
  assert.match(f.page.data.message, /未能打开道具资料/);
  f.session.clear();
  navigation.fail({ errMsg: "redirectTo:fail" });
  assert.doesNotMatch(f.page.data.message, /未能打开道具资料/);
  assert.equal(f.pending.length, 0);
});
test("C B scan confirmation ignores busy and revoked labels and is bound in WXML", () => {
  const f = fixture("props/scan/index");
  f.page.setData({
    busy: true,
    qr: { status: "bound", targetType: "SKU", skuId: id },
  });
  f.page.recognize();
  f.page.setData({
    busy: false,
    qr: { status: "revoked", targetType: "SKU", skuId: id },
  });
  f.page.recognize();
  assert.equal(f.nav.length, 0);
  assert.equal(f.pending.length, 0);
  const wxml = fs.readFileSync(
    path.resolve(__dirname, "../miniprogram/pages/props/scan/index.wxml"),
    "utf8",
  );
  assert.match(
    wxml,
    /bindtap="recognize"[^>]*disabled="{{busy}}"[^>]*>确认识别/,
  );
});
test("C unknown command retains exact key/body; recovery 404 retries same command", async () => {
  const f = fixture();
  const body = { quantity: 3 };
  const first = f.api.command(
    "x",
    "create_stock_adjustment",
    "me/factory-props/" + id + "/stock-adjustments",
    body,
  );
  await tick();
  assert.equal(f.pending.length, 1);
  const wire = f.pending[0];
  f.pending[0].reject({ reason: "DATABASE_UNAVAILABLE", outcome: "unknown" });
  await assert.rejects(first);
  const key = wire.args[4]["Idempotency-Key"];
  const second = f.api.command(
    "x",
    "create_stock_adjustment",
    wire.args[0].slice(5),
    body,
  );
  await tick();
  assert.match(f.pending[1].args[0], /by-request/);
  f.pending[1].reject({ reason: "RESOURCE_NOT_FOUND" });
  await tick();
  assert.equal(f.pending[2].args[4]["Idempotency-Key"], key);
  assert.deepEqual(f.pending[2].args[3], body);
  f.pending[2].resolve({ outcome: "replayed" });
  await second;
  assert.equal(
    [...f.storage.keys()].filter((x) => x.startsWith("mj.prop.command")).length,
    0,
  );
});
test("C changed pending body is blocked and known rejection permits corrected new operation", async () => {
  const f = fixture();
  let p = f.api.command("x", "create_sku", "me/factory-props", { a: 1 });
  await tick();
  f.pending[0].reject({ reason: "UNEXPECTED_ERROR", outcome: "unknown" });
  await assert.rejects(p);
  p = f.api.command("x", "create_sku", "me/factory-props", { a: 2 });
  await tick();
  f.pending[1].reject({ reason: "RESOURCE_NOT_FOUND" });
  await assert.rejects(p, /原操作/);
  assert.equal(f.pending.length, 2);
  p = f.api.resume("x");
  await tick();
  f.pending[2].reject({ reason: "RESOURCE_NOT_FOUND" });
  await tick();
  f.pending[3].reject({
    reason: "VERSION_CONFLICT",
    outcome: "business-rejection",
  });
  await assert.rejects(p);
  assert.equal(
    [...f.storage.keys()].filter((x) => x.startsWith("mj.prop.command")).length,
    0,
  );
});
test("库存调整使用服务端的库存权限，能编辑资料不代表能调整数量", async () => {
  const f = fixture("inventory/adjust");
  f.api.request = async () => ({ canEditOptions: true, canAdjustInventory: false, assetType: "B_CONSUMABLE" });
  await f.page.load();
  assert.match(f.page.data.message, /不能调整库存/);
  f.page.setData({ reason: "盘点" });
  await f.page.submit();
  assert.equal(f.pending.length, 0);
});
test("C abnormal result has no default and clears when adjustment type changes", async () => {
  const f = fixture("inventory/adjust");
  f.page.setData({
    sku: { assetType: "B_CONSUMABLE", canEditOptions: true, canAdjustInventory: true },
    types: ["increase", "decrease", "abnormal_decrease"],
    reason: "盘点",
  });
  await f.page.type({ detail: { value: 2 } });
  assert.equal(f.page.data.abnormal, "");
  await f.page.submit();
  assert.match(f.wx.lastToast.title, /请选择丢失/);
  assert.equal(f.pending.length, 0);
  f.page.abnormal({ detail: { value: 1 } });
  assert.equal(f.page.data.abnormal, "lost");
  await f.page.type({ detail: { value: 1 } });
  assert.equal(f.page.data.abnormal, "");
});
test("C scan retains only safe locator across session reset and does not write inventory", async () => {
  const f = fixture("props/scan/index");
  f.page.onLoad({ scene: id });
  f.session.clear();
  assert.equal(f.page.data.code, id);
  assert.equal(f.page.data.qr, null);
  assert.equal(f.page.data.loginRequired, true);
  f.page.login();
  assert.equal(f.nav.length, 0);
  assert.equal(f.page.data.loginVisible, true);
  assert.match(f.page.data.loginReturnPath, /props\/scan\/index\?code=/);
  assert.equal(f.pending.length, 0);
  f.page.onLoad({ scene: "%2531" });
  assert.match(f.page.data.message, /不是平台/);
});
test("C stale session response cannot render QR or trigger a new account request", async () => {
  const f = fixture("props/scan/index");
  f.page.onLoad({ id });
  const p = f.page.load();
  assert.equal(f.pending.length, 1);
  f.session.clear();
  f.pending[0].resolve({
    skuId: id,
    targetType: "SN",
    id,
    imageStatus: "pending",
  });
  await tick();
  if (f.pending[1]) f.pending[1].resolve({ fields: { propName: "old" } });
  await p;
  assert.equal(f.page.data.qr, null);
  assert.equal(f.page.data.code, "");
  assert.equal(f.page.data.id, id);
});
test("C safe return accepts known C routes and rejects arbitrary URLs and traversal", () => {
  const r = require("../miniprogram/constants/routes");
  for (const x of [
    "/pages/props/scan/index?code=" + id,
    "/pages/props/browse?keyword=%E9%81%93%E5%85%B7",
    "/pages/inventory/index?id=" + id,
  ])
    assert.equal(r.safeReturn(x), x);
  for (const x of [
    "https://evil.invalid",
    "//evil.invalid",
    "/pages/props/../account/index",
    "/pages/props/scan/index?x=<script>",
  ])
    assert.equal(r.safeReturn(x), "/pages/home/index");
});
test("C filter arrays serialize as repeated keys, empty arrays omit and singleton remains array", () => {
  const f = fixture();
  assert.equal(
    f.api.query({ styleCodes: ["retro", "modern"], page: 2 }),
    "styleCodes=retro&styleCodes=modern&page=2",
  );
  assert.equal(f.api.query({ styleCodes: [] }), "");
  assert.equal(
    f.api.query({ styleCodes: ["special_asset"] }),
    "styleCodes=special_asset",
  );
});
test("C filter selection limits three and survives navigation, rental and reset", () => {
  const f = fixture("props/browse");
  f.page.load = () => {};
  f.page.setData({ styleOptions: ["retro", "modern", "special_asset", "other"].map(code => ({code, label: code, enabled: true})) });
  f.page.style({ currentTarget: { dataset: { code: "retro" } } });
  f.page.style({ currentTarget: { dataset: { code: "modern" } } });
  f.page.style({ currentTarget: { dataset: { code: "special_asset" } } });
  f.page.style({ currentTarget: { dataset: { code: "other" } } });
  assert.equal(f.page.data.styleCodes.length, 3);
  assert.match(f.wx.lastToast.title, /最多/);
  f.page.setData({
    page: 2,
    keyword: "椅",
    rental: true,
    startDate: "2026-11-01",
    endDate: "2026-11-03",
  });
  f.page.login();
  const target = f.page.data.loginReturnPath,
    params = Object.fromEntries(new URLSearchParams(target.split("?")[1]));
  const next = fixture("props/browse");
  next.page.onLoad(params);
  assert.deepEqual(Array.from(next.page.data.styleCodes), [
    "retro",
    "modern",
    "special_asset",
  ]);
  assert.equal(next.page.data.rental, true);
  next.page.remember();
  next.session.clear();
  assert.equal(next.page.data.styleCodes.length, 0, "session reset clears the old account; inline login alone restores its captured safe target");
  f.page.reset();
  assert.equal(f.page.data.styleCodes.length, 0);
  assert.equal(f.page.data.page, 1);
});
test("C response validator applies special_asset restriction only when contained", () => {
  const { valid } = require("../miniprogram/services/schema");
  const s = {
    type: "object",
    properties: {
      styleCodes: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 3,
      },
    },
    allOf: [
      {
        if: {
          properties: { styleCodes: { contains: { const: "special_asset" } } },
        },
        then: { properties: { styleCodes: { maxItems: 1 } } },
      },
    ],
  };
  assert.equal(valid(s, { styleCodes: ["retro", "modern"] }, {}), true);
  assert.equal(valid(s, { styleCodes: ["special_asset"] }, {}), true);
  assert.equal(valid(s, { styleCodes: ["special_asset", "retro"] }, {}), false);
});
test("C movement filters survive completion and pagination; nullable historical snapshots stay unknown", async () => {
  const f = fixture("inventory/movements");
  f.page.setData({
    id,
    startDate: "2026-10-29",
    source: "manual_adjustment",
    movement: "increase",
  });
  const run = f.page.load();
  await tick();
  assert.match(f.pending[0].args[0], /startDate=2026-10-29/);
  assert.match(f.pending[0].args[0], /sourceType=manual_adjustment/);
  f.pending[0].resolve({
    items: [{ id, before: null, after: null, movementType: "increase" }],
    total: "21",
  });
  await run;
  assert.equal(f.page.data.startDate, "2026-10-29");
  assert.equal(f.page.data.items[0].values[0].before, "—");
  f.page.next();
  await tick();
  assert.match(f.pending[1].args[0], /page=2/);
  assert.match(f.pending[1].args[0], /movementType=increase/);
  f.pending[1].resolve({ items: [], total: "21" });
  await tick();
});
test("工厂申请历史直接查询第一页，保留各状态和不同来源的记录", async () => {
  const f = fixture("props/reviews");
  const run = f.page.load();
  await tick();
  assert.equal(f.pending[0].args[0], "/api/me/prop-reviews?page=1");
  f.pending[0].resolve({
    items: [
      { id, sourceType: "sku_audit", auditStatus: "pending" },
      { id, sourceType: "stock_adjustment", auditStatus: "approved" },
    ],
    total: "2",
    pendingCounts: { total: "1", sku: "1", inventory: "0", skuStatus: "0" },
  });
  await run;
  assert.equal(f.page.data.total, "2");
  assert.notEqual(f.page.data.items[0].rowKey, f.page.data.items[1].rowKey);
  assert.equal(f.page.data.counts, undefined);
  assert.equal(f.pending.length, 1);
});
test("C route-specific command results reject cross-operation successful payload", () => {
  const { valid } = require("../miniprogram/services/schema"),
    contract = require("../miniprogram/services/response-contract-data");
  const schema = contract.paths["/api/me/factory-props"].post["200"];
  const d = {
    code: "OK",
    message: "成功",
    traceId: id,
    data: {
      operation: "issue_qr",
      outcome: "submitted",
      targetType: "qr_code",
      targetId: id,
      skuId: id,
      status: "bound",
      version: 0,
    },
  };
  assert.equal(valid(schema, d, contract.components.schemas), false);
});

// C-27 12.9.7: replay captured real isolated HTTP through production HTTP/page modules.
function c1297Evidence() {
  const dir = process.env.MJ_EVIDENCE_DIR;
  assert.ok(dir, "MJ_EVIDENCE_DIR must name actual C1297 HTTP evidence");
  return {
    dir,
    scenarios: JSON.parse(
      fs.readFileSync(path.join(dir, "c1297-scenarios.json")),
    ),
    http: fs
      .readFileSync(path.join(dir, "c1297-http.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse),
  };
}
function c1297Response(e, data) {
  const record = e.http.findLast(
    (r) => JSON.stringify(r.body.data) === JSON.stringify(data),
  );
  assert.ok(record, "response must have been recorded over real HTTP");
  return record;
}
// Historical HTTP predates Image.cacheKey. Adapt only that explicit schema addition;
// preserve the original capture and all original business values.
function currentC1297Fixture(body) {
  const copy = structuredClone(body);
  for (const value of [copy.data?.prop?.cover, ...(copy.data?.details?.images || [])]) {
    if (value && !value.cacheKey)
      value.cacheKey = require("node:crypto").createHash("sha256").update(new URL(value.url).pathname).digest("hex");
  }
  return copy;
}
async function c1297Reply(f, r) {
  await tick();
  const request = f.wire.shift();
  assert.ok(request, "page must request data");
  assert.equal(request.method, r.method);
  assert.equal(
    new URL(request.url).pathname,
    new URL(r.path, "http://fixture").pathname,
  );
  if (r.path === "/api/me/prop-qr/resolve" && r.status === 200)
    assert.equal(request.data.qrCode, r.body.data.qrCode);
  request.success({
    statusCode: r.status,
    data: r.path.startsWith("/api/me/props/") ? currentC1297Fixture(r.body) : r.body,
    header: {},
  });
  await tick();
}
function c1297State(e, name, page) {
  const target = path.join(process.env.MJ_D3_EVIDENCE_DIR || e.dir, "c1297-page-states.json");
  const states = fs.existsSync(target)
    ? JSON.parse(fs.readFileSync(target))
    : {};
  states[name] = JSON.parse(JSON.stringify(page.data));
  fs.writeFileSync(target, JSON.stringify(states, null, 2));
}
function productDisabled(data) {
  const wxml = fs.readFileSync(
    path.resolve(__dirname, "../miniprogram/pages/props/product.wxml"),
    "utf8",
  );
  const tag = wxml.match(/<button[^>]+bindtap="unavailable"[^>]*>/)[0];
  return vm.runInNewContext(tag.match(/disabled="{{(.*?)}}"/)[1], data);
}
test("C1297 real A/B unavailable responses disable the formal page and recover", async () => {
  const e = c1297Evidence();
  for (const type of ["a", "b"]) {
    const f = fixture("props/product", {}, true),
      zero = e.scenarios[type + "Unavailable"],
      positive = e.scenarios[type + "Restored"];
    f.page.onLoad({
      id: zero.prop.skuId,
      startDate: zero.availability.startDate,
      endDate: zero.availability.endDate,
    });
    let load = f.page.load();
    await c1297Reply(f, c1297Response(e, zero));
    await load;
    assert.equal(f.page.data.message, "");
    assert.equal(f.page.data.availability.maxRentableQuantity, 0);
    assert.equal(productDisabled(f.page.data), true);
    assert.ok(f.page.data.details.images.length);
    let toast = 0;
    f.wx.showToast = () => toast++;
    f.page.unavailable();
    assert.equal(
      toast,
      0,
      "unavailable action must stay disabled even if directly called",
    );
    assert.equal(f.wire.length, 0);
    assert.equal(f.nav.length, 0, "detail rental dates are display-only");
    c1297State(e, type + "Unavailable", f.page);
    load = f.page.load();
    assert.equal(
      f.page.data.verified,
      false,
      "retained content cannot be used until the forced refresh completes",
    );
    await c1297Reply(f, c1297Response(e, positive));
    await load;
    assert.equal(f.page.data.availability.maxRentableQuantity, 1);
    assert.equal(productDisabled(f.page.data), false);
    c1297State(e, type + "Restored", f.page);
    const missing = e.http.findLast(
      (r) =>
        r.method === "GET" &&
        r.path.startsWith("/api/me/props/") &&
        r.status === 404,
    );
    f.page.setData({
      id: new URL(missing.path, "http://fixture").pathname.split("/").at(-1),
    });
    load = f.page.load();
    await c1297Reply(f, missing);
    await load;
    assert.equal(f.page.data.item, null);
    assert.equal(f.page.data.availability, null);
    assert.match(f.page.data.message, /暂未找到/);
    c1297State(e, type + "NotFound", f.page);
    assert.equal(f.wire.length, 0);
  }
});
test("C1297 foreign QR real 404 clears old data and same-factory scene recovers", async () => {
  const e = c1297Evidence();
  const { responses } = require("./support/factory-sku-scan.http.json");
  const [resolved, skuDetail, stockDetail] = responses;
  const qr = resolved.body.data;
  const f = fixture("props/scan/index", { roleCode: "supplier" }, true);
  f.page.route = "pages/props/scan/index";
  f.page.onLoad({ scene: qr.qrCode });
  async function own() {
    const load = f.page.load();
    await c1297Reply(f, resolved);
    await c1297Reply(f, skuDetail);
    await c1297Reply(f, stockDetail);
    await load;
    assert.equal(f.page.data.qr.id, qr.id);
    assert.equal(f.page.data.sku.id, qr.skuId);
    assert.equal(f.page.data.sku.fields.packagingFactorBps, 12000);
    assert.equal(f.page.data.stock.skuId, qr.skuId);
    assert.equal(f.page.data.stock.totalQuantity, 5);
  }
  await own();
  let scanOptions;
  f.wx.scanCode = (o) => (scanOptions = o);
  f.page.scan();
  scanOptions.success({
    path: "pages/props/scan/index?scene=" + e.scenarios.samples.scene,
  });
  assert.equal(f.page.data.qr, null);
  assert.equal(
    f.page.data.sku,
    null,
    "old own factory data must disappear before resolving new scene",
  );
  const denied = e.http.findLast(
    (r) => r.path === "/api/me/prop-qr/resolve" && r.status === 404,
  );
  await c1297Reply(f, denied);
  assert.match(f.page.data.message, /暂未找到/);
  assert.equal(f.page.data.qr, null);
  assert.equal(f.page.data.sku, null);
  assert.equal(f.page.data.stock, null);
  assert.equal(f.page.data.busy, false);
  await f.page.confirm();
  f.page.recognize();
  assert.equal(f.wire.length, 0);
  assert.equal(f.nav.length, 0);
  c1297State(e, "foreignQrDenied", f.page);
  f.page.onLoad({ scene: qr.qrCode });
  await own();
  assert.equal(f.page.data.message, "");
  c1297State(e, "ownQrRestored", f.page);
  f.page.recognize();
  assert.deepEqual(f.nav, ["/pages/props/detail?id=" + qr.skuId]);
  const inventory = fixture("props/detail", { roleCode: "supplier" }, true);
  inventory.page.onLoad({ id: new URL(f.nav[0], "https://fixture.invalid").searchParams.get("id") });
  const opened = inventory.page.load();
  await c1297Reply(inventory, skuDetail);
  await c1297Reply(inventory, stockDetail);
  await opened;
  assert.equal(inventory.page.data.sku.id, qr.skuId);
  assert.equal(inventory.page.data.counts[0].value, stockDetail.body.data.totalQuantity);
  assert.equal(inventory.page.data.message, "");
});
test("C1297 late QR and product replies cannot replace a newer target", async () => {
  const e = c1297Evidence(),
    f = fixture("props/scan/index");
  f.page.onLoad({ scene: e.scenarios.ownQr.qrCode });
  const old = f.page.load();
  f.page.onLoad({ scene: e.scenarios.samples.scene });
  const latest = f.page.load();
  f.pending[1].reject(
    Object.assign(Error("暂未找到该记录"), { reason: "RESOURCE_NOT_FOUND" }),
  );
  await latest;
  f.pending[0].resolve(e.scenarios.ownQr);
  await tick();
  assert.equal(f.pending.length, 2, "stale resolve must not fetch the old SKU");
  await old;
  assert.equal(f.page.data.qr, null);
  const p = fixture("props/product");
  p.page.onLoad({ id: e.scenarios.samples.a });
  const first = p.page.load();
  p.page.onLoad({ id: e.scenarios.samples.b });
  const second = p.page.load();
  await tick(); // browse-cache starts its coalesced loader in a microtask
  p.pending[1].resolve(e.scenarios.bUnavailable);
  await second;
  p.pending[0].resolve(e.scenarios.aRestored);
  await first;
  assert.equal(p.page.data.item.skuId, e.scenarios.samples.b);
  assert.equal(p.page.data.availability.rentableStatus, "unavailable");
});

test("home inline filters stay on the current page, reflect selections immediately, and preserve rental query", async () => {
  const f = fixture("home/index"),
    p = f.page,
    requests = [];
  f.api.request = async (path) => {
    requests.push(path);
    return path === "public/props/options"
      ? {
          styles: ["retro", "modern", "classic", "other"].map((code) => ({
            code,
            label: code,
            enabled: true,
          })),
          types: [{ code: "furniture", label: "家具", enabled: true }],
        }
      : { items: [], total: "0" };
  };
  await p.load();
  p.toggleStyles();
  assert.equal(p.data.styleOpen, true);
  for (const code of ["retro", "modern", "classic"])
    p.style({ currentTarget: { dataset: { code } } });
  assert.equal(p.data.options.styles.filter((x) => x.selected).length, 3);
  p.style({ currentTarget: { dataset: { code: "other" } } });
  assert.equal(p.data.styleCodes.length, 3);
  p.toggleTypes();
  assert.equal(p.data.styleOpen, false);
  assert.equal(p.data.typeOpen, true);
  p.chooseType({ currentTarget: { dataset: { code: "furniture" } } });
  assert.equal(p.data.typeLabel, "家具");
  assert.equal(p.data.typeOpen, false);
  p.setData({ rental: true, startDate: "2026-11-05", endDate: "2026-11-07" });
  await p.load();
  const q = requests.at(-1);
  assert.match(q, /me\/props\/rentable/);
  assert.match(q, /typeCode=furniture/);
  assert.match(q, /styleCodes=retro/);
  assert.match(q, /startDate=2026-11-05/);
  assert.deepEqual(f.nav, []);
  p.reset();
  assert.equal(p.data.typeLabel, "全部类型");
  assert.ok(p.data.options.styles.every((x) => !x.selected));
  assert.equal(p.data.rental, true);
  await tick();
});
test("home guest search keeps login guard while public style browsing remains available", async () => {
  const f = fixture("home/index"),
    p = f.page,
    requests = [];
  f.session.clear();
  f.api.request = async (path) => {
    requests.push(path);
    return path === "public/props/options"
      ? { styles: [], types: [] }
      : { items: [], total: "0" };
  };
  p.setData({ keyword: "椅子" });
  await p.load();
  assert.equal(p.data.loginVisible, true);
  assert.equal(p.data.feedState, "blocked");
  assert.equal(f.nav.length, 0);
  assert.ok(!requests.some((x) => x.startsWith("me/")));
  p.closeLogin();
  assert.equal(p.data.keyword, "椅子");
  p.setData({ keyword: "", rental: false });
  await p.load();
  assert.equal(p.data.loginVisible, false);
  assert.ok(requests.some((x) => x.startsWith("public/props?")));
});
test("从道具进入审核管理时只按该 SKU 分页", async () => {
  const f = fixture("props/reviews");
  const requests = [];
  f.api.request = async path => {
    requests.push(path);
    return { items: [], total: "21" };
  };
  await f.page.onLoad({skuId: id});
  await f.page.load();
  f.page.next();
  await tick();
  assert.deepEqual(requests, [1, 2].map(page => "me/prop-reviews?skuId=" + id + "&page=" + page));
});

test("仓库和获取标签入口直接拉起微信扫码，取消留在原页", () => {
  const f = fixture("inventory/index");
  const warehouse = f.load("navigation/warehouse.js");
  let options;
  f.wx.scanCode = o => { options = o; };
  for (const entry of [warehouse, f.page]) {
    entry.scan();
    assert.equal(options.onlyFromCamera, false);
    options.fail({errMsg: "scanCode:fail cancel"});
    assert.deepEqual(f.nav, []);
    entry.scan();
    options.success({result: "invalid"});
    assert.deepEqual(f.nav, []);
    entry.scan();
    options.success({path: "pages/props/scan/index?scene=" + id});
    assert.deepEqual(f.nav.splice(0), ["/pages/props/scan/index?code=" + id]);
  }
  warehouse.scan();
  f.session.clear();
  options.success({result: id});
  assert.deepEqual(f.nav, []);
});

test("获取标签仅按页码读取全部实物", async () => {
  const f = fixture("inventory/index"), p = f.page, requests = [];
  f.api.request = async path => {
    requests.push(path);
    return path.includes("/instances?") ? { items: [], total: "21" } : { assetType: "A_ASSET", inventorySummary: {} };
  };
  p.setData({id:"sku"});
  await p.load();
  p.next(); await tick();
  p.prev(); await tick();
  assert.deepEqual(requests.filter(path => path.includes("/instances?")), [1,2,1].map(page => "me/factory-props/sku/instances?page=" + page));
});
test("库存流水筛选回显来源和类型", async () => {
  const m = fixture("inventory/movements");
  m.api.request = async () => ({ items: [], total: "0" });
  m.page.setData({ source: "arbitration", movement: "arbitration_decrease" });
  await m.page.load();
  assert.equal(m.page.data.sourceLabels[m.page.data.sourceIndex], "仲裁");
  assert.equal(m.page.data.typeLabels[m.page.data.movementIndex], "仲裁扣减");
  m.page.filter({
    currentTarget: { dataset: { key: "source" } },
    detail: { value: "1" },
  });
  assert.equal(m.page.data.sourceIndex, 1);
  assert.equal(m.page.data.source, "manual_adjustment");
  await tick();
});
test("UI sweep calendar validates actual dates and inclusive 120-day limit across leap/month boundaries", () => {
  const c = require("../miniprogram/services/rental-calendar");
  assert.equal(c.valid("2028-02-29"), true);
  assert.equal(c.valid("2027-02-29"), false);
  const window = c.startWindow(Date.parse("2027-12-30T01:00:00Z"));
  assert.equal(c.allowed("2028-01-01", "2028-04-29", window), true);
  assert.equal(c.allowed("2028-01-01", "2028-04-30", window), false);
  assert.equal(c.allowed("2028-01-02", "2028-01-01", window), false);
  assert.equal(c.allowed("2027-12-31", "2028-01-01", window), false);
  assert.equal(c.month("2028-12", 1), "2029-01");
  assert.equal(c.month("2028-01", -1), "2027-12");
  const cells = c.cells("2028-02", "2028-02-28", "2028-03-01", c.startWindow(Date.parse("2028-02-21T00:00:00Z")));
  assert.equal(cells.length, 42);
  assert.equal(cells.find((x) => x.date === "2028-02-29").inRange, true);
  assert.equal(cells.find((x) => x.date === "2028-03-01").disabled, true);
});
test("UI sweep calendar keeps browse filters, creates a checklist, and rejects arbitrary return routes", async () => {
  const f = fixture("props/dates"),
    p = f.page,
    c = f.load("services/rental-calendar.js"),
    today = c.earliestStart();
  p.onLoad({
    return:
      "/pages/props/browse?keyword=" +
      encodeURIComponent("木椅") +
      "&styles=" +
      encodeURIComponent('["retro","modern"]') +
      "&typeCode=furniture",
  });
  p.select({ currentTarget: { dataset: { date: today } } });
  p.select({ currentTarget: { dataset: { date: today } } });
  assert.equal(p.data.duration, 1);
  const creation = p.confirm();
  await tick();
  assert.equal(f.pending[0].args[0], "/api/me/checklists");
  f.pending[0].resolve({ resourceId: id });
  await creation;
  const url = f.nav.at(-1),
    q = new URLSearchParams(url.split("?")[1]);
  assert.equal(url.split("?")[0], "/pages/props/browse");
  assert.equal(q.get("keyword"), "木椅");
  assert.equal(q.get("styles"), '["retro","modern"]');
  assert.equal(q.get("startDate"), today);
  assert.equal(q.get("endDate"), today);
  p.reset();
  assert.equal(p.data.startDate, "");
  assert.equal(p.data.duration, 0);
  const count = f.nav.length;
  p.confirm();
  assert.equal(f.nav.length, count);
  assert.match(f.wx.lastToast.title, /请选择/);
  const bad = fixture("props/dates");
  bad.page.onLoad({ return: "https://example.invalid/steal" });
  assert.deepEqual(Object.keys(bad.page.data.filters), []);
});
test("UI sweep both catalogue producers retain conditions for the independent calendar", () => {
  for (const name of ["home/index", "props/browse"]) {
    const f = fixture(name);
    f.page.setData({
      keyword: "椅",
      styleCodes: ["retro"],
      typeCode: "furniture",
      rental: true,
      startDate: "2028-01-01",
      endDate: "2028-01-03",
    });
    f.page.dates();
    assert.match(f.nav[0], /^\/pages\/props\/dates\?return=/);
    const target = decodeURIComponent(f.nav[0].split("return=")[1]);
    assert.match(target, /typeCode=furniture/);
    assert.doesNotMatch(target, /startDate=|endDate=/);
    assert.equal(f.page.data.startDate, "2028-01-01");
  }
  const product = fixture("props/product");
  assert.equal(
    /bind(?:tap|change)="dates"/.test(fs.readFileSync(path.resolve(__dirname, "../miniprogram/pages/props/product.wxml"), "utf8")),
    false,
    "detail period is display-only per user confirmation",
  );
});

test("UI sweep form style dropdown reflects selection and preserves exclusive/disabled limits", () => {
  const f = fixture("props/form"),
    p = f.page;
  p.setData = function (values) {
    for (const [key, value] of Object.entries(values)) {
      const parts = key.split(".");
      let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts.at(-1)] = value;
    }
  };
  p.setData({
    options: {
      styles: ["retro", "modern", "classic", "extra", "special_asset"]
        .map((code) => ({ code, label: code, enabled: true }))
        .concat([{ code: "old", label: "旧风格", enabled: false }]),
      types: [{ code: "furniture", label: "家具", enabled: true }],
      fireResistance: [{ code: "yes", label: "是", enabled: true }],
    },
    fields: {
      ...p.data.fields,
      styleCodes: [],
      typeCode: "furniture",
      fireResistantCode: "yes",
    },
  });
  p.styles();
  p.toggleStyles();
  assert.equal(p.data.styleOpen, true);
  const select = (code) => p.style({ currentTarget: { dataset: { code } } });
  select("special_asset");
  assert.equal(p.data.selectedStyles[0].code, "special_asset");
  assert.equal(
    p.data.styleOptions.find((o) => o.code === "retro").choiceDisabled,
    true,
  );
  select("retro");
  assert.deepEqual(Array.from(p.data.fields.styleCodes), ["special_asset"]);
  select("special_asset");
  ["retro", "modern", "classic"].forEach(select);
  select("extra");
  assert.equal(p.data.selectedStyles.length, 3);
  assert.equal(
    p.data.styleOptions.find((o) => o.code === "extra").choiceDisabled,
    true,
  );
  p.setData({ "fields.styleCodes": ["old"] });
  p.styles();
  select("old");
  assert.equal(p.data.selectedStyles.length, 0);
  select("old");
  assert.equal(p.data.selectedStyles.length, 0);
  p.setData({ locked: true });
  p.toggleStyles();
  assert.equal(p.data.styleOpen, true);
  assert.equal(p.data.typeIndex, 0);
  assert.equal(p.data.fireIndex, 0);
});

test("calendar sequential selection replaces an earlier pickup, starts a fresh range, and retains 120-day bounds", () => {
  const f = fixture("props/dates"),
    p = f.page,
    c = f.load("services/rental-calendar.js");
  f.setNow(Date.parse("2026-11-30T02:59:00Z"));
  p.onLoad({});
  const month = "2026-12";
  const select = (date) => p.select({ currentTarget: { dataset: { date } } });
  select(month + "-10");
  assert.equal(p.data.startDate, month + "-10");
  assert.equal(p.data.endDate, "");
  select(month + "-05");
  assert.equal(p.data.startDate, month + "-05");
  assert.equal(p.data.endDate, "");
  select(month + "-12");
  assert.equal(p.data.duration, 8);
  assert.equal(p.data.endDate, month + "-12");
  select(month + "-08");
  assert.equal(p.data.startDate, month + "-08");
  assert.equal(p.data.endDate, "");
  select(month + "-08");
  assert.equal(p.data.duration, 1);
  p.reset();
  select(month + "-05");
  p.setData({ month: c.month(month, 5) });
  p.render();
  select(p.data.month + "-01");
  assert.equal(p.data.endDate, "");
  assert.match(f.wx.lastToast.title, /120/);
  const start = p.data.startDate;
  select("1900-01-01");
  assert.equal(p.data.startDate, start);
  assert.equal(p.endpoint, undefined);
});
test("catalogue guest dated deep links and expired login responses open the common sheet without a prompt card", async () => {
  for (const expired of [false, true]) {
    const f = fixture("props/browse"),
      p = f.page;
    const requests = [];
    if (!expired) f.session.clear();
    f.api.request = async (path) => {
      requests.push(path);
      if (path === "public/props/options") return { styles: [], types: [] };
      throw Object.assign(Error("登录失效"), { reason: "LOGIN_REQUIRED" });
    };
    p.onLoad({
      startDate: "2028-01-01",
      endDate: "2028-01-03",
      keyword: "木椅",
    });
    await p.load();
    assert.equal(p.data.loginVisible, true);
    assert.equal(p.data.feedState, "blocked");
    assert.equal(p.data.total, "0");
    assert.equal(p.data.message, "");
    assert.equal(f.nav.length, 0);
    p.closeLogin();
    assert.equal(p.data.startDate, "2028-01-01");
    assert.equal(p.data.keyword, "木椅");
    if (!expired) assert.equal(requests.length, 0);
  }
});

// 列表映射不携带详情专用头像，来源对象保持不变。
test("prop list card drops detail-only factory avatar", () => {
  const { api } = fixture();
  const raw = {
    skuId: id,
    propName: "木椅",
    styles: [{ label: "现代" }],
    type: { label: "道具" },
    dailyRentPriceFen: 100,
    factory: {
      id,
      name: "工厂",
      avatar: { url: "https://example.invalid/avatar" },
    },
  };
  for (const input of [
    raw,
    { prop: raw, availability: { rentableStatus: "rentable" } },
  ]) {
    const card = api.card(input);
    assert.deepEqual(Object.keys(card.factory).sort(), ["id", "name"]);
    assert.equal(card.factory.name, "工厂");
    assert.equal(card.price, "1.00");
  }
  assert.ok(raw.factory.avatar);
});

// 展示直接采用响应标签；不自行补查或用code替换已停用提示。
test("prop card preserves disabled labels and style order", () => {
  const { api } = fixture();
  const raw = {
    skuId: id,
    propName: "木椅",
    dailyRentPriceFen: 100,
    type: { code: "chair", label: "已停用", enabled: false, retained: true },
    styles: [
      { code: "retro", label: "已停用", enabled: false, retained: true },
      { code: "modern", label: "现代", enabled: true, retained: false },
    ],
    factory: { id, name: "工厂" },
  };
  for (const input of [
    raw,
    { prop: raw, availability: { rentableStatus: "rentable" } },
  ]) {
    const card = api.card(input);
    assert.equal(card.category, "已停用");
    assert.deepEqual(Array.from(card.styles), ["已停用", "现代"]);
    assert.equal(card.type.code, "chair");
    assert.deepEqual(
      Array.from(raw.styles, (item) => item.code),
      ["retro", "modern"],
    );
  }
});

// 浏览体验定向夹具：只统计真实发起的模块请求，时钟可控，无定时等待。
function browseCard(n) {
  return {
    skuId: "sku" + n,
    propName: "道具" + n,
    assetType: "B_CONSUMABLE",
    cover: null,
    type: { code: "chair", label: "椅子", enabled: true, retained: false },
    styles: [],
    dailyRentPriceFen: 100,
    depositAmountFen: 0,
    factory: { id: "factory", name: "工厂" },
  };
}
function browseFixture() {
  const f = fixture("props/browse"),
    calls = [];
  f.setNow(Date.parse("2026-11-05T12:00:00Z"));
  f.api.request = async (path) => {
    if (path === "public/props/options")
      return {
        types: [
          { code: "chair", label: "椅子", enabled: true },
          { code: "old", label: "旧", enabled: false },
        ],
        styles: [],
      };
    return new Promise((resolve, reject) =>
      calls.push({ path, resolve, reject }),
    );
  };
  f.page.onLoad({});
  return { ...f, calls };
}
function batch(first, count, total) {
  return {
    items: Array.from({ length: count }, (_, i) => browseCard(first + i)),
    total: String(total),
    page: 1,
    pageSize: 20,
  };
}
test("browse experience append coalesces bottom events retries same page and stops", async () => {
  const f = browseFixture(),
    p = f.page;
  const first = p.load();
  await tick();
  assert.match(f.calls[0].path, /page=1&pageSize=20/);
  f.calls[0].resolve(batch(0, 20, 45));
  await first;
  assert.equal(p.data.options.types.length, 1);
  const next = p.loadMore();
  p.onReachBottom();
  p.onReachBottom();
  await tick();
  assert.equal(f.calls.length, 2);
  f.calls[1].reject(Error("临时断网"));
  await next;
  assert.equal(p.data.items.length, 20);
  assert.equal(p.data.page, 1);
  assert.equal(p.data.moreState, "error");
  const retry = p.retryMore();
  await tick();
  assert.match(f.calls[2].path, /page=2/);
  f.calls[2].resolve(batch(19, 20, 45));
  await retry;
  assert.equal(p.data.items.length, 39);
  assert.equal(new Set(p.data.items.map((x) => x.id)).size, 39);
  const last = p.loadMore();
  await tick();
  f.calls[3].resolve(batch(39, 6, 45));
  await last;
  assert.equal(p.data.moreState, "end");
  await p.loadMore();
  assert.equal(f.calls.length, 4);
});
test("browse experience empty batch stops and changed filters discard old responses", async () => {
  const f = browseFixture(),
    p = f.page;
  const a = p.load();
  await tick();
  p.setData({ keyword: "新" });
  const b = p.load();
  await tick();
  f.calls[1].resolve(batch(80, 1, 5));
  await b;
  f.calls[0].resolve(batch(0, 20, 50));
  await a;
  assert.equal(p.data.items[0].id, "sku80");
  const next = p.loadMore();
  await tick();
  f.calls[2].resolve(batch(0, 0, 5));
  await next;
  assert.equal(p.data.items.length, 1);
  assert.equal(p.data.moreState, "end");
});
test("browse experience restores batches position and atomically replaces expired pages", async () => {
  const f = browseFixture(),
    p = f.page;
  const other = { ...p, data: structuredClone(p.data) };
  let run = p.load();
  await tick();
  f.calls[0].resolve(batch(0, 20, 80));
  await run;
  run = p.loadMore();
  await tick();
  f.calls[1].resolve(batch(20, 20, 80));
  await run;
  p.onPageScroll({ scrollTop: 880 });
  p.onHide();
  let top;
  f.wx.pageScrollTo = (v) => (top = v.scrollTop);
  const mountedCard = p.data.items[0];
  await p.onShow();
  assert.equal(p.data.items[0], mountedCard);
  assert.equal(top, undefined); // 同一页保留原生滚动位置。
  await other.load();
  assert.equal(f.calls.length, 2);
  assert.equal(other.data.items.length, 40);
  assert.equal(top, 880); // 新页面仍须重建缓存中的两页并还原位置。
  f.setNow(Date.parse("2026-11-05T12:03:00Z"));
  run = p.onShow();
  await tick();
  assert.equal(p.data.items.length, 40);
  f.calls[2].reject(Error("断网"));
  await run;
  assert.equal(p.data.items.length, 40);
  run = p.retryMore();
  await tick();
  f.calls[3].resolve(batch(90, 3, 3));
  await run;
  assert.equal(p.data.items.length, 3);
  assert.equal(p.data.page, 1);
  assert.equal(p.data.items[0].id, "sku90");
});
test("browse experience memory merges requests isolates sessions and evicts old entries", async () => {
  const f = fixture(),
    c = f.load("services/browse-cache.js");
  let resolve,
    count = 0;
  const k = c.key("list-page", { page: 1 });
  const a = c.read(k, () => {
    count++;
    return new Promise((r) => (resolve = r));
  });
  const b = c.read(k, () => {
    throw Error("重复请求");
  });
  await tick();
  assert.equal(count, 1);
  f.session.replace("owner-B");
  resolve({ items: [] });
  await assert.rejects(a, /会话/);
  await assert.rejects(b, /会话/);
  assert.equal(c.peek(k), null);
  for (let i = 0; i < 121; i++) c.put(c.key("test", i), { i });
  assert.equal(c.peek(c.key("test", 0)), null);
  const current = c.key("test", 120);
  assert.equal(c.peek(current).value.i, 120);
  f.session.clear();
  assert.equal(c.peek(current), null);
});
test("browse experience detail differences invalidate all batches and denied responses clear", async () => {
  const f = browseFixture(),
    p = f.page,
    store = f.load("services/prop-browser-store.js");
  let run = p.load();
  await tick();
  f.calls[0].resolve(batch(0, 2, 2));
  await run;
  p.open({ detail: { id: "sku0" } });
  const detail = {
    prop: { ...browseCard(0), dailyRentPriceFen: 200 },
    details: { images: [] },
    availability: null,
  };
  run = store.detail("sku0", { startDate: "", endDate: "" });
  await tick();
  f.calls[1].resolve(detail);
  assert.equal((await run).changed, true);
  assert.equal(store.cache.peek(store.stateKey(p.activeQuery)).fresh, false);
  run = p.onShow();
  await tick();
  assert.equal(f.calls.length, 3);
  f.calls[2].reject({
    status: 403,
    reason: "PERMISSION_DENIED",
    message: "无权限",
  });
  await run;
  assert.equal(p.data.items.length, 0);
  assert.equal(p.data.feedState, "blocked");
});
test("browse experience valid image URLs survive refresh and expired SKU renewals merge", async () => {
  const f = fixture(),
    images = f.load("services/public-images.js");
  f.setNow(Date.parse("2026-11-05T12:00:00Z"));
  const a = {
    cacheKey: "a".repeat(64),
    url: "old",
    expiresAt: "2026-11-05T20:30:00.000",
  };
  assert.equal(images.accept(a).url, "old");
  assert.equal(images.accept({ ...a, url: "unnecessary" }).url, "old");
  f.setNow(Date.parse("2026-11-05T12:30:00Z"));
  let count = 0,
    resolve;
  const renew = () => {
    count++;
    return new Promise((r) => (resolve = r));
  };
  const b = { cacheKey: "b".repeat(64), url: "oldB", expiresAt: a.expiresAt };
  const one = images.ensure(a, "sku", renew),
    two = images.ensure(b, "sku", renew);
  await tick();
  assert.equal(count, 1);
  resolve({
    prop: { cover: { ...a, url: "new", expiresAt: "2026-11-05T21:00:00.000" } },
    details: {
      images: [{ ...b, url: "newB", expiresAt: "2026-11-05T21:00:00.000" }],
    },
  });
  assert.equal((await one).url, "new");
  assert.equal((await two).url, "newB");
});
test("browse experience lazy image waits for viewport and permits one failure renewal", async () => {
  const f = fixture();
  f.setNow(Date.parse("2026-11-05T12:00:00Z"));
  f.load("components/public-prop-image/index.js");
  const definition = f.component;
  const image = {
    cacheKey: "a".repeat(64),
    url: "first",
    expiresAt: "2026-11-05T20:30:00.000",
  };
  let visible,
    renewals = 0;
  const store = f.load("services/prop-browser-store.js");
  store.detail = async () => {
    renewals++;
    return {
      prop: { cover: { ...image, url: "retry" } },
      details: { images: [] },
    };
  };
  const c = {
    ...definition.methods,
    data: {
      ...definition.data,
      image,
      skuId: "sku",
      lazy: true,
      active: false,
    },
    setData(v, done) {
      Object.assign(this.data, v);
      done?.();
    },
    triggerEvent() {},
    createIntersectionObserver() {
      return {
        relativeToViewport() {
          return this;
        },
        observe(_s, fn) {
          visible = fn;
        },
        disconnect() {},
      };
    },
  };
  definition.lifetimes.attached.call(c);
  definition.lifetimes.ready.call(c);
  await tick();
  assert.equal(c.data.src, "");
  visible({ intersectionRatio: 1 });
  await tick();
  assert.equal(c.data.src, "https://fixture.invalid/api/public/props/sku/images/" + image.cacheKey);
  assert.equal(renewals, 0);
  await c.failed();
  assert.equal(c.data.src, "https://fixture.invalid/api/public/props/sku/images/" + image.cacheKey);
  assert.equal(renewals, 1);
  await c.failed();
  assert.equal(renewals, 1);
  assert.equal(c.data.src, "");
  definition.lifetimes.detached.call(c);
});

test("browse experience writes invalidate browsing but QR reads preserve it", async () => {
  const f = fixture(),
    cache = f.load("services/browse-cache.js"),
    key = cache.key("list-state", { root: "public/props" });
  cache.put(key, { items: [] });
  let run = f.api.request("me/prop-qr/resolve", "POST", {});
  await tick();
  f.pending[0].resolve({});
  await run;
  assert.equal(cache.peek(key).fresh, true);
  run = f.api.request("me/factory-props/id/edit-options", "POST", {});
  await tick();
  f.pending[1].resolve({});
  await run;
  assert.equal(cache.peek(key).fresh, false);
  cache.put(key, { items: [] });
  run = f.api.request("me/prop-instances/id/repair-complete", "POST", {});
  await tick();
  f.pending[2].reject(
    Object.assign(Error("结果未确认"), { outcome: "unknown" }),
  );
  await assert.rejects(run);
  assert.equal(cache.peek(key).fresh, false);
});
test("browse experience carousel loads only activated slides and keeps displayed image", async () => {
  const f = fixture();
  f.setNow(Date.parse("2026-11-05T12:00:00Z"));
  f.load("components/public-prop-image/index.js");
  const definition = f.component;
  const image = {
    cacheKey: "a".repeat(64),
    url: "first",
    expiresAt: "2026-11-05T20:30:00.000+08:00",
  };
  const c = {
    ...definition.methods,
    data: {
      ...definition.data,
      image,
      skuId: "sku",
      lazy: false,
      active: false,
    },
    setData(v, done) {
      Object.assign(this.data, v);
      done?.();
    },
    triggerEvent() {},
  };
  definition.lifetimes.attached.call(c);
  definition.lifetimes.ready.call(c);
  await tick();
  assert.equal(c.data.src, "");
  c.data.active = true;
  await c.sync();
  assert.equal(c.data.src, "https://fixture.invalid/api/public/props/sku/images/" + image.cacheKey);
  f.setNow(Date.parse("2026-11-05T12:31:00Z"));
  c.data.active = false;
  await c.sync();
  assert.equal(c.data.src, "https://fixture.invalid/api/public/props/sku/images/" + image.cacheKey);
  f.session.replace("new-owner");
  assert.equal(c.data.src, "");
  definition.lifetimes.detached.call(c);
});

test("browse experience changed totals rebuild instead of mixing batches", async () => {
  const f = browseFixture(),
    p = f.page;
  let run = p.load();
  await tick();
  f.calls[0].resolve(batch(0, 20, 60));
  await run;
  run = p.loadMore();
  await tick();
  f.calls[1].resolve(batch(20, 20, 59));
  await tick();
  assert.match(f.calls[2].path, /page=1/);
  assert.equal(p.data.items.length, 20);
  f.calls[2].resolve(batch(1, 20, 59));
  await run;
  assert.equal(p.data.items.length, 20);
  assert.equal(p.data.page, 1);
  assert.equal(p.data.items[0].id, "sku1");
});

test("租期列表只更新发生变化的已加入数量，不替换图片或卡片", () => {
  const p = browseFixture().page;
  p.data.items = [{id:"one", joinedQuantity:2}, {id:"two", joinedQuantity:0}];
  p.data.currentChecklist = {id:"list"};
  p.data.joinedQuantities = {one:3};
  const writes = [];
  p.setData = patch => writes.push({...patch});
  p.updateJoinedQuantities();
  assert.deepEqual(writes, [{"items[0].joinedQuantity":3}]);
});

test("扫码轮询保留同一张标签，换码或失去访问权立即清除原资料", async () => {
  const f = fixture("props/scan/index"), p = f.page;
  p.setData({ id });
  const load = p.load();
  f.pending.shift().resolve({ id, skuId: id, targetType: "SN", status: "bound" });
  await tick();
  f.pending.shift().resolve({ id, fields: { propName: "样本道具" } });
  await load;
  const reread = p.load();
  assert.equal(p.data.sku.fields.propName, "样本道具");
  f.pending.shift().reject(Object.assign(new Error("无权查看"), { status: 403 }));
  await reread;
  assert.equal(p.data.qr, null);
  assert.equal(p.data.sku, null);
  p.setData({ id: "other-label", sku: { id }, qr: { id } });
  const changed = p.load();
  assert.equal(p.data.sku, null);
  f.pending.shift().reject(new Error("无记录"));
  await changed;
});

test("首次上架还未建库存时不查询账本，后续审核不遮住已形成的库存", async () => {
  const f = fixture("props/detail"), calls = [];
  const sku = { id:"SKU", assetType: "B_CONSUMABLE", inventorySummary: null, pendingApplicationId: "audit" };
  f.api.request = async path => {
    calls.push(path);
    return path.endsWith("/stock") ? { totalQuantity: 0 } : sku;
  };
  f.page.setData({ id: "SKU", stock: { totalQuantity: 4 } });
  await f.page.load();
  assert.deepEqual(calls, ["me/factory-props/SKU"]);
  assert.equal(f.page.data.counts.length, 0);
  sku.inventorySummary = { totalQuantity: 0, availableQuantity: 0 };
  await f.page.load();
  assert.equal(calls.at(-1), "me/factory-props/SKU/stock");
  assert.equal(f.page.data.counts[0].value, 0);
});

test("COS outage leaves listing editable and preserves the trace and draft", async () => {
  const f = fixture("props/form"), page = f.page;
  Object.assign(page.data, { packaging: "1", rent: "1", deposit: "0" });
  Object.assign(page.data.fields, {
    propName: "灯", typeCode: "light", fireResistantCode: "no", sizeDesc: "小",
    materialDesc: "布", transportSuggestion: "轻放", lengthCm: "1", widthCm: "1",
    heightCm: "1", weightKg: "1", styleCodes: ["test"], images: [{ localPath: "/tmp/test.jpg" }],
  });
  const saving = page.submit();
  await tick();
  assert.equal(page.data.submitting, true);
  page.value({currentTarget: {dataset: {key: "rent"}}, detail: {value: "999"}});
  await page.submit();
  assert.equal(page.data.rent, "1");
  assert.equal(f.uploads.length, 1);
  f.uploads[0].success({statusCode: 503, data: JSON.stringify({
    code: "SERVICE_UNAVAILABLE", reasonCode: "OBJECT_STORAGE_UNAVAILABLE", traceId: "sample-trace",
  })});
  await saving;
  assert.equal(page.data.submitting, false);
  assert.equal(page.data.busy, false);
  assert.equal(page.data.loadError, "");
  assert.match(f.wx.lastToast.title, /文件存储暂不可用.*sample-t/);
  assert.equal(f.wx.lastToast.mask, false);
  assert.equal(page.data.fields.images.length, 1);
  assert.equal(f.pending.length, 0);
});

test("a failed image stops new uploads and waits for the second active image", async () => {
  const f = fixture();
  let finished = false;
  const work = f.api.materialize(["one", "two", "three"].map(localPath => ({localPath})));
  const check = assert.rejects(work, /文件存储暂不可用/).then(() => { finished = true; });
  await tick();
  assert.equal(f.uploads.length, 2);
  f.uploads[0].success({statusCode: 503, data: JSON.stringify({reasonCode:"OBJECT_STORAGE_UNAVAILABLE"})});
  await tick();
  assert.equal(finished, false);
  f.uploads[1].success({statusCode: 200, data: JSON.stringify({code:"OK", data:{uploadId:id}})});
  await check;
  assert.equal(f.uploads.length, 2);
});

test("oversize prop JPEG is resized in its displayed orientation and only the result is uploaded", async () => {
  const f = fixture();
  f.wx.getFileSystemManager = () => ({
    stat: (o) => o.success({ stats: { size: o.path === "raw.jpg" ? 8_552_100 : 1_116_990 } }),
  });
  f.wx.getImageInfo = (o) => o.success(o.src === "raw.jpg"
    ? { width: 5712, height: 4284, orientation: "right" }
    : { width: 1536, height: 2048, orientation: "up" });
  f.wx.compressImage = (o) => {
    assert.equal(o.compressedHeight, 2048);
    assert.equal(o.compressedWidth, undefined);
    o.success({ tempFilePath: "compressed.jpg" });
  };
  const work = f.api.materialize([{ localPath: "raw.jpg" }]);
  await tick();
  assert.equal(f.uploads.length, 1);
  assert.equal(f.uploads[0].filePath, "compressed.jpg");
  f.uploads[0].success({ statusCode: 200, data: JSON.stringify({ code: "OK", data: { uploadId: id } }) });
  assert.equal((await work)[0].uploadId, id);
});

test("all image sizes use the chosen file: below one MiB unchanged, at and above it compressed", async () => {
  for (const bytes of [1_048_575, 1_048_576, 1_048_577]) {
    const f = fixture();
    f.wx.getFileSystemManager = () => ({
      stat: o => o.success({ stats: { size: o.path === "small.jpg" ? 65536 : bytes } }),
    });
    let calls = 0;
    f.wx.compressImage = o => { calls++; o.success({ tempFilePath: "small.jpg" }); };
    const work = f.api.materialize([{ localPath: "chosen.jpg" }]);
    await tick();
    assert.equal(calls, bytes < 1_048_576 ? 0 : 1);
    assert.equal(f.uploads[0].filePath, calls ? "small.jpg" : "chosen.jpg");
    f.uploads[0].success({ statusCode: 200, data: JSON.stringify({ code: "OK", data: { uploadId: id } }) });
    await work;
  }
});

test("a prop photo still over the limit after compression never reaches upload", async () => {
  const f = fixture();
  f.wx.getFileSystemManager = () => ({
    stat: (o) => o.success({ stats: { size: 8_000_000 } }),
  });
  const sizes = [];
  f.wx.compressImage = (o) => { sizes.push(o.compressedWidth); o.success({ tempFilePath: "large.png" }); };
  await assert.rejects(f.api.materialize([{ localPath: "large.png" }]), /第 1 张图片.*5 MiB/);
  assert.deepEqual(sizes, [1200, 1200]);
  assert.equal(f.uploads.length, 0);
});

test("the prop upload reports the photo limits and keeps the trace on HTTP 413", async () => {
  const f = fixture();
  const work = f.api.materialize([{ localPath: "boundary.jpg" }]);
  const result = assert.rejects(work, /5 MiB.*2000 万像素.*photo-tr/);
  await tick();
  f.uploads[0].success({
    statusCode: 413,
    data: JSON.stringify({ reasonCode: "PAYLOAD_TOO_LARGE", traceId: "photo-trace" }),
  });
  await result;
});

test("标签相机和相册共用扫码结果解析，取消保持原页", () => {
  const f = fixture("props/scan/index");
  let scan;
  f.wx.scanCode = options => { scan = options; };
  f.page.load = () => {};
  f.page.scan();
  assert.equal(scan.onlyFromCamera, false);
  scan.fail({errMsg:"scanCode:fail cancel"});
  assert.equal(f.page.data.message, "");
  scan.success({path:"pages/props/scan/index?scene=" + id});
  assert.equal(f.page.data.code, id);
});

test("打印资料依照绑定层级区分实物和 SKU", () => {
  const { labelData } = require("../miniprogram/services/prop-label");
  const sku = {fields:{propName:"折椅",materialDesc:"木",remark:""}, factoryName:"测试工厂"};
  const qr = {targetType:"SN", skuCode:"SKU-001", snCode:"SN-001"};
  assert.equal(labelData(qr, sku).serial, "SN-001");
  assert.equal(labelData({...qr, snCode:null}, sku), null);
  assert.deepEqual(labelData({...qr, targetType:"SKU"}, sku), {
    name:"折椅", material:"木", code:"SKU-001", serial:"", factory:"测试工厂", remark:"",
  });
});

test("取货第 14 天、归还第 120 天可选，越界置灰且点击显示原因并保留选择", () => {
  const f = fixture("props/dates"), p = f.page;
  f.setNow(Date.parse("2026-11-25T03:18:00Z"));
  p.onLoad({});
  function cell(date) {
    p.setData({month:date.slice(0,7)});
    p.render();
    return p.data.cells.find(c => c.date === date);
  }
  const tap = date => p.select({currentTarget:{dataset:{date}}});
  assert.equal(cell("2026-11-27").disabled, true);
  assert.equal(cell("2026-11-28").disabled, false);
  assert.equal(cell("2026-12-10").disabled, true);
  tap("2026-12-10");
  assert.match(f.wx.lastToast.title, /3–14/);
  assert.equal(p.data.startDate, "");
  assert.equal(cell("2026-12-09").disabled, false);
  tap("2026-12-09");
  assert.equal(cell("2026-12-10").disabled, false);
  assert.equal(cell("2027-04-08").disabled, true);
  tap("2027-04-08");
  assert.match(f.wx.lastToast.title, /120/);
  assert.equal(p.data.endDate, "");
  assert.equal(cell("2027-04-07").disabled, false);
  tap("2027-04-07");
  assert.equal(p.data.duration, 120);
  assert.equal(p.data.startDate, "2026-12-09");
});

test("SKU 标签只使用本 SKU 的绑定，A、B 列表不再进入打印子页", async () => {
  const {f,row,qr}=labelRow();
  row.data.sku.assetType="B_CONSUMABLE";row.data.targetId=row.data.sku.id;
  let layout;
  f.load("services/prop-label.js").render=async (_row,_file,data)=>{layout=data;return "B.png"};
  await row.print();assert.equal(f.download,undefined);
  Object.assign(qr,{targetType:"SKU",targetId:"sku",snCode:null});
  const generating=row.print();await tick();f.download.success({statusCode:200,tempFilePath:"raw.png"});await generating;
  assert.equal(layout.serial,"");assert.equal(row.data.file,"B.png");assert.deepEqual(f.nav,[]);
  const markup=fs.readFileSync(path.join(__dirname,"../miniprogram/pages/inventory/index.wxml"),"utf8");
  assert.match(markup,/查看实物状态记录（删去）/);
  assert.doesNotMatch(markup,/bindtap="qr"/);
});
