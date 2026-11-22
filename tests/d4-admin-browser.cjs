// 读取正在运行的隔离夹具，使用真实Vue页面、实际订单和本人测试会话，不改共享代理。
const fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
const { chromium } = require(
  process.env.MJ_PLAYWRIGHT_MODULE ||
    '/Users/mbro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core',
);
(async () => {
  const { api, cookie, batch, factory, order, out } = JSON.parse(
    fs.readFileSync(0, 'utf8'),
  );
  if (
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(api) ||
    !cookie.startsWith('mj_admin_dev=')
  )
    throw Error('仅允许隔离测试会话');
  const cwd = path.resolve(__dirname, '../admin-web');
  const app = spawn(
    process.execPath,
    [
      path.join(cwd, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5189',
      '--strictPort',
    ],
    { cwd, env: { ...process.env, MJ_TEST_API_TARGET: api }, stdio: 'ignore' },
  );
  let browser;
  try {
    const origin = 'http://127.0.0.1:5189';
    for (let i = 0; i < 100; i++) {
      if (app.exitCode !== null) throw Error('隔离前端未启动');
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
      executablePath:
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    });
    await context.addCookies([
      {
        name: 'mj_admin_dev',
        value: cookie.slice('mj_admin_dev='.length),
        url: origin,
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.name));
    await page.goto(origin + '/trading/settlements');
    const row = page.getByRole('row').filter({ hasText: batch });
    await row.getByRole('button', { name: '查看' }).click({ timeout: 20000 });
    await page.getByRole('heading', { name: '分佣与解冻记录' }).waitFor();
    await page.getByRole('link', { name: '结算追溯' }).first().waitFor();
    if (
      await page.getByText('服务返回了无法识别的响应', { exact: false }).count()
    )
      throw Error('菜单会话契约错误');
    await page.screenshot({
      path: path.join(out, 'admin-settlement.png'),
      fullPage: true,
    });
    let acknowledgements = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/acknowledgements') && r.method() === 'POST')
        acknowledgements++;
    });
    await page.getByRole('button', { name: '记录已阅' }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    if (acknowledgements) throw Error('取消已阅产生写请求');
    await page.getByRole('button', { name: '记录已阅' }).click();
    await page.getByRole('textbox').fill('浏览器复核测试');
    await page.getByRole('button', { name: '确认已阅' }).click();
    await page.getByText('已记录本次核对。', { exact: true }).waitFor();
    if (acknowledgements !== 1) throw Error('确认次数异常');
    await page.goto(origin + '/fulfillment/expenses');
    await page.locator('select').first().selectOption('approved');
    await page.getByRole('button', { name: '查询', exact: true }).click();
    const expense = page.getByRole('row').filter({ hasText: order });
    await expense.getByRole('button').click();
    await page.getByRole('heading', { name: '往返核销汇总' }).waitFor();
    await page.screenshot({
      path: path.join(out, 'admin-expense.png'),
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow || errors.length)
      throw Error('页面溢出或脚本异常 ' + errors.join(','));
    console.log(
      '真实隔离HTTP：结算列表与明细、已阅取消0次/确认1次、核销详情、1440px截图通过。',
    );
  } finally {
    if (browser) await browser.close();
    app.kill();
  }
})().catch((e) => {
  console.error(e.message.replace(/https?:\/\/[^ ]+/g, '[local]'));
  process.exitCode = 1;
});
