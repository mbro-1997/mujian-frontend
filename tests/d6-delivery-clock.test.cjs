const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { fixture } = require('./support/planning-fixture.cjs');
const root = path.resolve(__dirname, '../miniprogram');
const compiler = process.env.MJ_WX_COMPILER_DIR || path.join(process.env.HOME, 'Applications/微信开发者工具.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec');
const runtime = vm.createContext({window:{}, console});
vm.runInContext(execFileSync(path.join(compiler, 'wcc'), ['pages/custom/detail.wxml', 'pages/factory/custom-detail.wxml'], {cwd:root, encoding:'utf8'}), runtime);
execFileSync(path.join(compiler, 'wcsc'), ['pages/custom/detail.wxss', 'pages/factory/custom-detail.wxss', 'styles/custom.wxss', 'styles/surfaces.wxss'], {cwd:root, encoding:'utf8'});
function text(node) {
  return typeof node !== 'object' ? String(node) : (node.children || []).map(text).join(' ');
}
function render(page, factory = false) {
  return text(runtime.$gwx('pages/' + (factory ? 'factory/custom-detail' : 'custom/detail') + '.wxml')(page.data));
}
async function load(f, result, now = '2026-11-24T10:00:00.000+08:00') {
  f.setNow(Date.parse(now));
  f.page.onLoad({id:result.id, kind:'orders'});
  const start = f.pending.length;
  const run = f.page.load(() => true);
  f.pending[start].args[5].onServerTime(Date.parse('2026-11-24T10:00:00.000+08:00'));
  f.pending[start].resolve(result);
  await new Promise(resolve => setImmediate(resolve));
  if (!f.page.data.factory) f.pending[start+1].resolve([]);
  await run;
}
const sample = () => ({
  id:'order-a', state:'pending_acceptance', version:4, currentDeliveryId:'delivery-a', acceptanceState:'running',
  acceptanceDeadlineAt:'2026-11-26T10:00:00.123+08:00', allowedActions:[], extensions:[], items:[],
  deliveries:[{id:'delivery-a', deliveryVersion:1, mode:'factory_delivery', state:'delivered', deliveredAt:'2026-11-20T10:00:00.000+08:00', evidence:[], remark:'已送达'}],
});
test('晚提交配送展示后端截止，手机时间和实际送达时间不参与推算', async () => {
  const f=fixture('custom/detail');
  try {
    for (const phoneTime of ['2020-01-01T00:00:00.000+08:00','2040-01-01T00:00:00.000+08:00']) {
      await load(f,sample(),phoneTime);
      assert.equal(f.page.data.detail.acceptanceTime,'2026年11月26日 10:00:00.123（北京时间）');
      assert.match(render(f.page), /验收截止 2026年11月26日 10:00:00.123/);
      assert.match(render(f.page), /2026年11月20日/);
    }
  } finally { f.page.onHide(); }
});
test('返工详情展示当前版本保存截止，旧交付记录不覆盖', async () => {
  const f=fixture('custom/detail'), d=sample();
  d.deliveries[0].state='exception';
  d.deliveries.push({...d.deliveries[0],id:'delivery-b',deliveryVersion:2,state:'delivered',deliveredAt:'2026-11-21T10:00:00.000+08:00'});
  d.currentDeliveryId='delivery-b';
  d.acceptanceDeadlineAt='2026-11-27T12:34:56.789+08:00';
  try {
    await load(f,d);
    assert.match(render(f.page), /验收截止 2026年11月27日 12:34:56.789/);
    assert.equal(f.page.data.detail.deliveries.length,2);
  } finally { f.page.onHide(); }
});
test('自提登记显示待买家确认，自提确认返回截止后才展示验收截止', async () => {
  const f=fixture('custom/detail'), d=sample();
  d.state='delivering';d.acceptanceState='not_started';d.acceptanceDeadlineAt=null;
  Object.assign(d.deliveries[0],{mode:'buyer_pickup',state:'awaiting_pickup_confirmation',deliveredAt:null,pickupRegisteredAt:'2026-11-20T10:00:00.000+08:00'});
  try {
    await load(f,d);
    assert.match(render(f.page), /待买家确认自提/);
    assert.doesNotMatch(render(f.page), /验收截止/);
    assert.equal(f.page.data.detail.acceptanceTime,'');
    d.state='pending_acceptance';d.acceptanceState='running';d.acceptanceDeadlineAt='2026-11-26T10:00:00.123+08:00';
    Object.assign(d.deliveries[0],{state:'delivered',deliveredAt:'2026-11-24T10:00:00.123+08:00'});
    await load(f,d);
    assert.doesNotMatch(render(f.page), /待买家确认自提/);
    assert.match(render(f.page), /验收截止 2026年11月26日 10:00:00.123/);
  } finally { f.page.onHide(); }
});
test('原工厂交付页编译后显示实际送达、凭证和提交提示，自提不提前承诺起算', async () => {
  const f=fixture('factory/custom-detail');
  const d=sample();d.allowedActions=['deliverCustomOrder','registerCustomPickup'];
  try {
    await load(f,d);
    for (const action of d.allowedActions) {
      f.page.choose({currentTarget:{dataset:{k:action}}});
      const visible=render(f.page,true);
      assert.match(visible,/添加办理凭证/);
      if(action==='deliverCustomOrder') {
        assert.match(visible,/实际送达时间/);
        assert.match(visible,/提交交付后，买家有 48 小时验收.*确认登记实际交付/);
      } else {
        assert.match(visible,/实际交接时间/);
        assert.doesNotMatch(visible,/提交交付后，买家有 48 小时验收/);
      }
    }
  } finally { f.page.onHide(); }
});
