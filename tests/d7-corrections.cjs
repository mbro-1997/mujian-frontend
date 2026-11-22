// 使用隔离服务的真实 HTTP；微信宿主仅适配生命周期、请求传输和随机数。
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { fixture } = require("./support/planning-fixture.cjs");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
assert.match(input.base, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.notEqual(new URL(input.base).port, "18080");
const source = { sourceType: "factory_onboarding", sourceId: input.id };

function mount(name, token = input.token) {
  const f = fixture(name, { roleCode: "demander" }, true);
  f.session.replace(token);
  f.requests = [];
  f.wx.getRandomValues = (o) =>
    o.success({
      randomValues: Uint8Array.from(crypto.randomBytes(o.length)).buffer,
    });
  f.wx.request = async (o) => {
    try {
      const url = new URL(o.url);
      f.requests.push(o.method + " " + url.pathname);
      const res = await fetch(input.base + url.pathname + url.search, {
        method: o.method,
        headers: o.header,
        body: o.data === undefined ? undefined : JSON.stringify(o.data),
      });
      const body = await res.json();
      if (f.hold) await f.hold;
      o.success({ statusCode: res.status, data: body });
    } catch (e) {
      o.fail(e);
    }
  };
  return f;
}
async function service(token) {
  const f = mount("service/index", token);
  await f.page.onLoad({ type: source.sourceType, id: source.sourceId });
  await f.page.onShow();
  return f;
}
async function command(url, body) {
  const res = await fetch(input.base + "/api/admin/" + url, {
    method: "POST",
    headers: {
      Cookie: input.cookie,
      "X-CSRF-Token": input.csrf,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const reply = await res.json();
  assert.equal(res.status, 200, url + " " + reply.reasonCode);
  return reply.data;
}
async function progress() {
  const status = mount("factory/status");
  await status.page.onLoad({ id: input.id });
  await status.page.load();
  assert.equal(status.page.data.application.id, input.id);
  assert.equal(status.page.data.application.auditStatus, "pending");
  const entry = fs.readFileSync(
    path.resolve(__dirname, "../miniprogram/pages/factory/status.wxml"),
    "utf8",
  );
  assert.match(
    entry,
    /\/pages\/service\/index\?type=factory_onboarding&id=\{\{application.id\}\}/,
  );
  status.page.onUnload();
  let f = await service(),
    p = f.page;
  assert(p.data.checked, p.data.message);
  assert.equal(p.data.progress, null);
  await p.prepare();
  const id = p.data.context.id;
  assert(p.data.card.contextToken);
  await p.returned();
  assert.equal(p.data.progress, null);
  assert.equal(p.data.context.contextStatus, "created");
  assert.equal(p.data.card, null);
  p.failed();
  assert.match(p.data.message, /未能打开/);
  assert.equal(f.requests.filter((x) => x.startsWith("POST")).length, 1);
  const admin = await command("customer-service-cases", {
    userId: input.user,
    source,
    contextId: id,
    demand: "测试本人入驻进度",
    mainConflict: "仅限后台的备注",
  });
  p.onHide();
  await p.onShow();
  assert.equal(p.data.progress.caseNo, admin.caseNo);
  assert.equal(p.data.progress.status, "registered");
  assert.deepEqual(Object.keys(p.data.progress).sort(), ["caseNo", "status"]);
  assert(!JSON.stringify(p.data).includes("仅限后台"));
  p.onUnload();
  await command("customer-service-cases/" + admin.id + "/resolve", {
    version: admin.version,
    resultRefs: [],
    resolutionSummary: "内部解决说明",
  });
  f = await service();
  p = f.page;
  assert.equal(p.data.context.id, id);
  assert.equal(p.data.progress.status, "resolved");
  assert(!JSON.stringify(p.data).includes("内部解决说明"));
  assert(f.requests.includes("GET /api/me/service-contexts/" + id));
  p.back();
  assert.equal(f.nav.at(-1), "/pages/factory/status?id=" + input.id);
  // 当前卡保持已解决，独立登记的另一案件按同来源的最新进度展示。
  const active = await command("customer-service-cases", {
    userId: input.user,
    source,
    contextId: null,
    demand: "新的人工登记",
    mainConflict: "后台处理",
  });
  await p.returned();
  assert.equal(p.data.progress.caseNo, active.caseNo);
  assert.equal(p.data.progress.status, "registered");
  let release;
  f.hold = new Promise((done) => (release = done));
  const late = p.refresh();
  f.session.replace(input.other);
  release();
  await late;
  assert.equal(p.data.context, null);
  assert.equal(p.data.progress, null);
  assert.equal(p.data.record, null);
  p.onUnload();
  const denied = await service(input.other);
  assert.equal(denied.page.data.checked, false);
  assert.equal(denied.page.data.progress, null);
  assert.equal(denied.requests.filter((x) => x.startsWith("POST")).length, 0);
  denied.page.onUnload();
  console.log(
    "未发送返回、调起失败、人工登记、解决后重新打开、独立案件进度、原申请回跳、跨账号及迟到响应均通过",
  );
}
async function reconnect() {
  const f = await service();
  const p = f.page;
  assert.equal(p.data.context.id, input.expired);
  assert.equal(p.data.context.contextStatus, "expired");
  await p.prepare();
  assert(p.data.card.contextToken);
  assert.notEqual(p.data.context.id, input.expired);
  assert.equal(p.data.progress.status, "registered");
  p.onUnload();
  console.log("过期重进只读；点击重新准备生成新卡，保留原来源案件进度");
}
async function rates() {
  const f = mount(null);
  f.load("components/coupon-offers/index.js");
  const d = f.component;
  function openComponent() {
    const c = {
      ...d.methods,
      data: structuredClone(d.data),
      setData(v) {
        Object.assign(this.data, v);
      },
      triggerEvent() {},
    };
    d.lifetimes.attached.call(c);
    return c;
  }
  const home = openComponent();
  await home.open(input.user);
  assert(home.data.visible);
  const wallet = openComponent();
  await wallet.open();
  for (const offer of input.offers) {
    const expected = offer.bp ? "租金减免 " + offer.bp / 100 + "%" : "¥12.50";
    for (const c of [home, wallet]) {
      while (
        !c.data.items.some((x) => x.activityId === offer.id) &&
        c.data.more
      )
        await c.more();
      assert.equal(
        c.data.items.find((x) => x.activityId === offer.id)?.value,
        expected,
      );
    }
    await wallet.claim({ currentTarget: { dataset: { id: offer.id } } });
    assert(wallet.data.items.find((x) => x.activityId === offer.id).claimed);
  }
  const held = mount("coupons/index");
  await held.page.onShow();
  for (const o of input.offers) {
    const row = held.page.data.items.find((x) => x.name === o.name);
    assert(row, "已领取券在券包中");
    assert.equal(row.value, o.bp ? "租金减免 " + o.bp / 100 + "%" : "¥12.50");
    console.log("首页、券包活动、持券一致", o.bp, row.value);
  }
  held.page.onUnload();
  d.lifetimes.detached.call(home);
  d.lifetimes.detached.call(wallet);
  await checkWebRates();
}
async function checkWebRates() {
  const { chromium } = require(
    process.env.MJ_PLAYWRIGHT_MODULE ||
      "/Users/mbro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core",
  );
  const cwd = path.resolve(__dirname, "../admin-web"),
    dist = path.resolve(cwd, "../../mujian-backend/target/d7r/admin"),
    origin = "http://127.0.0.1:5197";
  const vite = spawn(
    process.execPath,
    [
      path.join(cwd, "node_modules/vite/bin/vite.js"),
      "preview",
      "--outDir",
      dist,
      "--host",
      "127.0.0.1",
      "--port",
      "5197",
      "--strictPort",
    ],
    {
      cwd,
      env: { ...process.env, MJ_TEST_API_TARGET: input.base },
      stdio: "ignore",
    },
  );
  let browser;
  try {
    for (let i = 0; i < 100; i++) {
      if (vite.exitCode !== null) throw Error("专用浏览器端口不可用");
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 80));
    }
    browser = await chromium.launch({
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
    });
    const c = await browser.newContext(),
      p = await c.newPage();
    p.setDefaultTimeout(8000);
    await c.addCookies([
      { name: "mj_admin_dev", value: input.cookie.split("=")[1], url: origin },
    ]);
    await p.goto(origin + "/operations/templates");
    await p.getByRole("button", { name: "新建草稿" }).click();
    await p.getByLabel("优惠类型").selectOption("percentage");
    const rate = p.getByRole("spinbutton", { name: /租金减免比例/ });
    for (const bp of [1, 1000, 10000]) {
      await rate.fill(String(bp));
      await p
        .getByText("，当前" + bp + " BP（租金减免 " + bp / 100 + "%）", {
          exact: true,
        })
        .waitFor();
    }
    const name = "R1Chrome" + Date.now();
    await p.getByLabel("模板编码", { exact: true }).fill(name);
    await p.getByLabel("模板名称", { exact: true }).fill(name);
    await p.getByLabel("有效天数", { exact: true }).fill("4");
    await p.getByRole("button", { name: "保存草稿" }).click();
    await p
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button")
      .click();
    await p.getByText("10000 BP（租金减免 100%）", { exact: true }).waitFor();
    await p.reload();
    const o = input.offers.find((x) => x.bp === 1000);
    await p.getByRole("button", { name: o.template, exact: true }).click();
    await p.getByText("1000 BP（租金减免 10%）", { exact: true }).waitFor();
    console.log("管理端生产构建 Chrome，三个 BP 换算和已发布模板详情通过");
  } finally {
    await browser?.close();
    vite.kill();
  }
}
({ progress, reconnect, rates })[input.mode]().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
