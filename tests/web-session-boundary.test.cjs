const test = require("node:test"),
  assert = require("node:assert/strict");
const { fixture } = require("./web-fixture.cjs");
const flush = () => new Promise((r) => setImmediate(r));
function active(f) {
  const b = f.load("session/boundary.ts");
  const id = b.beginSessionChange();
  b.acceptLogin(id);
  return b;
}
for (const kind of ["200", "401", "403", "503", "network"])
  test(`Web old ${kind} identity never overwrites B or its notices`, async () => {
    const f = fixture(),
      s = f.load("session/state.ts"),
      b = active(f);
    const old = s.loadIdentity().catch((e) => s.explain(e));
    const pendingA = f.pending.slice();
    b.acceptLogin(b.beginSessionChange());
    const current = s.loadIdentity();
    f.reply(f.pending[2]);
    f.reply(f.pending[3]);
    await current;
    const identity = s.me.value;
    s.notice.value = "B的提示";
    if (kind === "200") {
      f.reply(pendingA[0]);
      f.reply(pendingA[1]);
    } else if (kind === "network") pendingA[0].reject(Error("offline"));
    else
      f.reply(
        pendingA[0],
        +kind,
        kind === "401"
          ? "LOGIN_REQUIRED"
          : kind === "403"
          ? "ACCOUNT_ACTION_RESTRICTED"
          : "DATABASE_UNAVAILABLE"
      );
    await old;
    assert.equal(s.me.value, identity);
    assert.equal(s.notice.value, "B的提示");
    assert.ok(b.canReadIdentity());
  });
for (const result of ["success", "503", "network"])
  test(`Web logout ${result} clears local state and blocks old identity restore`, async () => {
    const f = fixture(),
      s = f.load("session/state.ts"),
      b = active(f);
    const old = s.loadIdentity().catch((e) => s.explain(e));
    const logout = s.logout();
    f.reply(f.pending[2]);
    await flush();
    const command = f.pending[3];
    if (result === "success") f.reply(command);
    else if (result === "network") command.reject(Error("offline"));
    else f.reply(command, 503, "SESSION_STORE_UNAVAILABLE");
    assert.notEqual(await logout, null);
    f.reply(f.pending[0]);
    f.reply(f.pending[1]);
    await old;
    assert.equal(s.me.value, null);
    assert.equal(s.menus.value.length, 0);
    assert.equal(b.canReadIdentity(), false);
    if (result !== "success") assert.match(s.notice.value, /注销尚未确认/);
    await assert.rejects(
      s.loadIdentity(),
      (e) => e.reason === "LOGIN_REQUIRED"
    );
  });
for (const kind of ["200", "403", "network"])
  test(`Web actual MenuReadOnly old ${kind} cannot write data, error, navigation or busy of B`, async () => {
    const f = fixture(),
      s = f.load("session/state.ts"),
      b = active(f),
      v = f.load("views/system/MenuReadOnly.vue", ["load", "data", "busy"]);
    const old = v.load();
    b.acceptLogin(b.beginSessionChange());
    const current = v.load();
    f.reply(f.pending[1]);
    await current;
    const expected = v.data.value;
    s.notice.value = "B";
    if (kind === "200") f.reply(f.pending[0]);
    else if (kind === "network") f.pending[0].reject(Error());
    else f.reply(f.pending[0], 403, "PERMISSION_DENIED");
    await old;
    assert.equal(v.data.value, expected);
    assert.equal(s.notice.value, "B");
    assert.equal(v.busy.value, false);
    assert.equal(f.navigations.length, 0);
  });
