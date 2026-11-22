// 运行原生页面逻辑和既有 HTTP 客户端，仅将 wx.request 接到隔离 Spring 随机端口。
const assert = require('node:assert/strict');
const { fixture } = require('./support/planning-fixture.cjs');
const fs = require('node:fs');

async function run({ base, token, mode, order }) {
  assert.match(base, /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/);
  const expense = mode==='expense';
  let writes = 0;
  function open() {
    const f = fixture(expense ? 'factory/expense' : 'orders/fulfillment', {}, true);
    f.wx.setNavigationBarTitle=()=>{};
    f.session.replace(token);
    f.wx.request = async opt => {
      const url = new URL(opt.url);
      try {
        const response = await fetch(base+url.pathname+url.search,{
          method: opt.method, headers:opt.header, body:opt.data===undefined?undefined:JSON.stringify(opt.data),
        });
        if(opt.method==='POST' && response.ok && url.pathname.endsWith(expense?'/transport-expense/save':'/return-shipment/save'))writes++;
        const data = await response.json();
        opt.success({ data,statusCode:response.status,header:Object.fromEntries(response.headers) });
      } catch (e) { opt.fail(e); }
    };
    return f.page;
  }
  const q=expense?{id:order}:{id:order,view:'shipment'};
  const first=open();await first.onLoad(q);await first.onShow();
  try {
    assert.ok(first.data.detail,first.data.message);
    if(expense){
      assert.equal(first.data.writable,true);
      first.edit({currentTarget:{dataset:{leg:0,field:'carrierOrderNo'}},detail:{value:'沪去程Ab209'}});
      first.edit({currentTarget:{dataset:{leg:1,field:'carrierOrderNo'}},detail:{value:'京返程Xy802'}});
      await first.save();
    }else{
      first.edit({currentTarget:{dataset:{field:'trackingNo'}},detail:{value:'归还沪Ab901'}});
      await first.submit({currentTarget:{dataset:{action:'save'}}});
    }
    assert.equal(writes,1,first.data.message);
  }finally{first.onUnload();}
  const reopened=open();await reopened.onLoad(q);await reopened.onShow();
  try{
    assert.ok(reopened.data.detail,reopened.data.message);
    if(expense) assert.deepEqual(Array.from(reopened.data.legs,l=>l.carrierOrderNo),['沪去程Ab209','京返程Xy802']);
    else assert.equal(reopened.data.form.trackingNo,'归还沪Ab901');
    console.log('隔离 HTTP 与原生页面逻辑通过',mode,'保存一次，重开回显一致');
  }finally{reopened.onUnload();}
}
run(JSON.parse(fs.readFileSync(0,'utf8'))).catch(e=>{console.error(e.message);process.exitCode=1;});
