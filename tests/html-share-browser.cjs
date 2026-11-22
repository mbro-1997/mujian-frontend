const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.MJ_PLAYWRIGHT_MODULE ||
  "/Users/mbro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core");

async function issue(fixture, hidePrice) {
  const url = fixture.base + "/api/me/schemes/" + fixture.id;
  const headers = { Authorization: "Bearer " + fixture.owner };
  const detail = await fetch(url, {headers});
  assert.equal(detail.status, 200);
  const {version} = (await detail.json()).data;
  const response = await fetch(url + "/share", {
    method: "POST",
    headers: {...headers, "Content-Type": "application/json", "Idempotency-Key": randomUUID()},
    body: JSON.stringify({expectedVersion: version, hidePrice}),
  });
  assert.equal(response.status, 200);
  return (await response.json()).data.share.token;
}

async function run(fixture) {
  const output = path.resolve(fixture.evidence);
  const hidden = fixture.hidden || await issue(fixture, true);
  const priced = fixture.priced || await issue(fixture, false);
  assert.notEqual(hidden, priced);
  const browser = await chromium.launch({
    executablePath: process.env.MJ_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true,
  });
  try {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    const errors = [];
    let reads = 0, sentCredentials = false;
    page.on("pageerror", err => errors.push(err.name));
    page.on("request", request => {
      if (!request.url().includes("/api/public/scheme-shares/")) return;
      reads++;
      const h = request.headers();
      if (h.authorization || h.cookie) sentCredentials = true;
    });
    // Isolated fixtures have no media host. Exercise the page's real image failure path.
    await page.route("https://example.invalid/**", route => route.abort("failed"));
    const screen = name => page.screenshot({path: path.join(output, "20261118-web-" + name + ".png"), fullPage: true});
    const open = token => page.goto(fixture.base + "/share/scheme.html?token=" + encodeURIComponent(token));
    async function expectSnapshot(token, hidePrice, quantity) {
      const received = page.waitForResponse(r => r.url().endsWith("/" + token) && r.status() === 200);
      await open(token);
      const data = (await (await received).json()).data;
      await page.locator(".prop-row").first().waitFor();
      assert.equal(data.hidePrice, hidePrice);
      assert.equal(await page.locator(".share-banner h1").innerText(), data.name);
      assert.equal(await page.locator(".prop-price").count(), hidePrice ? 0 : data.items.length);
      if (hidePrice) {
        assert.doesNotMatch(JSON.stringify(data), /"(?:prices|estimatedDailyRentFen|dailyRentPriceFen|depositAmountFen)"/);
        assert.doesNotMatch(await page.locator("main").innerText(), /¥|预估日租/);
      }
      if (quantity !== undefined) {
        const index = data.items.findIndex(item => item.display.skuId === fixture.skuId);
        assert.ok(index >= 0);
        assert.equal(data.items[index].quantity, quantity);
        assert.ok((await page.locator(".prop-row").nth(index).innerText()).includes("数量 " + quantity));
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      return data.name;
    }

    const oldName = await expectSnapshot(hidden, true, fixture.original);
    await screen("hidden");
    const newName = await expectSnapshot(priced, false, fixture.after);
    await screen("priced");
    if (fixture.original !== undefined) assert.notEqual(newName, oldName);
    assert.equal(await expectSnapshot(hidden, true, fixture.original), oldName);

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    assert.equal(await page.locator(".prop-row").count(), 0);
    if (fixture.advance) {
      // Only the explicitly supplied isolated backend test clock may be moved.
      assert.equal(new URL(fixture.advance).hostname, "127.0.0.1");
      const advanced = await fetch(fixture.advance, {method: "POST", body: String(7 * 86400 + 1)});
      assert.equal(advanced.status, 204);
    }
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
    if (fixture.advance) {
      await page.getByRole("heading", {name: "分享链接已失效"}).waitFor();
    } else {
      await page.locator(".prop-row").first().waitFor();
      await open(fixture.expired || "0".repeat(43));
      await page.getByRole("heading", {name: "分享链接已失效"}).waitFor();
    }
    assert.equal(await page.locator(".prop-row").count(), 0);
    assert.equal(await page.locator(".share-banner, .prop-price").count(), 0);
    await screen("expired");
    assert.equal(sentCredentials, false);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "20261118-web-results.json"), JSON.stringify({
      browser: "Chrome", viewport: [390, 844], anonymousReads: reads, distinctTokens: true,
      revisitedFirstSnapshot: true, hiddenPriceFieldsAbsent: true, reentryClearsContent: true,
      expiredOnSameLink: Boolean(fixture.advance), changedQuantityVerified: fixture.original !== undefined,
      imageHost: "isolated fixture; image request failed", pageErrors: errors,
    }, null, 2) + "\n");
  } finally { await browser.close(); }
}

(async () => {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  await run(JSON.parse(input));
  console.log("匿名分享网页已通过真实 HTTP 和 Chrome 检查");
})().catch(error => {
  console.error(error.message.replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]"));
  process.exitCode = 1;
});
