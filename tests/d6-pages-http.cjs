// 正式小程序页面使用隔离 HTTP；wx 授权及原生支付仅作端侧替身。
const fs = require("node:fs"),
  assert = require("node:assert/strict");
const { fixture } = require("./support/planning-fixture.cjs");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
assert.match(input.base, /^http:\/\/127\.0\.0\.1:\d+$/);
const event = (dataset, value) => ({
  currentTarget: { dataset },
  detail: { value },
});
async function mount(name, q, supplier = false) {
  const f = fixture(
    name,
    { roleCode: supplier ? "supplier" : "demander" },
    true,
  );
  f.session.replace(supplier ? input.supplier : input.token);
  f.page.route = "pages/" + name;
  f.wx.getRandomValues = (o) =>
    o.success({
      randomValues: crypto.getRandomValues(new Uint8Array(16)).buffer,
    });
  f.wx.request = async (o) => {
    try {
      const u = new URL(o.url),
        r = await fetch(input.base + u.pathname + u.search, {
          method: o.method,
          headers: o.header,
          body: o.data === undefined ? undefined : JSON.stringify(o.data),
        });
      o.success({ statusCode: r.status, data: await r.json() });
    } catch (e) {
      o.fail(e);
    }
  };
  f.wx.requestPayment = (o) => {
    assert.equal(o.package, "prepay_id=test");
    o.complete();
  };
  await f.page.onLoad(q);
  await f.page.onShow();
  assert.ok(!f.page.data.message, f.page.data.message);
  return f;
}
async function act(f, key, edit) {
  const p = f.page;
  await p.choose(event({ k: key }));
  assert.equal(p.data.active, key, p.data.message);
  if (edit) edit(p);
  await p.confirm();
  assert.ok(!p.data.message, p.data.message);
}
async function review() {
  const { chromium } = require(
    process.env.MJ_PLAYWRIGHT_MODULE ||
      "/Users/mbro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core",
  );
  const { spawn } = require("node:child_process"),
    path = require("node:path"),
    cwd = path.resolve(__dirname, "../admin-web"),
    origin = "http://127.0.0.1:5193";
  const server = spawn(
    process.execPath,
    [
      path.join(cwd, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5193",
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
    for (let i = 0; i < 150; i++) {
      if (server.exitCode !== null) throw Error("隔离管理端端口不可用");
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
    });
    const ctx = await browser.newContext();
    await ctx.addCookies([
      {
        name: "mj_admin_dev",
        value: input.cookie.slice("mj_admin_dev=".length),
        url: origin,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    const p = await ctx.newPage();
    p.setDefaultTimeout(10000);
    await p.goto(origin + "/custom/after-sales");
    await p
      .locator("tbody tr")
      .filter({ hasText: input.order })
      .getByRole("button", { name: "查看" })
      .click();
    await p.getByLabel("办理方式").selectOption("rework");
    await p.getByLabel("商品退款（分）").fill("20000");
    await p.getByLabel("办理依据").fill("补做桌角及差价");
    const result = p.waitForResponse(
      (r) => r.url().endsWith("/resolution") && r.request().method() === "POST",
    );
    await p.getByRole("button", { name: "确认办理" }).click();
    assert.equal((await result).status(), 200);
    await p.getByText(/本次核准商品 ¥200.00/).waitFor();
    return { order: input.order };
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}
async function run() {
  if (input.mode === "review") return review();
  if (input.mode === "read") {
    const f = await mount("custom/detail", { id: input.order, kind: "orders" });
    assert.equal(f.page.data.detail.state, "completed");
    assert.equal(f.page.data.detail.refundAmount, "200.00");
    return { order: input.order };
  }
  const f = await mount("custom/form", {
      factoryId: input.factory,
      skuId: input.sku,
    }),
    p = f.page;
  for (const [k, v] of Object.entries(input.form))
    if (!["factoryId", "items"].includes(k))
      p.change(event({ path: "form." + k }, v));
  for (const [i, item] of input.form.items.entries()) {
    if (i) p.add();
    for (const [k, v] of Object.entries(item))
      p.change(event({ path: "form.items[" + i + "]." + k }, v));
  }
  await p.save(event({ submit: true }));
  assert.ok(!p.data.message, p.data.message);
  const id = p.data.id;
  assert.ok(f.nav.at(-1).endsWith(id));
  const factory = await mount(
    "factory/custom-detail",
    { id, kind: "requirements" },
    true,
  );
  await act(factory, "startCustomReview");
  await act(factory, "saveCustomQuote", (p) => {
    for (const [k, v] of Object.entries({
      freightYuan: "300.00",
      productionDays: 5,
      promisedDate: input.form.expectedCompletionDate,
      revisionTerms: "一次",
      includedAndExcluded: "含制作",
      afterSaleTerms: "可返工",
    }))
      p.edit(event({ path: "terms." + k }, v));
    for (let i = 0; i < 2; i++)
      p.edit(event({ path: "terms.items[" + i + "].unitPriceYuan" }, "3200.00"));
  });
  await act(factory, "publishCustomQuote");
  const buyer = await mount("custom/detail", { id, kind: "requirements" });
  await act(buyer, "acceptCustomQuote", (p) => {
    buyer.wx.navigateTo = (o) =>
      o.events.addressSelected({ addressId: input.address });
    p.address();
  });
  const next = buyer.nav.at(-1);
  assert.match(next, /kind=orders&id=[a-f0-9]{32}$/);
  const order = next.split("id=").pop(),
    result = await mount("custom/detail", { id: order, kind: "orders" });
  assert.equal(result.page.data.detail.amount, "9900.00");
  return { order, payment: result.page.data.detail.payment.id };
}
run()
  .then((data) => process.stdout.write(JSON.stringify(data)))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
