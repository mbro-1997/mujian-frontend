const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "../miniprogram");
function fixture() {
  let now = 0,
    token = "credential",
    calls = [],
    page;
  const activityContext = {
    module: { exports: {} },
    Date: { now: () => now },
    require(name) {
      if (name.includes("account"))
        return {
          context(interactive) {
            calls.push({ interactive, now });
            return Promise.resolve({});
          },
        };
      return {
        token: () => token,
        capture: () => ({ token }),
        isCurrent: (owner) => owner.token === token,
        subscribe: () => () => {},
      };
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "session/activity.js"), "utf8"),
    activityContext
  );
  const activity = activityContext.module.exports;
  const pageContext = {
    module: { exports: {} },
    require: (name) =>
      name === "./activity"
        ? activity
        : {
            capture: () => ({ token }),
            isCurrent: (owner) => owner.token === token,
            subscribe: () => () => {},
          },
    Page: (options) => {
      page = options;
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "session/page.js"), "utf8"),
    pageContext
  );
  pageContext.module.exports({ onShow() {}, load() {}, goAccount() {} });
  return {
    activity,
    page,
    calls,
    advance(ms) {
      now += ms;
    },
    token(value) {
      token = value;
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("foreground, routes and taps share one minute budget; background and automatic load never renew", async () => {
  const f = fixture();
  await f.activity.show();
  f.page.onShow();
  f.page.goAccount({ type: "tap" });
  await flush();
  assert.equal(f.calls.length, 1);
  f.advance(60000);
  f.page.onShow();
  await flush();
  assert.equal(f.calls.length, 2);
  f.activity.hide();
  f.advance(60000);
  f.page.onShow();
  f.page.goAccount({ type: "tap" });
  f.page.load();
  await flush();
  assert.equal(f.calls.length, 2);
  await f.activity.show();
  assert.equal(f.calls.length, 3);
  f.advance(60000);
  f.page.load();
  await flush();
  assert.equal(f.calls.length, 3);
  f.page.goAccount({ type: "tap" });
  await flush();
  assert.equal(f.calls.length, 4);
  assert.ok(f.calls.every((c) => c.interactive));
});
test("visitor never reports; new credential gets its own budget", async () => {
  const f = fixture();
  f.token(null);
  await f.activity.show();
  assert.equal(f.calls.length, 0);
  f.token("new");
  f.page.onShow();
  await flush();
  assert.equal(f.calls.length, 1);
  f.token("other");
  f.page.onShow();
  await flush();
  assert.equal(f.calls.length, 2);
});
test("every production page uses centralized lifecycle; account default read is background", () => {
  for (const name of JSON.parse(fs.readFileSync(path.join(root,"app.json"),"utf8")).pages)
    assert.match(
      fs.readFileSync(path.join(root, name+".js"), "utf8"),
      /session\/page/
    );
  assert.match(
    fs.readFileSync(path.join(root, "services/account.js"), "utf8"),
    /interactive\s*=\s*false/
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, "session/activity.js"), "utf8"),
    /setInterval|setTimeout/
  );
});
