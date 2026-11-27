const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(
  path.join(__dirname, "../miniprogram/config/environment.js"),
  "utf8",
);
function load(version, mode) {
  const module = { exports: {} };
  let reads = 0;
  vm.runInNewContext(source, {
    module,
    wx: {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: version } }),
    },
    require: () => {
      reads++;
      return {
        mode,
        localBaseUrl: "http://127.0.0.1:18080",
        lanBaseUrl: "http://192.168.1.6:18080",
      };
    },
  });
  return { value: module.exports, reads };
}
test("开发版可以集中切换模拟器与局域网入口", () => {
  assert.equal(
    load("develop", "local").value.baseUrl,
    "http://127.0.0.1:18080",
  );
  assert.equal(
    load("develop", "lan").value.baseUrl,
    "http://192.168.1.6:18080",
  );
});
for (const version of ["trial", "release"]) {
  test(version + " 不读取或启用局域网开发地址", () => {
    const result = load(version, "lan");
    assert.equal(result.reads, 0);
    assert.equal(result.value.baseUrl, "");
    assert.equal(result.value.development, false);
  });
}

function debugRuntime({ version = "develop", mode = "lan", platform = "ios" } = {}) {
  const config = {...require("../miniprogram/config/development"), mode};
  const storage = new Map(), calls = [], sessions = [];
  const wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: version } }),
    getDeviceInfo: () => ({ platform }),
    login: o => o.success({ code: "one-time-code-" + ++logins }),
    getStorageSync: k => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: k => storage.delete(k),
    reLaunch: o => o.success(),
    showActionSheet: o => o.success({ tapIndex: 0 }),
  };
  const envModule = { exports: {} };
  vm.runInNewContext(source, { module: envModule, wx, require: () => config });
  const env = envModule.exports, service = { exports: {} };
  const app = { globalData: {} };
  function loadModule(file, imports = {}) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram", file), "utf8"), {
      module, wx, getApp: () => app, require: name => imports[name],
    });
    return module.exports;
  }
  const session = loadModule("session/storage.js");
  const http = { request: async (url, method) => { calls.push({ url, method, token: session.token() }); } };
  const account = loadModule("services/account.js", { "./http": http, "../session/storage": session });
  session.subscribe(() => { if (session.token()) sessions.push(session.token()); });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/services/local-debug-accounts.js"), "utf8"), {
    module: service, wx, require: name => ({ "../config/environment": env, "../session/storage": session, "./account": account })[name],
  });
  let logins = 0;
  wx.request = o => {
    calls.push({ url: o.url, auth: o.header.Authorization });
    if (o.method === "POST") o.success({ statusCode: 200, data: { userId: "user", token: o.url.split("/").pop() } });
    else o.success({ statusCode: 200, data: { data: { userId: "user", roleCode: o.header.Authorization.slice(7).replace(/2$/, ""), userStatus: "active", accessMode: "normal" } } });
  };
  return { env, wx, config, storage, calls, sessions, session, http, logins: () => logins, service: service.exports };
}

test("首次进入手机预览及清空存储后均可用微信静默登录切换固定角色", async () => {
  for (const platform of ["ios", "android"]) {
    const r = debugRuntime({ platform });
    for (const role of ["demander", "supplier"]) {
      r.storage.clear();
      await r.service.switchAccount(role);
    }
    assert.deepEqual(r.sessions, ["demander", "supplier"]);
    assert.deepEqual(r.calls.filter((_, i) => i % 2 === 0), [
      {url: r.config.debugLanUrl + "/sessions/demander", auth: "WeChat one-time-code-1"},
      {url: r.config.debugLanUrl + "/sessions/supplier", auth: "WeChat one-time-code-2"},
    ]);
    assert.deepEqual([...r.storage.keys()], ["mj.session"]);
  }
});

test("手机微信核对失败或角色不一致保留原会话，阻止不可用环境发起登录", async () => {
  for (const options of [{version:"trial"}, {version:"release"}, {mode:"local"}]) {
    const r = debugRuntime(options);
    await assert.rejects(r.service.switchAccount("supplier"));
    assert.equal(r.logins(), 0);
  }
  for (const cause of ["weixin", "denied", "mismatch"]) {
    const r = debugRuntime();
    if (cause === "weixin") r.wx.login = o => o.fail();
    r.wx.request = o => o.success({ statusCode: cause === "denied" ? 403 : 200,
      data: o.method === "POST" ? {userId:"buyer", token:"test"}
        : {data:{userId:"different", roleCode:"demander", userStatus:"active", accessMode:"normal"}} });
    await assert.rejects(r.service.switchAccount("demander"));
    assert.equal(r.sessions.length, 0);
  }
});

