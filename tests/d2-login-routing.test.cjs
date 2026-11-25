const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const root = path.resolve(__dirname, "../miniprogram");
const id = "123456789abc4def8123456789abcdef";
const home = "/pages/home/index";
const tick = () => new Promise((resolve) => setImmediate(resolve));
function context(role = "demander", stage, restricted = false) {
  stage ||=
    role === "supplier"
      ? "factory_bound"
      : role === "demander"
        ? "demander_bound"
        : "new";
  const next = {
    new: "SELECT_IDENTITY",
    demander_bound: "ENTER_DEMANDER_HOME",
    factory_bound: "ENTER_FACTORY_HOME",
    factory_invite_locked: "COMPLETE_FACTORY_PROFILE",
    factory_pending: "WAIT_FACTORY_REVIEW",
    factory_rejected: "REVISE_FACTORY_APPLICATION",
  };
  return {
    userId: id,
    nickname: "定向夹具",
    userStatus: restricted ? "disabled" : "active",
    registrationStage: stage,
    roleCode: role,
    accessMode: restricted ? "restricted" : "normal",
    nextAction: restricted ? "ENTER_RESTRICTED_HOME" : next[stage],
  };
}
function fixture(c = context()) {
  const storage = new Map(),
    app = { globalData: { context: null } },
    modules = new Map(),
    nav = [],
    requests = [],
    completions = [];
  let pageDefinition, componentDefinition, responder;
  const bar = {
    data: {},
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  const wx = {
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    login: (o) => o.success({ code: "fixture-code" }),
    switchTab: (o) => nav.push({ method: "switchTab", url: o.url }),
    redirectTo: (o) => nav.push({ method: "redirectTo", url: o.url }),
    navigateTo: (o) => nav.push({ method: "navigateTo", url: o.url }),
    setNavigationBarTitle() {},
    pageScrollTo() {},
    showToast() {},
  };
  const profile = {
    id: "abcdef12345647898123456789abcdef",
    factoryStatus: "active",
    materials: { factoryName: "隔离夹具" },
  };
  async function request(p, method, interactive, body) {
    requests.push({ path: p, method: method || "GET" });
    if (responder) {
      const out = responder(p, method, body);
      if (out !== undefined) return out;
    }
    if (p === "/api/public/auth/wechat-phone-login")
      return { sessionToken: "fixture-session", context: c };
    if (p === "/api/me/context") return c;
    if (p === "/api/public/props/options")
      return {
        styles: [
          { code: "modern", label: "现代", enabled: true },
          { code: "retro", label: "复古", enabled: true },
        ],
        types: [{ code: "chair", label: "椅子", enabled: true }],
      };
    if (p === "/api/me/account-summary")
      return { roleCode: c.roleCode, phoneMasked: "***", wechatBound: true };
    if (p.startsWith("/api/public/rules"))
      return {
        rules: [1, 2, 3, 4, 5].map((x) => ({
          documentId: String(x),
          version: "fixture",
        })),
      };
    if (p === "/api/auth/logout") return {};
    return { items: [], total: "0" };
  }
  function load(file) {
    file = path.resolve(root, file);
    if (modules.has(file)) return modules.get(file).exports;
    const m = { exports: {} };
    modules.set(file, m);
    vm.runInNewContext(
      fs.readFileSync(file, "utf8"),
      {
        module: m,
        wx,
        getApp: () => app,
        getCurrentPages: () => [{ getTabBar: () => bar }],
        Page: (o) => (pageDefinition = o),
        Component: (o) => (componentDefinition = o),
        setTimeout,
        clearTimeout,
        require: (n) => {
          const p = path.resolve(path.dirname(file), n + ".js");
          if (p.endsWith("/services/http.js")) return { request };
          if (p.endsWith("/services/factory.js"))
            return {
              request: async (p) => {
                requests.push({ path: "/api/me/" + p, method: "GET" });
                return profile;
              },
            };
          if (p.endsWith("/session/activity.js"))
            return { report() {}, interaction() {} };
          if (p.endsWith("/config/environment.js"))
            return { development: true };
          return load(p);
        },
      },
      { filename: file },
    );
    return m.exports;
  }
  function page(name) {
    modules.delete(path.resolve(root, "pages/" + name + ".js"));
    load("pages/" + name + ".js");
    return {
      ...pageDefinition,
      route: "pages/" + name,
      data: JSON.parse(JSON.stringify(pageDefinition.data)),
      getTabBar: () => bar,
      setData(v) {
        Object.assign(this.data, v);
      },
    };
  }
  function sheet(target, parent) {
    if (!parent) {
      parent = page("account/index");
      parent.onLoad({ return: target });
    }
    load("components/login-sheet/index.js");
    const d = componentDefinition;
    const s = {
      ...d.methods,
      properties: { visible: true, returnPath: target },
      data: { ...d.data, rules: [1, 2, 3, 4, 5], agreed: true },
      setData(v) {
        Object.assign(this.data, v);
      },
      triggerEvent(name, detail) {
        this.properties.visible = false;
        if (name === "authenticated")
          completions.push(parent.loginSucceeded({ detail }));
      },
    };
    d.lifetimes.attached.call(s);
    return { s, d };
  }
  const session = load("session/storage.js");
  async function resumeLast() {
    await Promise.all(completions);
  }
  return {
    page,
    load,
    session,
    app,
    storage,
    c,
    nav,
    requests,
    bar,
    sheet,
    resumeLast,
    respond: (fn) => {
      responder = fn;
    },
  };
}
for (const role of ["demander", "supplier"])
  test(
    role + " account login resumes home and renders its existing four-tab root",
    async () => {
      const f = fixture(context(role)),
        p = f.page("account/index");
      p.onLoad({});
      p.setData({ agreed: true, rules: [1, 2, 3, 4, 5] });
      await f
        .sheet(p.data.returnPath, p)
        .s.phone({ detail: { code: "phone-fixture" } });
      await f.resumeLast();
      assert.deepEqual(f.nav.at(-1), { method: "switchTab", url: home });
      const rootPage = f.page("home/index");
      await rootPage.onShow();
      await tick();
      assert.equal(rootPage.data.factoryRoot, role === "supplier");
      assert.equal(
        f.bar.data.items.map((x) => x.text).join(","),
        role === "supplier" ? "首页,发布,仓库,我的" : "首页,方案,清单,我的",
      );
      assert.equal(
        f.requests.filter(
          (x) => x.path === "/api/public/auth/wechat-phone-login",
        ).length,
        1,
      );
    },
  );
test("login sheet snapshots the original target before session reset changes parent properties", async () => {
  const f = fixture(),
    target =
      "/pages/props/browse?keyword=%E6%A1%8C&styles=%5B%22modern%22%5D&typeCode=chair&startDate=2026-11-04&endDate=2026-11-06";
  const { s } = f.sheet(target);
  f.session.subscribe(() => {
    s.properties.returnPath = home;
  });
  await s.phone({ detail: { code: "phone-fixture" } });
  await f.resumeLast();
  assert.equal(f.nav.at(-1).url, target);
});
test("same validated targets preserve authorized context and reject wrong-role private/rental targets", () => {
  const f = fixture(),
    choose = f.load("navigation/login-target.js").select;
  const publicTargets = [
    "/pages/props/browse?styles=%5B%22modern%22%5D&typeCode=chair",
    "/pages/props/product?id=" + id,
  ];
  const rentalTargets = [
    "/pages/props/browse?keyword=%E6%A1%8C",
    "/pages/props/product?id=" +
      id +
      "&startDate=2026-11-04&endDate=2026-11-06",
  ];
  const factoryTargets = [
    "/pages/props/detail?id=" + id,
    "/pages/props/scan/index?code=" + id,
    "/pages/inventory/logs?id=" + id + "&skuId=" + id + "&source=ledger",
    "/pages/factory/form?mode=change",
    "/pages/factory/rules?readOnly=1",
  ];
  for (const role of ["supplier", "demander"])
    for (const target of publicTargets)
      assert.equal(choose(context(role), target), target);
  for (const target of rentalTargets) {
    assert.equal(choose(context("demander"), target), target);
    assert.equal(choose(context("supplier"), target), home);
  }
  for (const target of factoryTargets) {
    assert.equal(choose(context("supplier"), target), target);
    assert.equal(choose(context("demander"), target), home);
  }
  for (const target of [
    "https://bad.invalid",
    "/pages/factory/invite",
    "/pages/factory/form",
  ])
    assert.equal(choose(context("supplier"), target), home);
});
for (const [role, target, expected] of [
  [
    "demander",
    "/pages/props/product?id=" +
      id +
      "&startDate=2026-11-04&endDate=2026-11-06",
    null,
  ],
  ["supplier", "/pages/props/detail?id=" + id, null],
  ["supplier", "/pages/props/browse?keyword=%E6%A1%8C", home],
  ["demander", "/pages/inventory/index?id=" + id, home],
])
  test(role + " login continuation " + target, async () => {
    const f = fixture(context(role)),
      p = f.page("account/index");
    p.onLoad({ return: target });
    p.setData({ agreed: true, rules: [1, 2, 3, 4, 5] });
    await f
      .sheet(p.data.returnPath, p)
      .s.phone({ detail: { code: "phone-fixture" } });
    await f.resumeLast();
    assert.equal(f.nav.at(-1).url, expected || target);
    assert.equal(
      f.requests.some((x) => /factory-props|prop-qr/.test(x.path)),
      false,
      "login routing must not probe private objects",
    );
  });
test("unbound stages and restricted accounts keep existing identity/admission flows", async () => {
  for (const stage of [
    "new",
    "factory_invite_locked",
    "factory_pending",
    "factory_rejected",
  ]) {
    const f = fixture(context(null, stage));
    f.session.replace("fixture");
    const p = f.page("account/index");
    p.onLoad({ resume: "1", return: "/pages/inventory/index?id=" + id });
    await p.load();
    if (stage === "new") {
      assert.equal(f.nav.length, 0);
      assert.equal(p.data.action, "SELECT_IDENTITY");
    } else assert.equal(f.nav.at(-1).url, "/pages/factory/index");
  }
  const f = fixture(context(null, "factory_pending", true));
  f.session.replace("fixture");
  const p = f.page("account/index");
  p.onLoad({ resume: "1" });
  await p.load();
  assert.equal(f.nav.length, 0);
  assert.equal(p.data.action, "ENTER_RESTRICTED_HOME");
  const s = fixture(context("supplier", undefined, true));
  s.session.replace("fixture");
  const a = s.page("account/index");
  a.onLoad({ resume: "1" });
  await a.load();
  await s.page("home/index").onShow();
  assert.equal(s.bar.data.items[1].text, "发布");
  assert.equal(s.app.globalData.context.accessMode, "restricted");
});
test("guard rejects wrong role before private requests and resumes incomplete admission", async () => {
  for (const c of [
    context("demander"),
    context(null, "new"),
    context(null, "factory_pending"),
  ]) {
    const f = fixture(c);
    f.session.replace("fixture");
    const p = f.page("inventory/logs");
    await p.onLoad({ id, skuId: id });
    await p.onShow();
    assert.equal(
      f.requests.some((x) =>
        /factory-profile|factory-props|prop-instances/.test(x.path),
      ),
      false,
    );
    assert.equal(
      f.nav.at(-1).url,
      c.roleCode === "demander"
        ? home
        : c.registrationStage === "new"
          ? "/pages/account/index"
          : "/pages/factory/index",
    );
  }
});
test("logout clears return target and factory-private navigation state; next login uses trusted new role", async () => {
  const f = fixture(context("supplier"));
  f.session.replace("fixture");
  const state = f.load("navigation/state.js"),
    p = f.page("account/index");
  p.onLoad({ return: "/pages/props/detail?id=" + id });
  state.bind(f.c, "factory");
  const saved = {
    route: "pages/inventory/select",
    data: { keyword: "private", page: 5 },
    _navigationScroll: 20,
  };
  state.save(saved);
  await p.logout();
  assert.equal(f.session.token(), "");
  assert.equal(p.data.returnPath, home);
  assert.equal(f.app.globalData.context, null);
  Object.assign(f.c, context("demander"));
  f.session.replace("new");
  state.bind(f.c, "");
  const next = {
    route: saved.route,
    data: { keyword: "", page: 1 },
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  state.restore(next);
  assert.equal(next.data.keyword, "");
  const a = f.page("account/index");
  a.onLoad({ resume: "1" });
  await a.load();
  await f.page("home/index").onShow();
  assert.equal(f.bar.data.items[1].text, "方案");
});
test("late context after logout cannot navigate or refill account state", async () => {
  const f = fixture();
  f.session.replace("fixture");
  let resolve;
  f.respond((p) =>
    p === "/api/me/context" ? new Promise((r) => (resolve = r)) : undefined,
  );
  const p = f.page("account/index");
  p.onLoad({ resume: "1", return: "/pages/props/product?id=" + id });
  const loading = p.load();
  f.session.clear();
  resolve(f.c);
  await loading;
  assert.equal(f.nav.length, 0);
  assert.equal(p.data.returnPath, home);
  assert.equal(p.data.summary, null);
});
test("account page unloaded before phone login completes cannot install or navigate a new session", async () => {
  const f = fixture();
  let resolve;
  f.respond((p) =>
    p === "/api/public/auth/wechat-phone-login"
      ? new Promise((r) => (resolve = r))
      : undefined,
  );
  const p = f.page("account/index");
  p.onLoad({});
  p.setData({ agreed: true, rules: [1, 2, 3, 4, 5] });
  const { s, d } = f.sheet(p.data.returnPath, p);
  const logging = s.phone({ detail: { code: "fixture" } });
  await tick();
  p.onUnload();
  d.lifetimes.detached.call(s);
  resolve({ sessionToken: "late", context: f.c });
  await logging;
  assert.equal(f.session.token(), "");
  assert.equal(f.nav.length, 0);
});
test("account onLoad/back uses trusted context for complete browse filters and product rental dates", async () => {
  const targets = [
    "/pages/props/browse?keyword=%E6%A1%8C&styles=%5B%22modern%22%2C%22retro%22%5D&typeCode=chair&startDate=2026-11-04&endDate=2026-11-06",
    "/pages/props/product?id=" +
      id +
      "&startDate=2026-11-04&endDate=2026-11-06",
  ];
  for (const role of ["demander", "supplier"])
    for (const target of targets) {
      const f = fixture(context(role));
      f.session.replace("fixture");
      const p = f.page("account/index");
      p.onLoad({ return: target });
      assert.equal(p.data.returnPath, target);
      await p.back();
      assert.equal(f.nav.at(-1).url, role === "demander" ? target : home);
    }
});
test("account back preserves public browsing/product for factory and ignores a stale local role hint", async () => {
  for (const target of [
    "/pages/props/browse?styles=%5B%22modern%22%5D&typeCode=chair",
    "/pages/props/product?id=" + id,
  ]) {
    const f = fixture(context("supplier"));
    f.session.replace("fixture");
    const p = f.page("account/index");
    p.onLoad({ return: target });
    await p.back();
    assert.equal(f.nav.at(-1).url, target);
  }
  const f = fixture(context("demander"));
  f.session.replace("fixture");
  f.app.globalData.context = context("supplier");
  const p = f.page("account/index");
  p.onLoad({ resume: "1", return: "/pages/props/detail?id=" + id });
  await p.load();
  assert.equal(f.nav.at(-1).url, home);
  assert.equal(f.app.globalData.context.roleCode, "demander");
});
for (const name of ["plan", "checklist"])
  for (const role of ["demander", "supplier"])
    test(
      name +
        " guest login producer preserves renter intent when authenticated as " +
        role,
      async () => {
        const f = fixture(context(role)),
          producer = f.page(name + "/index");
        await producer.onShow();
        producer.goAccount();
        assert.equal(producer.data.loginVisible, true);
        const markup = fs.readFileSync(
          path.join(root, "pages", name, "index.wxml"),
          "utf8",
        );
        const target = markup.match(
          /<login-sheet\b[^>]*\breturn-path="([^"]+)"/,
        )[1];
        assert.equal(target, "/pages/" + name + "/index");
        const { s } = f.sheet(target);
        await s.phone({ detail: { code: "phone-fixture" } });
        await f.resumeLast();
        assert.equal(f.nav.at(-1).method, "switchTab");
        assert.equal(f.nav.at(-1).url, role === "demander" ? target : home);
        const account = f.page("account/index");
        account.onLoad({ return: target });
        await account.back();
        assert.equal(f.nav.at(-1).url, role === "demander" ? target : home);
        assert.equal(
          f.requests.some((x) => /factory-props|prop-qr/.test(x.path)),
          false,
        );
      },
    );