test("Web current errors remain effective, same-session identity reads may resolve in either order", async () => {
  const f = fixture(),
    s = f.load("session/state.ts");
  active(f);
  const a = s.loadIdentity(),
    b = s.loadIdentity();
  f.reply(f.pending[2]);
  f.reply(f.pending[3]);
  await b;
  f.reply(f.pending[0]);
  f.reply(f.pending[1]);
  await a;
  assert.ok(s.me.value);
  const expired = s.loadIdentity().catch((e) => s.explain(e));
  f.reply(f.pending[4], 401, "LOGIN_REQUIRED");
  await expired;
  assert.equal(s.me.value, null);
  assert.match(s.notice.value, /登录已失效/);
});
test("Web old activity finally cannot release B pending activity; background stays silent", async () => {
  const f = fixture(),
    s = f.load("session/state.ts"),
    b = active(f),
    a = f.load("session/activity.ts");
  s.me.value = { nickname: "A" };
  a.installActivityReporting();
  f.events.pointerdown({ isTrusted: true });
  b.acceptLogin(b.beginSessionChange());
  s.me.value = { nickname: "B" };
  f.events.pointerdown({ isTrusted: true });
  assert.equal(f.pending.length, 4);
  f.reply(f.pending[0]);
  f.reply(f.pending[1]);
  await flush();
  f.advance(60001);
  f.events.pointerdown({ isTrusted: true });
  assert.equal(f.pending.length, 4);
  f.reply(f.pending[2]);
  f.reply(f.pending[3]);
  await flush();
  f.hide();
  f.events.pointerdown({ isTrusted: true });
  assert.equal(f.pending.length, 4);
  f.show();
  f.events.visibilitychange({ isTrusted: true });
  assert.equal(f.pending.length, 6);
});
test("Web login replaces old identity epoch and refreshes CSRF; auth mutations cannot overlap", async () => {
  const f = fixture(),
    s = f.load("session/state.ts");
  active(f);
  const old = s.loadIdentity().catch((e) => s.explain(e));
  const login = s.login("d1.admin", "fixture-password");
  await assert.rejects(
    s.login("other", "fixture"),
    (e) => e.reason === "AUTH_IN_PROGRESS"
  );
  assert.equal(await s.logout(), null);
  f.reply(f.pending[2]);
  await flush();
  f.reply(f.pending[3]);
  await flush();
  f.reply(f.pending[4]);
  await flush();
  f.reply(f.pending[5]);
  f.reply(f.pending[6]);
  await login;
  const expected = s.me.value;
  f.reply(f.pending[0]);
  f.reply(f.pending[1]);
  await old;
  assert.equal(s.me.value, expected);
  assert.equal(s.authBusy.value, false);
});
test("Web old CSRF and unmounted login form cannot set new token or readiness", async () => {
  const f = fixture(),
    s = f.load("session/state.ts"),
    b = active(f),
    v = f.load("views/auth/LoginView.vue", [
      "connect",
      "ready",
      "busy",
      "password",
    ]);
  const old = v.connect();
  b.acceptLogin(b.beginSessionChange());
  f.reply(f.pending[0]);
  await old;
  assert.equal(v.ready.value, false);
  const next = v.connect();
  f.unmounted.forEach((fn) => fn());
  f.reply(f.pending[1]);
  await next;
  assert.equal(v.ready.value, false);
  assert.equal(s.notice.value, "");
});

test("Web cross-tab invalidation discards pending reads and clears current view", async () => {
  const f = fixture(),
    s = f.load("session/state.ts"),
    b = active(f);
  s.me.value = { nickname: "A" };
  const old = s.loadIdentity().catch((e) => s.explain(e));
  f.events["window:storage"]({ key: "mj.sessionChange" });
  f.reply(f.pending[0]);
  f.reply(f.pending[1]);
  await old;
  assert.equal(s.me.value, null);
  assert.equal(b.canReadIdentity(), false);
  assert.equal(f.stored.get("mj.localLogout"), "1");
  assert.equal(s.notice.value, "");
});
test("Web actual router cancels stale navigation instead of redirecting B", async () => {
  const f = fixture(),
    s = f.load("session/state.ts"),
    b = active(f);
  f.load("router/index.ts");
  const navigation = f.guards[0]({ path: "/system/menus" });
  b.acceptLogin(b.beginSessionChange());
  s.me.value = { nickname: "B" };
  f.reply(f.pending[0], 401, "LOGIN_REQUIRED");
  assert.equal(await navigation, false);
  assert.equal(s.me.value.nickname, "B");
  assert.equal(s.notice.value, "");
});
test("Web actual LoginView submits and navigates after valid current login", async () => {
  const f = fixture(),
    s = f.load("session/state.ts"),
    v = f.load("views/auth/LoginView.vue", ["connect", "submit", "answer", "password", "busy"]);
  const connected = v.connect();
  f.reply(f.pending[0]);
  await flush();
  assert.equal(f.pending[1].url, "/api/admin/auth/captcha");
  f.pending[1].resolve({ status: 200, ok: true, json: async () => ({
    code: "OK", message: "测试", traceId: "captcha-test",
    data: { captchaId: "a0000000000040008000000000000001", imageData: "data:image/png;base64,AA==", expiresAt: "2026-11-17T12:00:00.000+08:00" },
  }) });
  await connected;
  v.answer.value = "TEST";
  s.lastUsername.value = "d1.admin";
  v.password.value = "fixture";
  const login = v.submit();
  f.reply(f.pending[2]);
  await flush();
  f.reply(f.pending[3]);
  await flush();
  f.reply(f.pending[4]);
  await flush();
  f.reply(f.pending[5]);
  f.reply(f.pending[6]);
  await login;
  assert.equal(v.password.value, "");
  assert.equal(v.busy.value, false);
  assert.deepEqual(f.navigations, ["/"]);
  assert.ok(s.me.value);
});
test("Web old page finally does not clear B in-flight flag", async () => {
  const f = fixture(),
    b = active(f),
    v = f.load("views/system/MenuReadOnly.vue", ["load", "busy"]);
  const old = v.load();
  b.acceptLogin(b.beginSessionChange());
  const current = v.load();
  f.pending[0].reject(Error("offline"));
  await old;
  assert.equal(v.busy.value, true);
  f.reply(f.pending[1]);
  await current;
  assert.equal(v.busy.value, false);
});
test("Web actual AdminLayout logout failure still navigates to locally logged-out login", async () => {
  const f = fixture();
  active(f);
  const v = f.load("layouts/AdminLayout.vue", ["exit"]);
  const exiting = v.exit();
  f.reply(f.pending[0]);
  await flush();
  f.pending[1].reject(Error("offline"));
  await exiting;
  assert.deepEqual(f.navigations, ["/login"]);
  assert.equal(f.load("session/boundary.ts").canReadIdentity(), false);
});

