// 只使用隔离 HTTP 夹具及临时管理员；从隔离 Redis 读取当前挑战作可重复验证。
const fs = require("node:fs"),
  path = require("node:path"),
  { spawn, execFileSync } = require("node:child_process");
const { chromium } = require(
  process.env.MJ_PLAYWRIGHT_MODULE ||
    "/Users/mbro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core",
);
(async () => {
  const { api, username, password, out, usage } = JSON.parse(
    fs.readFileSync(0, "utf8"),
  );
  if (
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(api) ||
    new URL(api).port === "18080" ||
    !username.startsWith("d7.")
  )
    throw Error("需要独立夹具");
  const cwd = path.resolve(__dirname, "../admin-web"),
    origin = "http://127.0.0.1:5197";
  const built = path.join(out, "admin");
  const preview = fs.existsSync(path.join(built, "index.html"));
  const server = spawn(
    process.execPath,
    [
      path.join(cwd, "node_modules/vite/bin/vite.js"),
      ...(preview ? ["preview", "--outDir", built] : []),
      "--host",
      "127.0.0.1",
      "--port",
      "5197",
      "--strictPort",
    ],
    { cwd, env: { ...process.env, MJ_TEST_API_TARGET: api }, stdio: "ignore" },
  );
  let browser;
  try {
    for (let i = 0; i < 90; i++) {
      if (server.exitCode !== null) throw Error("独立前端端口未启动");
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
    const ctx = await browser.newContext(),
      p = await ctx.newPage();
    p.setDefaultTimeout(12000);
    const errors = [];
    p.on("pageerror", (err) => errors.push(err.message));
    p.on("response", (r) => {
      if (r.url().includes("/api/") && r.status() >= 400)
        console.log(new URL(r.url()).pathname, r.status());
    });
    await p.goto(origin + "/workbench/dashboard");
    await p.getByAltText("登录验证码").waitFor();
    const cookie = (await ctx.cookies()).find((c) => c.name === "mj_admin_dev");
    const stored = execFileSync(
      "redis-cli",
      [
        "-h",
        "127.0.0.1",
        "-p",
        "16397",
        "-n",
        "5",
        "--raw",
        "GET",
        "mj:test:admin-captcha:" + cookie.value,
      ],
      { encoding: "utf8" },
    ).trim();
    if (stored.length <= 33) throw Error("隔离挑战不存在");
    await p.getByPlaceholder("请输入用户名").fill(username);
    await p.getByPlaceholder("请输入登录密码").fill(password);
    await p.locator("input[autocomplete=off]").last().fill(stored.slice(33));
    await p.locator("button[type=submit]").click();
    await p.waitForURL((u) => !u.pathname.includes("login"));
    await p.goto(origin + "/workbench/dashboard");
    await p.getByRole("heading", { name: "运营总览", exact: true }).waitFor();
    await p.getByText("统计时点", { exact: true }).waitFor();
    await p.reload();
    await p.getByText("统计时点", { exact: true }).waitFor();
    for (const [route, title] of [
      ["/workbench/cases", "统一案件"],
      ["/system/accounts", "管理员账号"],
      ["/system/role-grants", "角色授权"],
      ["/system/menus", "菜单权限"],
      ["/system/audits", "操作审计"],
      ["/system/rules", "平台规则"],
      ["/accounts/users", "用户查询"],
      ["/operations/templates", "券模板"],
      ["/operations/activities", "领券活动"],
      ["/operations/rewards", "首次奖励规则"],
      ["/operations/facts", "首次奖励记录"],
      ["/operations/batches", "主动发放历史"],
      ["/operations/coupons", "用户持券"],
      ["/operations/coupon-issue", "主动发放优惠券"],
    ]) {
      await p.goto(origin + route);
      await p
        .getByRole("heading", { name: title, exact: false })
        .first()
        .waitFor();
      if (route === "/workbench/cases") {
        await p
          .getByRole("button", { name: "登记客服案件", exact: true })
          .click();
        await p.getByText("主要矛盾", { exact: true }).last().waitFor();
      }
      if (route === "/operations/templates") {
        const name = "D7Chrome" + Date.now();
        await p.getByRole("button", { name: "新建草稿" }).click();
        await p.getByLabel("模板编码", { exact: true }).fill(name);
        await p.getByLabel("模板名称", { exact: true }).fill(name);
        await p.getByLabel("面额（分）", { exact: true }).fill("100");
        await p.getByLabel("有效天数", { exact: true }).fill("7");
        await p.getByRole("button", { name: "保存草稿" }).click();
        const row = p.getByRole("row").filter({ hasText: name });
        await row.getByRole("button").click();
        await p.getByRole("button", { name: "发布", exact: true }).click();
        await p.getByRole("button", { name: "复制为新版本" }).click();
        if (
          (await p.getByLabel("模板编码", { exact: true }).inputValue()) !==
          name
        )
          throw Error("模板复制遗漏原编码");
      }
      if (route === "/operations/coupons") {
        const { usageId, couponId, owner } = usage;
        await p.getByLabel("用户", { exact: true }).fill(owner);
        await p.getByRole("button", { name: "查询", exact: true }).click();
        await p.getByRole("button", { name: couponId, exact: true }).click();
        await p
          .getByRole("button", { name: "查看使用记录 " + usageId + " 的分摊" })
          .click();
        await p.getByRole("columnheader", { name: "分摊优惠（分）" }).waitFor();
        console.log("browser frozen allocation via held coupon ok");
      }
      console.log("browser", route, "ok");
    }
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      "D7 admin browser:",
      preview ? "production assets" : "development source",
      "15 routes",
    );
    await p.screenshot({ path: path.join(out, "browser-issue.png") });
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
