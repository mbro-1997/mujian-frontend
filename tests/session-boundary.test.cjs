const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "../miniprogram");
function fixture(pageName = "mine") {
  let token = "A",
    now = 0,
    options;
  const app = { globalData: { context: null } },
    pending = [],
    modules = new Map();
  const wx = {
    getStorageSync: () => token,
    setStorageSync: (_, value) => {
      token = value;
    },
    removeStorageSync: () => {
      token = "";
    },
    request: (value) => {
      if(value.url.endsWith('/account-summary')) queueMicrotask(()=>value.success({statusCode:200,data:{code:'OK',message:'成功',traceId:"00000000000040008000000000000001",data:{phoneMasked:'+8613****0000',wechatBound:true,roleCode:'demander',userStatus:'active'}}}));
      else pending.push(value);
    },
  };
  function load(file) {
    file = path.resolve(root, file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    vm.runInNewContext(
      fs.readFileSync(file, "utf8"),
      {
        module,
        wx,
        getApp: () => app,
        Date: { now: () => now },
        Page: (value) => {
          options = value;
        },
        require(name) {
          if (name.endsWith("/config/environment"))
            return { baseUrl: "https://fixture.invalid" };
          return load(path.resolve(path.dirname(file), name + ".js"));
        },
      },
      { filename: file }
    );
    return module.exports;
  }
  const session = load("session/storage.js"),
    account = load("services/account.js"),
    activity = load("session/activity.js");
  load(`pages/${pageName}/index.js`);
  const page = {
    ...options,
    data: { ...options.data },
    setData(patch) {
      Object.assign(this.data, patch);
    },
    getTabBar() {
      return { setData() {} };
    },
  };
  const data = (nickname) => ({
    userId: "123456789abc4def8123456789abcdef",
    nickname,
    userStatus: "active",
    registrationStage: "demander_bound",
    roleCode: "demander",
    accessMode: "normal",
    nextAction: "ENTER_DEMANDER_HOME",
  });
  return {
    app,
    pending,
    session,
    account,
    activity,
    page,
    token: () => token,
    advance: (ms) => {
      now += ms;
    },
    ok(request, nickname = "A") {
      request.success({
        statusCode: 200,
        data: {
          code: "OK",
          message: "成功",
          traceId: "00000000000040008000000000000001",
          data: request.method === "POST" ? null : data(nickname),
        },
      });
    },
    error(request, statusCode, reasonCode) {
      request.success({
        statusCode,
        data: { code: statusCode === 401 ? "UNAUTHORIZED" : statusCode === 403 ? "FORBIDDEN" : "SERVICE_UNAVAILABLE", message: "测试", data: null, reasonCode, traceId: "00000000000040008000000000000001" },
      });
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("F01: delayed context after logout cannot restore credential, cache, or production page", async () => {
  const f = fixture();
  const load = f.page.load();
  const old = f.pending[0];
  const logout = f.account.logout();
  f.ok(f.pending[1]);
  await logout;
  assert.equal(f.page.data.context, null);
  assert.equal(f.page.data.busy, false);
  f.ok(old);
  await load;
  assert.equal(f.token(), "");
  assert.equal(f.app.globalData.context, null);
  assert.equal(f.page.data.context, null);
  assert.equal(f.page.data.message, "已退出登录");
});
for (const late of ["success", "401", "network"])
  test(`session A late ${late} cannot mutate B cache, credential, page or message`, async () => {
    const f = fixture();
    const a = f.page.load();
    const old = f.pending[0];
    f.session.replace("B");
    const b = f.page.load();
    f.ok(f.pending[1], "B");
    await b;
    if (late === "success") f.ok(old);
    else if (late === "401") f.error(old, 401, "LOGIN_REQUIRED");
    else old.fail();
    await a;
    assert.equal(f.token(), "B");
    assert.equal(f.app.globalData.context.nickname, "B");
    assert.equal(f.page.data.context.nickname, "B");
    assert.equal(f.page.data.message, "");
  });
test("same credential reissued after clear still invalidates the previous generation", async () => {
  const f = fixture();
  const request = f.account.context();
  const rejected = assert.rejects(request, { name: "StaleSessionError" });
  f.session.clear();
  f.session.replace("A");
  f.ok(f.pending[0]);
  await rejected;
  assert.equal(f.app.globalData.context, null);
  assert.equal(f.token(), "A");
});
test("current 200 displays; current 401 clears cache and page with login prompt", async () => {
  const f = fixture();
  let load = f.page.load();
  f.ok(f.pending[0]);
  await load;
  assert.equal(f.page.data.context.nickname, "A");
  load = f.page.load();
  f.error(f.pending[1], 401, "LOGIN_REQUIRED");
  await load;
  assert.equal(f.token(), "");
  assert.equal(f.app.globalData.context, null);
  assert.equal(f.page.data.context, null);
  assert.match(f.page.data.message, /登录已失效/);
});
test("current 503 and unknown network failure preserve credential and distinct messages", async () => {
  const f = fixture();
  let load = f.page.load();
  f.error(f.pending[0], 503, "DATABASE_UNAVAILABLE");
  await load;
  assert.equal(f.token(), "A");
  assert.match(f.page.data.message, /数据服务暂不可用/);
  load = f.page.load();
  f.pending[1].fail();
  await load;
  assert.equal(f.token(), "A");
  assert.match(f.page.data.message, /网络中断或超时/);
});
test("late logout from A never clears B or resets B page", async () => {
  const f = fixture();
  const a = f.account.logout();
  const rejected = assert.rejects(a, { name: "StaleSessionError" });
  f.session.replace("B");
  const b = f.page.load();
  f.ok(f.pending[1], "B");
  await b;
  f.ok(f.pending[0]);
  await rejected;
  assert.equal(f.token(), "B");
  assert.equal(f.page.data.context.nickname, "B");
});
test("new generation starts activity immediately; old finally cannot release its pending request or budget", async () => {
  const f = fixture();
  const a = f.activity.show();
  const first = f.pending[0];
  f.session.replace("B");
  const b = f.activity.report();
  assert.equal(f.pending.length, 2);
  f.ok(first);
  await a;
  f.advance(60000);
  f.activity.report();
  assert.equal(f.pending.length, 2);
  f.ok(f.pending[1], "B");
  await b;
  const c = f.activity.report();
  assert.equal(f.pending.length, 3);
  f.ok(f.pending[2], "B");
  await c;
});
test("background remains silent; active page calls merge for 60s; unloaded pages no longer receive resets", async () => {
  const f = fixture();
  f.page.onShow();
  f.ok(f.pending[0]);
  await flush();
  const first = f.activity.show();
  f.ok(f.pending[1]);
  await first;
  f.activity.interaction({ type: "tap" });
  assert.equal(f.pending.length, 2);
  f.activity.hide();
  f.advance(60001);
  f.activity.report();
  assert.equal(f.pending.length, 2);
  const resumed = f.activity.show();
  f.ok(f.pending[2]);
  await resumed;
  f.page.onUnload();
  f.session.clear();
  assert.equal(f.page.data.context.nickname, "A");
});

for (const page of ["mine", "factory", "account"])
  for (const kind of ["200", "401", "403", "503", "network"])
    test(`Mini ${page} late ${kind} does not write B page/cache/notice`, async () => {
      const f = fixture(page);
      const old = f.page.load();
      const request = f.pending[0];
      f.session.replace("B");
      const current = f.page.load();
      f.ok(f.pending[1], "B");
      await current;
      const expected = JSON.stringify(f.page.data);
      const cache = f.app.globalData.context;
      if (kind === "200") f.ok(request);
      else if (kind === "network") request.fail();
      else
        f.error(
          request,
          +kind,
          kind === "401"
            ? "LOGIN_REQUIRED"
            : kind === "403"
            ? "ACCOUNT_ACTION_RESTRICTED"
            : "DATABASE_UNAVAILABLE"
        );
      await old;
      assert.equal(f.token(), "B");
      assert.equal(f.app.globalData.context, cache);
      assert.equal(JSON.stringify(f.page.data), expected);
    });
for (const page of ["mine", "factory"])
  for (const failure of ["503", "network"])
    test(`Mini ${page} logout ${failure} clears locally and preserves unknown-result prompt`, async () => {
      const f = fixture(page);
      let load = f.page.load();
      f.ok(f.pending[0]);
      await load;
      const logout = f.page.logout();
      if (failure === "503")
        f.error(f.pending[1], 503, "SESSION_STORE_UNAVAILABLE");
      else f.pending[1].fail();
      await logout;
      assert.equal(f.token(), "");
      assert.equal(f.page.data.context, null);
      assert.match(f.page.data.message, /服务器注销尚未确认/);
      assert.equal(f.page.data.busy, false);
    });
test("Mini same-session simultaneous context queries remain valid in either return order", async () => {
  const f = fixture();
  const a = f.account.context(),
    b = f.account.context();
  f.ok(f.pending[1], "second");
  assert.equal((await b).nickname, "second");
  f.ok(f.pending[0], "first");
  assert.equal((await a).nickname, "first");
  assert.equal(f.token(), "A");
});
