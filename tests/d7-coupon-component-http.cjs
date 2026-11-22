// 运行正式小程序组件及响应校验器，仅以 Node 适配 wx.request 和宿主生命周期。
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { fixture } = require("./support/planning-fixture.cjs");
(async () => {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  assert.match(input.base, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.notEqual(new URL(input.base).port, "18080");
  const f = fixture(null, {}, true);
  f.session.replace(input.token);
  f.load("components/coupon-offers/index.js");
  const def = f.component;
  let writes = 0,
    delay = null,
    failOnce = false;
  f.wx.request = async (o) => {
    try {
      const u = new URL(o.url);
      if (o.method === "POST") writes++;
      const res = await fetch(input.base + u.pathname + u.search, {
          method: o.method,
          headers: o.header,
          body: o.data === undefined ? undefined : JSON.stringify(o.data),
        }),
        body = await res.json();
      if (delay) await delay;
      if (failOnce) {
        failOnce = false;
        o.fail({ errMsg: "合成丢响应" });
        return;
      }
      o.success({ statusCode: res.status, data: body });
    } catch (e) {
      o.fail(e);
    }
  };
  function mount() {
    const c = {
      data: structuredClone(def.data),
      ...def.methods,
      setData(v) {
        Object.assign(this.data, v);
      },
      triggerEvent(n) {
        this.event = n;
      },
    };
    def.lifetimes.attached.call(c);
    return c;
  }
  const home = mount();
  await home.open(input.userId);
  assert.equal(home.data.visible, true);
  assert(home.data.items.some((x) => x.activityId === input.activity));
  assert.equal(writes, 0);
  home.close();
  await home.open(input.userId);
  assert.equal(home.data.visible, false);
  def.lifetimes.detached.call(home);
  const wallet = mount();
  await wallet.open();
  assert(wallet.data.visible);
  const event = { currentTarget: { dataset: { id: input.activity } } };
  failOnce = true;
  await wallet.claim(event);
  assert(wallet.data.message);
  await wallet.claim(event);
  assert.equal(wallet.event, "claimed");
  assert(
    wallet.data.items.find((x) => x.activityId === input.activity).claimed,
  );
  let release;
  delay = new Promise((r) => (release = r));
  const late = wallet.open();
  f.session.replace(input.other);
  release();
  await late;
  assert.equal(wallet.data.visible, false);
  assert.equal(wallet.data.items.length, 0);
  def.lifetimes.detached.call(wallet);
  console.log(
    "component: discovery read-only; once per launch; wallet independent; lost reply replay; late account response ignored",
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