test("normal authenticated factory tabs still open publish and warehouse without login target selection", async () => {
  const f = fixture(context("supplier"));
  f.session.replace("fixture");
  const routes = f.load("constants/routes.js");
  assert.equal(routes.items(f.c)[1].path, "/pages/plan/index");
  assert.equal(routes.items(f.c)[1].text, "发布");
  assert.equal(routes.items(f.c)[2].path, "/pages/checklist/index");
  assert.equal(routes.items(f.c)[2].text, "仓库");
  for (const name of ["plan", "checklist"]) {
    const p = f.page(name + "/index");
    await p.onShow();
    assert.equal(p.data.factoryRoot, true);
    assert.equal(p.data.rootReady, true);
  }
  assert.equal(
    f.nav.length,
    0,
    "normal factory root navigation must not redirect home",
  );
});

for (const name of ["home/index", "props/browse"])
  test(
    name +
      " inline login closes without navigation and restores filters after a real session reset",
    async () => {
      const f = fixture(),
        p = f.page(name);
      await p.onLoad({});
      await p.onShow();
      const filters = {
        keyword: "木质 道具",
        styleCodes: ["modern", "retro"],
        typeCode: "chair",
        rental: true,
        startDate: "2026-11-04",
        endDate: "2026-11-06",
      };
      p.setData(filters);
      p.login();
      assert.equal(p.data.loginVisible, true);
      assert.equal(f.nav.length, 0);
      const target = p.data.loginReturnPath;
      p.closeLogin();
      assert.equal(p.data.loginVisible, false);
      for (const k of Object.keys(filters))
        assert.deepEqual(JSON.parse(JSON.stringify(p.data[k])), filters[k]);
      p.login();
      const { s } = f.sheet(target, p);
      f.session.subscribe(() => {
        s.properties.returnPath = home;
        s.properties.visible = false;
      });
      await s.phone({ detail: { code: "fixture" } });
      await f.resumeLast();
      assert.equal(f.session.token(), "fixture-session");
      assert.equal(
        f.nav.length,
        0,
        "authorized search stays on its original page",
      );
      for (const k of Object.keys(filters))
        assert.deepEqual(JSON.parse(JSON.stringify(p.data[k])), filters[k]);
      assert.equal(p.data.typeLabel, "椅子");
      assert.equal(p.data.loginVisible, false);
      assert.ok(
        f.requests.some(
          (x) =>
            x.path.startsWith("/api/me/props/rentable?") &&
            x.path.includes("typeCode=chair") &&
            x.path.includes("styleCodes=modern"),
        ),
      );
    },
  );