for (const result of ["200", "401", "network"])
  test(`Web stale logout ${result} cannot clear B or redirect it`, async () => {
    const f = fixture(),
      s = f.load("session/state.ts"),
      b = active(f);
    const v = f.load("layouts/AdminLayout.vue", ["exit"]);
    const exiting = v.exit();
    f.reply(f.pending[0]);
    await flush();
    b.acceptLogin(b.beginSessionChange());
    s.me.value = { nickname: "B" };
    s.notice.value = "B";
    if (result === "200") f.reply(f.pending[1]);
    else if (result === "401") f.reply(f.pending[1], 401, "LOGIN_REQUIRED");
    else f.pending[1].reject(Error("offline"));
    await exiting;
    assert.equal(s.me.value.nickname, "B");
    assert.equal(s.notice.value, "B");
    assert.equal(b.canReadIdentity(), true);
    assert.equal(f.navigations.length, 0);
  });

test('管理员按批次恢复超时已阅请求，A 和 B 分别使用自己的快照、备注和编号', async () => {
  const sent = [], audit = new Map(), reads = new Map();
  const me = { value: { userId: 'admin-one' } };
  class ApiError extends Error {}
  const web = fixture({ mocks: {
    './trading.css': {},
    '../../session/state': { me },
    '../../api/trading': { tradeError: () => '结果未确定' },
    '../../api/http': {
      ApiError, refreshCsrf: async () => {},
      async api(path, method, body, interactive, key) {
        const [, id, tail] = path.match(/settlements\/([^/?]+)(.*)$/);
        if (method === 'POST') {
          sent.push({ id, key, body: { ...body } });
          audit.set(key, id);
          if (sent.length === 1) throw new ApiError();
          return {};
        }
        if (tail) return { items: [] };
        reads.set(id, (reads.get(id) ?? 0) + 1);
        return { summary: { id }, snapshotToken: id + '-' + reads.get(id) };
      },
    },
  } });
  const page = web.load('views/trading/Settlements.vue', ['read', 'ack', 'close', 'remark', 'pending']);
  const read = (id) => page.read(id, () => true);
  await read('A');
  page.remark.value = '原备注';
  await page.ack();
  page.close();
  await read('B');
  assert.equal(page.pending.value, null);
  page.remark.value = 'B 备注';
  await page.ack();
  page.close();
  me.value = { userId: 'admin-two' };
  await read('A');
  assert.equal(page.pending.value, null);
  me.value = { userId: 'admin-one' };
  await read('A');
  assert.equal(page.remark.value, '原备注');
  await page.ack();
  assert.deepEqual(sent[2], sent[0]);
  assert.notEqual(sent[1].key, sent[0].key);
  assert.deepEqual(sent[1].body, { snapshotToken: 'B-1', remark: 'B 备注' });
  assert.equal(audit.size, 2);
  assert.equal(page.pending.value, null);
});