test("模拟器沿用本机凭据，无须调用微信登录", async () => {
  const r = debugRuntime({ platform: "devtools" });
  assert.equal(r.env.baseUrl, r.config.localBaseUrl);
  r.storage.set("mj.localDebugPair", {origin:r.env.baseUrl, secret:"b".repeat(64)});
  await r.service.switchAccount("demander");
  assert.equal(r.logins(), 0);
  assert.equal(r.calls[0].url, r.config.debugLocalUrl + "/sessions/demander");
});

function buttons(runtime) {
  let definition;
  const file = path.join(__dirname, "../miniprogram/components/local-debug-accounts/index.js");
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    wx: runtime.wx, require: () => runtime.service, Component: options => { definition = options; },
  });
  const instance = { data: { ...definition.data }, events: [],
    setData(values) { Object.assign(this.data, values); },
    triggerEvent(event) { this.events.push(event); },
  };
  definition.lifetimes.attached.call(instance);
  return {
    instance,
    tap: role => definition.methods.choose.call(instance, { currentTarget: { dataset: { role } } }),
  };
}

for (const platform of ["devtools", "ios", "android", "mac", "windows"]) {
  test(platform + " 游客直接登录，已有会话点任一测试按钮先注销再签发", async () => {
    const r = debugRuntime({ platform });
    r.storage.set("mj.localDebugPair", { origin: r.env.baseUrl, secret: "b".repeat(64) });
    for (const role of ["demander", "supplier", "demander", "demander"]) {
      const old = r.session.token();
      const start = r.calls.length;
      const ui = buttons(r);
      assert.equal(ui.instance.data.visible, true);
      await ui.tap(role);
      const urls = r.calls.slice(start).map(call => new URL(call.url, r.env.baseUrl).pathname);
      assert.deepEqual(urls, [...(old ? ["/api/auth/logout"] : []), "/sessions/" + role, "/api/me/context"]);
      if (old) assert.equal(r.calls[start].token, old);
      assert.equal(r.session.token(), role);
    }
  });
}

test("退出尚在进行时重复点击只处理一次，注销失败后停止签发并恢复页面", async () => {
  const r = debugRuntime();
  r.session.replace("old");
  let failLogout;
  let attempts = 0;
  r.http.request = () => {
    attempts++;
    return new Promise((resolve, reject) => { failLogout = reject; });
  };
  const ui = buttons(r);
  const pending = ui.tap("supplier");
  await ui.tap("demander");
  assert.equal(r.session.token(), "old");
  assert.equal(r.logins(), 0);
  assert.equal(attempts, 1);
  failLogout(new Error("服务器注销未确认"));
  await pending;
  assert.equal(r.calls.length, 0);
  assert.equal(r.session.token(), "");
  assert.equal(ui.instance.data.busy, false);
  assert.match(ui.instance.data.message, /注销未确认/);
  assert.deepEqual(ui.instance.events, ["switchfailed"]);
  await ui.tap("demander");
  assert.equal(r.session.token(), "demander");
});

test("先退出后新账号登录失败，保持游客且可重试", async () => {
  const r = debugRuntime();
  r.session.replace("old");
  r.wx.login = o => o.fail();
  const ui = buttons(r);
  await ui.tap("supplier");
  assert.deepEqual(r.calls.map(c => c.url), ["/api/auth/logout"]);
  assert.equal(r.session.token(), "");
  assert.equal(ui.instance.data.busy, false);
  assert.deepEqual(ui.instance.events, ["switchfailed"]);
});


test("先选身份再选账号，取消或关闭选择菜单不会注销当前账号", async () => {
  for (const [role, label] of [["demander", "租赁方"], ["supplier", "工厂"]]) {
    const r = debugRuntime();
    r.session.replace("original");
    let sheet;
    r.wx.showActionSheet = options => { sheet = options; };
    const ui = buttons(r);
    const cancelled = ui.tap(role);
    assert.deepEqual(Array.from(sheet.itemList), [label + "1", label + "2"]);
    assert.equal(r.calls.length, 0);
    sheet.fail({errMsg: "showActionSheet:fail cancel"});
    await cancelled;
    assert.equal(r.session.token(), "original");
    assert.equal(r.calls.length, 0);
    assert.equal(ui.instance.data.busy, false);
    const chosen = ui.tap(role);
    sheet.success({tapIndex: 1});
    await chosen;
    assert.equal(r.session.token(), role + "2");
    assert.deepEqual(r.calls.map(c => new URL(c.url, r.env.baseUrl).pathname),
      ["/api/auth/logout", "/sessions/" + role + "2", "/api/me/context"]);
  }
});
