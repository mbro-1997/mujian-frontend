const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const authorization = require("../miniprogram/services/phone-authorization");
function fixture(entry) {
  let definition,
    logins = 0;
  const session = { capture: () => 1, isCurrent: () => true };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../miniprogram", entry), "utf8"),
    {
      Component: (v) => {
        definition = v.methods;
      },
      require: (name) => {
        if (name.endsWith("/page"))
          return (v) => {
            definition = v;
          };
        if (name.endsWith("/storage")) return session;
        if (name.endsWith("/environment")) return { development: true };
        if (name.endsWith("/phone-authorization")) return authorization;
        if (name.endsWith("/registration"))
          return {
            login: async () => {
              logins++;
              return { owner: 1 };
            },
          };
        if (name.endsWith("/routes"))
          return { safeReturn: () => "/pages/home/index" };
        return {};
      },
      wx: { navigateTo() {}, redirectTo() {} },
    },
  );
  const instance = {
    ...definition,
    alive: true,
    epoch: 0,
    properties: { visible: true },
    data: {
      agreed: true,
      rules: [1, 2, 3, 4, 5],
      busy: false,
      returnPath: "/pages/home/index",
    },
    setData(v) {
      Object.assign(this.data, v);
    },
    triggerEvent() {},
  };
  return { instance, logins: () => logins };
}
for (const entry of [
  "components/login-sheet/index.js",
  "pages/account/index.js",
]) {
  for (const [detail, expected] of [
    [{ errMsg: "getPhoneNumber:fail user deny" }, "你取消了"],
    [{ errMsg: "getPhoneNumber:fail no permission", errCode: 123 }, "暂未开放"],
    [{ errMsg: "getPhoneNumber:fail privacy permission" }, "隐私授权"],
    [{ errMsg: "getPhoneNumber:fail system error" }, "未返回手机号授权码"],
    [undefined, "未返回手机号授权码"],
  ]) {
    test(
      entry + " classifies " + (detail?.errMsg || "missing callback"),
      async () => {
        const f = fixture(entry);
        await f.instance.phone({ detail });
        assert.ok(f.instance.data.message.includes(expected));
        assert.equal(f.logins(), 0);
        assert.equal(f.instance.data.busy, false);
        if (!expected.includes("取消"))
          assert.ok(!f.instance.data.message.includes("你取消了"));
      },
    );
  }
  test(entry + " authorizes login only with a phone code", async () => {
    const f = fixture(entry);
    await f.instance.phone({
      detail: { code: "fictional-code", errMsg: "getPhoneNumber:ok" },
    });
    assert.equal(f.logins(), 1);
  });
}
test("development diagnostics never include callback credentials or long phone digits", () => {
  const value = authorization.failure(
    {
      errMsg: "getPhoneNumber:fail code=private-token phone=13800000000",
      encryptedData: "secret",
      iv: "secret",
    },
    true,
  );
  assert.ok(!value.includes("private-token"));
  assert.ok(!value.includes("13800000000"));
  assert.ok(!value.includes("secret"));
  assert.ok(
    !authorization
      .failure({ errMsg: "getPhoneNumber:fail system error" }, false)
      .includes("调试信息"),
  );
});