for (const name of ["props/product", "props/scan/index"])
  test(
    name + " inline login restores only its allowed object/date locator",
    async () => {
      const role = name.includes("scan") ? "supplier" : "demander",
        f = fixture(context(role)),
        p = f.page(name);
      const q = name.includes("scan")
        ? { code: id }
        : { id, startDate: "2026-11-04", endDate: "2026-11-06" };
      await p.onLoad(q);
      p.login();
      const target = p.data.loginReturnPath;
      assert.equal(p.data.loginVisible, true);
      assert.equal(f.nav.length, 0);
      const { s } = f.sheet(target, p);
      await s.phone({ detail: { code: "fixture" } });
      await f.resumeLast();
      assert.equal(f.nav.length, 0);
      for (const k of Object.keys(q)) assert.equal(p.data[k], q[k]);
    },
  );
test("inline home login rejects factory rental intent and resumes pending admission without private search", async () => {
  for (const c of [
    context("supplier"),
    context(null, "new"),
    context(null, "factory_pending"),
  ]) {
    const f = fixture(c),
      p = f.page("home/index");
    await p.onLoad({});
    await p.onShow();
    p.setData({ keyword: "椅子" });
    p.login();
    const { s } = f.sheet(p.data.loginReturnPath, p);
    await s.phone({ detail: { code: "fixture" } });
    await f.resumeLast();
    assert.equal(
      f.requests.some((x) => x.path.startsWith("/api/me/props?")),
      false,
    );
    if (c.roleCode === "supplier") {
      assert.equal(p.data.factoryRoot, true);
      assert.equal(p.data.keyword, "");
    } else
      assert.match(
        f.nav.at(-1).url,
        c.registrationStage === "new"
          ? /account\/index\?resume=1/
          : /factory\/index/,
      );
  }
});
test("closing or hiding an in-flight common sheet cannot publish a login or restore a page", async () => {
  for (const action of ["close", "hide"]) {
    const f = fixture();
    let resolve;
    f.respond((p) =>
      p === "/api/public/auth/wechat-phone-login"
        ? new Promise((r) => (resolve = r))
        : undefined,
    );
    const p = f.page("home/index");
    await p.onLoad({});
    p.setData({ keyword: "保留" });
    p.login();
    const { s, d } = f.sheet(p.data.loginReturnPath, p);
    const logging = s.phone({ detail: { code: "fixture" } });
    await tick();
    if (action === "close") {
      s.close();
      p.closeLogin();
    } else d.pageLifetimes.hide.call(s);
    resolve({ sessionToken: "late", context: f.c });
    await logging;
    await f.resumeLast();
    assert.equal(f.session.token(), "");
    assert.equal(f.nav.length, 0);
    assert.equal(p.data.keyword, "保留");
  }
});
test("account and all guest producers share one phone consent implementation", () => {
  for (const name of [
    "home/index",
    "plan/index",
    "checklist/index",
    "mine/index",
    "props/browse",
    "props/product",
    "props/scan/index",
    "account/index",
    "props/dates",
  ]) {
    const markup = fs.readFileSync(
      path.join(root, "pages", name + ".wxml"),
      "utf8",
    );
    assert.match(markup, /<login-sheet[^>]*bindauthenticated="loginSucceeded"/);
    assert.doesNotMatch(markup, /getPhoneNumber|login-overlay/);
  }
  const accountSource = fs.readFileSync(
    path.join(root, "pages/account/index.js"),
    "utf8",
  );
  assert.doesNotMatch(
    accountSource,
    /async phone\(|async loadRules\(|agreement\(/,
  );
});

for (const [role, stage] of [
  ["demander", undefined],
  ["supplier", undefined],
  [null, "new"],
  [null, "factory_pending"],
])
  test(
    "calendar inline confirm preserves dates through login and routes by server identity " +
      (role || stage),
    async (t) => {
      const f = fixture(context(role, stage)),
        p = f.page("props/dates"),
        c = f.load("services/rental-calendar.js"),
        today = c.earliestStart();
      t.after(() => p.onUnload());
      await p.onLoad({
        return:
          "/pages/props/browse?keyword=%E6%9C%A8%E6%A4%85&styles=%5B%22modern%22%5D&typeCode=chair",
      });
      p.confirm();
      assert.equal(p.data.loginVisible, false);
      assert.equal(f.nav.length, 0);
      p.select({ currentTarget: { dataset: { date: today } } });
      p.confirm();
      assert.equal(p.data.loginVisible, false);
      p.select({ currentTarget: { dataset: { date: today } } });
      p.confirm();
      assert.equal(p.data.loginVisible, true);
      assert.equal(f.nav.length, 0);
      const target = p.data.loginReturnPath;
      const q = new URLSearchParams(target.split("?")[1]);
      assert.equal(q.get("startDate"), today);
      assert.equal(q.get("endDate"), today);
      assert.equal(q.get("keyword"), "木椅");
      assert.equal(q.get("styles"), '["modern"]');
      assert.equal(q.get("typeCode"), "chair");
      p.closeLogin();
      assert.equal(p.data.startDate, today);
      assert.equal(p.data.endDate, today);
      assert.equal(p.data.filters.typeCode, "chair");
      assert.equal(p.data.loginVisible, false);
      p.confirm();
      assert.equal(
        f.requests.some((x) => x.path.startsWith("/api/me/props")),
        false,
      );
      const { s } = f.sheet(p.data.loginReturnPath, p);
      f.session.subscribe(() => {
        s.properties.returnPath = home;
      });
      await s.phone({ detail: { code: "fixture" } });
      await f.resumeLast();
      if (role === "demander") {
        assert.equal(f.nav.length, 0);
        assert.equal(p.data.startDate, today);
        assert.equal(p.data.endDate, today);
        assert.equal(p.data.filters.typeCode, "chair");
        assert.equal(p.data.loginVisible, false);
      } else if (role === "supplier")
        assert.deepEqual(f.nav.at(-1), { method: "switchTab", url: home });
      else
        assert.match(
          f.nav.at(-1).url,
          stage === "new" ? /account\/index\?resume=1/ : /factory\/index/,
        );
    },
  );
