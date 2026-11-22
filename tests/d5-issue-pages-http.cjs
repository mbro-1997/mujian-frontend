// 两端正式页面使用同一隔离订单；浏览器会话和买家令牌只从标准输入读取。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawn,execFileSync} = require('node:child_process');
const vm=require('node:vm');
const {fixture} = require('./support/planning-fixture.cjs');
const {chromium} = require(process.env.MJ_PLAYWRIGHT_MODULE ||
  '/Users/mbro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');

// 用微信编译器生成正式页面渲染树，核对当前身份可见的按钮和金额。
async function renderMini(browser,name,data,button,out) {
  const root=path.resolve(__dirname,'../miniprogram');
  const tools=process.env.MJ_WX_COMPILER_DIR || '/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec';
  const type=name.split('/')[1];
  const runtime=vm.createContext({window:{},console});
  vm.runInContext(execFileSync(path.join(tools,'wcc'),['pages/'+name+'.wxml','templates/'+type+'.wxml'],{cwd:root,encoding:'utf8'}),runtime);
  const css=execFileSync(path.join(tools,'wcsc'),['pages/'+name+'.wxss','styles/trading.wxss',...(type==='fulfillment'?['templates/fulfillment.wxss']:[])],{cwd:root,encoding:'utf8'});
  const tree=runtime.$gwx('pages/'+name+'.wxml')(data);
  const screen=await browser.newPage({viewport:{width:390,height:844}});
  try{
    await screen.addStyleTag({content:'body{margin:0;font-family:sans-serif}wx-view,wx-page,wx-textarea,wx-picker{display:block}wx-button{display:inline-block}'+css.replaceAll('%%HERESUFFIX%%','')});
    await screen.evaluate(tree=>{
      function mount(node){
        if(typeof node!=='object')return document.createTextNode(String(node));
        const el=document.createElement(node.tag);
        for(const k of ['class','style'])if(node.attr?.[k])el.setAttribute(k,node.attr[k]);
        for(const child of node.children || [])el.appendChild(mount(child));return el;
      }
      document.body.appendChild(mount(tree));
    },tree);
    assert.ok(await screen.locator('wx-button').filter({hasText:button}).first().isVisible(),name+' 操作入口未渲染');
    await screen.screenshot({path:out,fullPage:true});
  }finally{await screen.close();}
}
async function run({base, cookie, order, issue, token, supplier, mode, out}) {
  assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
  assert.ok(cookie.startsWith('mj_admin_dev='));
  const cwd=path.resolve(__dirname,'../admin-web'),origin='http://127.0.0.1:5193';
  const server=spawn(process.execPath,[path.join(cwd,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5193','--strictPort'],
    {cwd,env:{...process.env,MJ_TEST_API_TARGET:base},stdio:'ignore'});
  let browser;
  try {
    for (let i=0;i<100;i++) {
      if (server.exitCode!==null) throw new Error('隔离管理端未启动');
      try {if ((await fetch(origin)).ok) break;} catch {}
      await new Promise(ok=>setTimeout(ok,100));
    }
    browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:960}});
    await context.addCookies([{name:'mj_admin_dev',value:cookie.slice('mj_admin_dev='.length),url:origin,httpOnly:true,sameSite:'Strict'}]);
    const page=await context.newPage();
    function mini(name,identity){
    const f=fixture(name,{roleCode:name.startsWith('factory/')?'supplier':'demander'},true);
    f.session.replace(identity);
    f.wx.getRandomValues=opts=>opts.success({randomValues:crypto.getRandomValues(new Uint8Array(16)).buffer});
    f.wx.request=async opt=>{
      const url=new URL(opt.url);
      try {
        const response=await fetch(base+url.pathname+url.search,{method:opt.method,headers:opt.header,
          body:opt.data===undefined?undefined:JSON.stringify(opt.data)});
        opt.success({data:await response.json(),statusCode:response.status,header:Object.fromEntries(response.headers)});
      } catch (error) {opt.fail(error);}
    };
      return f;
    }
    if(mode==='overdueSelfSend' || mode==='overduePickup'){
      const pickup=mode==='overduePickup',name=pickup?'factory/fulfillment':'orders/fulfillment';
      const client=mini(name,pickup?supplier:token);
      client.page.onLoad({id:order,view:'shipment'});await client.page.onShow();
      const at=client.page.data.context.serverTime;
      const values=pickup?{actualDate:at.slice(0,10),actualTime:at.slice(11,16),actualSeconds:at.slice(17,23),actualBasis:'司机交接签字'}:
        {handoverMethod:'self_delivery',date:at.slice(0,10),time:at.slice(11,16),seconds:at.slice(17,23),remark:'买家实际开始送回'};
      for(const [field,value] of Object.entries(values))client.page.edit({currentTarget:{dataset:{field}},detail:{value}});
      if(pickup){
        assert.ok(client.page.data.canRecordPickup);await client.page.recordPickup();
      }else await client.page.submit({currentTarget:{dataset:{action:'send'}}});
      assert.equal(client.page.data.fee?.handoverAt,at,client.page.data.message);
      assert.equal(client.page.data.fee.handoverMethod,pickup?'factory_pickup':'self_delivery');
      client.page.onUnload();console.log('逾期租金小程序交接 '+mode+' passed');return;
    }
    if(mode==='overdueDelay' || mode==='overdueMixed'){
      const factory=mini('factory/fulfillment',supplier),buyer=mini('orders/fulfillment',token);
      let orderNo;
      for(const client of [factory,buyer]){
        client.page.onLoad({id:order,view:'returnCheck'});await client.page.onShow();
        assert.ok(client.page.data.fee,client.page.data.message);
        orderNo=client.page.data.detail.orderNo;
        const fee=client.page.data.fee;
        if(mode==='overdueMixed'){
          assert.equal(fee.rentDueFen,16000);assert.equal(fee.liabilityDueFen,15000);
          assert.equal(fee.rentOffsetFen,20000);
        }else assert.equal(fee.elapsedMs,259200001);
        await renderMini(browser,(client===buyer?'orders':'factory')+'/fulfillment',client.page.data,'归还核验',path.join(out,mode+(client===buyer?'-buyer':'-factory')+'.png'));
        client.page.onUnload();
      }
      await page.goto(origin+'/trading/orders');
      await page.getByLabel('业务编号').fill(orderNo);
      await page.getByRole('button',{name:'查询',exact:true}).click();
      await page.locator('tbody tr').filter({hasText:orderNo}).getByRole('button',{name:'查看详情'}).click();
      await page.getByText('归还核验与实际到厂记录',{exact:true}).click();
      if(mode==='overdueDelay'){
        await page.getByLabel('排除工厂延误等非买家时长（秒）').fill('259200.001');
        await page.getByLabel('计费与核责依据').fill('买家已按时备妥，核定全部延误属于工厂');
        const result=page.waitForResponse(r=>r.url().endsWith('/return-check/overdue-fee') && r.request().method()==='POST');
        await page.getByRole('button',{name:'核定费用并抵扣押金'}).click();
        assert.equal((await result).status(),200);
        await page.getByRole('heading',{name:'归还费用 · 已核定'}).waitFor();
      } else {
        await page.locator('tr').filter({hasText:'逾期租金'}).filter({hasText:'160.00'}).waitFor();
        const debt=mini('orders/disputes',token);
        debt.page.onLoad({orderId:order,kind:'compensation-receivables',id:issue});await debt.page.onShow();
        assert.equal(debt.page.data.detail.overdueRentDueFen,16000);assert.equal(debt.page.data.detail.overdueLiabilityDueFen,15000);
        await renderMini(browser,'orders/disputes',debt.page.data,'补缴 ¥310',path.join(out,'overdue-debt.png'));debt.page.onUnload();
      }
      console.log('逾期租金隔离页面 '+mode+' passed');return;
    }
    if(mode==='ordinaryClaimStatus'){
      await page.goto(origin+'/fulfillment/claims?orderId='+order);
      await page.locator('tbody tr td').getByText('执行中',{exact:true}).waitFor();
      await page.locator('tbody tr button').click();
      await page.getByRole('heading',{name:/执行中/}).waitFor();
      for(const factory of [false,true]){
        const f=mini((factory?'factory/':'orders/')+'disputes',factory?supplier:token);
        f.page.onLoad({orderId:order,kind:'claims',id:issue});await f.page.onShow();
        assert.equal(f.page.data.items.find(r=>r.id===issue).listLabel,'执行中');
        assert.equal(f.page.data.detail.label,'执行中');
      }
      console.log('R2 普通索赔列表和详情均保持执行中');return;
    }
    if(mode==='invalidDecision'){
      await page.goto(origin+'/fulfillment/arbitrations?orderId='+order);
      await page.locator('tbody tr button').first().click();
      await page.getByText(/已保存草稿的买家扣款与责任方不符/).waitFor();
      assert.ok(await page.getByRole('button',{name:'确认执行已保存裁决'}).isDisabled());
      assert.ok(await page.getByRole('button',{name:'保存草稿',exact:true}).isDisabled());
      await page.getByLabel('买家责任损失（分）').fill('0');
      assert.ok(await page.getByRole('button',{name:'保存草稿',exact:true}).isEnabled());
      assert.ok(await page.getByRole('button',{name:'确认执行已保存裁决'}).isDisabled());
      console.log('R1 旧草稿必须重新保存后才能确认');return;
    }
    if(mode==='arbitrationStages' || mode==='arbitrationFailure'){
      await page.goto(origin+'/fulfillment/arbitrations?orderId='+order);
      const stage=page.getByLabel('裁决阶段',{exact:true});
      if(mode==='arbitrationStages'){
        await page.getByText(/共 22 条 · 第 1 页/).waitFor();
        await stage.selectOption('awaiting_decision');
        await page.getByText(/共 21 条 · 第 1 页/).waitFor();
        assert.deepEqual(await page.locator('tbody tr td:nth-child(3)').allTextContents(),Array(20).fill('等待裁决'));
        await page.getByRole('button',{name:'下一页'}).click();
        await page.getByText(/共 21 条 · 第 2 页/).waitFor();
        assert.equal(await page.locator('tbody tr').count(),1);
        await stage.selectOption('historical');
        await page.getByText(/共 1 条 · 第 1 页/).waitFor();
        assert.equal(await page.locator('tbody tr td:nth-child(3)').innerText(),'撤销历史');
      }
      await stage.selectOption('decided');
      await page.locator('tbody tr td').getByText('裁决完成',{exact:true}).waitFor();
      await page.locator('tbody tr button').click();
      await page.getByRole('heading',{name:mode==='arbitrationFailure'?/执行待恢复/:/执行中/}).waitFor();
      if(mode==='arbitrationFailure')await page.getByText(/渠道待恢复/).waitFor();
      for(const factory of [false,true]){
        const name=(factory?'factory/':'orders/')+'disputes';
        const f=mini(name,factory?supplier:token);
        f.page.onLoad({orderId:order,kind:'arbitrations'});await f.page.onShow();
        if(mode==='arbitrationStages'){
          assert.equal(f.page.data.total,22);
          await f.page.chooseStage({detail:{value:'1'}});
          assert.equal(f.page.data.total,21);
          assert.ok(f.page.data.items.every(row=>row.listLabel==='等待裁决'));
          await f.page.changePage({currentTarget:{dataset:{step:1}}});
          assert.equal(f.page.data.items.length,6);
          await f.page.chooseStage({detail:{value:'3'}});
          assert.equal(f.page.data.page,1);
          assert.deepEqual(f.page.data.items.map(row=>row.listLabel),['撤销历史']);
        }
        await f.page.chooseStage({detail:{value:'2'}});
        assert.deepEqual(f.page.data.items.map(row=>row.listLabel),['裁决完成']);
        await f.page.open({currentTarget:{dataset:{id:issue}}});
        assert.equal(f.page.data.detail.label,mode==='arbitrationFailure'?'执行待处理':'执行中');
        if(mode==='arbitrationFailure')await renderMini(browser,name,f.page.data,'裁决完成',path.join(out,(factory?'factory':'buyer')+'ArbitrationStage.png'));
      }
      console.log('R2 管理端及买家/工厂仲裁页 '+mode+' 通过');return;
    }
    if(mode==='overdueReview'){
      await page.goto(origin+'/fulfillment/risks');
      await page.getByPlaceholder(/逾期来源订单/).fill(order);
      await page.getByRole('button',{name:'查询',exact:true}).click();
      await page.getByRole('button',{name:issue,exact:true}).click();
      await page.getByRole('heading',{name:'逾期超过 72 小时',exact:true}).waitFor();
      await page.getByText(/押金扣款上限 100%/).waitFor();
      await page.screenshot({path:path.join(out,'overdue-review.png'),fullPage:true});return;
    }
    if(mode==='returnDraft' || mode==='claimReview' || mode==='ongoingDraft'){
      const reviewing=mode==='claimReview';
      await page.goto(origin+'/fulfillment/'+(reviewing?'claims':'arbitrations')+'?orderId='+order);
      await page.locator('tbody tr button').first().click();
      if(reviewing){
        await page.getByLabel('核定损失（分）').fill('80000');
        await page.getByLabel('审核意见').fill('逐件核对损失证据');
        await page.getByRole('button',{name:'提交审核',exact:true}).click();
        await page.getByRole('heading',{name:/待买家回应/}).waitFor();
      }else{
        await page.getByRole('heading',{name:'押金核对',exact:true}).waitFor();
        const button=page.getByRole('button',{name:'确认执行已保存裁决',exact:true});
        assert.equal(await button.isDisabled(),mode==='returnDraft');
        await page.getByText(mode==='returnDraft'?/归还索赔须交代全部押金去向/:/在正常归还时处理/).waitFor();
      }
      await page.screenshot({path:path.join(out,mode+'.png')});
      console.log('D5 Chrome '+mode+' passed');return;
    }
    if(['buyerCancel','factoryApprove','buyerAppeal','debtPay'].includes(mode)){
      const factory=mode==='factoryApprove', extension=factory || mode==='buyerCancel';
      const f=mini((factory?'factory/':'orders/')+(extension?'extensions':'disputes'),factory?supplier:token);
      let launches=0;
      f.wx.requestPayment=opts=>{assert.ok(opts.paySign);assert.match(opts.package,/^prepay_id=/);launches++;opts.complete();};
      f.page.onLoad({orderId:order,kind:mode==='debtPay'?'compensation-receivables':'claims'});
      await f.page.onShow();
      assert.ok(f.page.data.items.some(row=>row.id===issue),f.page.data.message);
      await f.page.open({currentTarget:{dataset:{id:issue}}});
      const action={buyerCancel:'cancel',factoryApprove:'approve',buyerAppeal:'appeal',debtPay:'pay'}[mode];
      assert.ok(f.page.data.detail?.actions[action],f.page.data.message);
      const label={buyerCancel:'取消延期并退款',factoryApprove:'同意延期',buyerAppeal:'提交申诉',debtPay:'补缴 ¥300.00'}[mode];
      await renderMini(browser,(factory?'factory/':'orders/')+(extension?'extensions':'disputes'),f.page.data,label,path.join(out,mode+'.png'));
      if(mode==='buyerAppeal')f.page.edit({currentTarget:{dataset:{field:'summary'}},detail:{value:'损失核定有误，请核对'}}); 
      await f.page.act({currentTarget:{dataset:{action}}});
      const status={buyerCancel:'cancelled',factoryApprove:'approved',buyerAppeal:'user_appealed',debtPay:'paying'}[mode];
      assert.equal(f.page.data.detail?.extensionStatus || f.page.data.detail?.status,status,f.page.data.message);
      if(mode==='debtPay')assert.equal(launches,1);
      f.page.onHide();await f.page.onShow();f.page.onUnload();
      console.log('D5 mini HTTP '+mode+' passed');return;
    }
    if(mode==='claimConfirm'){
      const factory=mini('factory/fulfillment',supplier);
      await factory.page.onLoad({id:order,view:'returnCheck'});await factory.page.onShow();
      assert.ok(factory.page.data.claimStock.length,factory.page.data.message);factory.page.onUnload();
      const buyer=mini('orders/disputes',token);await buyer.page.onLoad({id:issue,orderId:order,kind:'claims'});await buyer.page.onShow();
      assert.ok(buyer.page.data.detail?.actions.confirm,buyer.page.data.message);
      await buyer.page.act({currentTarget:{dataset:{action:'confirm'}}});assert.equal(buyer.page.data.detail?.status,'executing',buyer.page.data.message);buyer.page.onUnload();
      console.log('D5 factory return check + mini buyer confirmation passed');return;
    }
    await page.goto(origin+'/fulfillment/issues');
    await page.getByRole('button',{name:'收货时发现道具破损',exact:true}).click({timeout:15000});
    await page.getByRole('textbox',{name:'需要补充的材料'}).fill('请说明破损部位是否影响安装');
    await page.getByRole('button',{name:'要求补证',exact:true}).click();
    await page.getByRole('heading',{name:'收货问题 · 待买家补证'}).waitFor({timeout:10000});
    await page.screenshot({path:path.join(out,'issue-review.png'),fullPage:true});
    const f=mini("orders/issues",token);
    await f.page.onLoad({id:order});
    await f.page.onShow();
    await f.page.open({currentTarget:{dataset:{id:issue}}});
    assert.equal(f.page.data.detail?.supplementRequest,'请说明破损部位是否影响安装',f.page.data.message);
    f.page.edit({detail:{value:'铰链变形，无法安装'}});
    await f.page.submit();
    assert.equal(f.page.data.detail?.status,'processing',f.page.data.message);
    f.page.onUnload();
    await page.getByRole('button',{name:'查询',exact:true}).click();
    await page.getByRole('row').filter({hasText:'收货时发现道具破损'}).getByText('处理中',{exact:true}).waitFor();
    console.log('D5 admin Chrome request + buyer mini page HTTP supplement + admin list readback passed');
  } finally {if (browser) await browser.close();server.kill();}
}
run(JSON.parse(fs.readFileSync(0,'utf8'))).catch(e=>{console.error(e);process.exitCode=1;});
