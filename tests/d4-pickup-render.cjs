// 使用微信工具的 WCC/WCSC 编译两个原页面，再将完整渲染树挂入浏览器进行可见文本断言。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { fixture } = require('./support/planning-fixture.cjs');
const { chromium } = require(process.env.MJ_PLAYWRIGHT_MODULE || '/Users/mbro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');

async function verify({ base, order, buyer, supplier, missing, output }) {
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  const root = path.resolve(__dirname, '../miniprogram');
  const compiler = process.env.MJ_WX_COMPILER_DIR || '/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec';
  const paths = ['pages/orders/fulfillment', 'pages/factory/fulfillment','templates/fulfillment'];
  const compile = (tool,ext) => execFileSync(path.join(compiler,tool),paths.map(p=>p+ext),{cwd:root,encoding:'utf8'});
  const runtime=vm.createContext({window:{},console});
  vm.runInContext(compile('wcc','.wxml'),runtime);
  const css=compile('wcsc','.wxss').replaceAll('%%HERESUFFIX%%','').replace(/%%\?([\d.-]+)rpx\?%%/g,(_,n)=>Number(n)*390/750+'px');
  const browser=await chromium.launch({executablePath:process.env.MJ_CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try {
    for (const [role, token] of [['orders',buyer],['factory',supplier]]) {
      const name=role+'/fulfillment',template=runtime.$gwx('pages/'+name+'.wxml');
      for(let opening=1;opening<=(missing?1:2);opening++){
        const f=fixture(name,{},true);
        f.wx.setNavigationBarTitle=()=>{};
        f.session.replace(token);
        const accessed=[];
        f.wx.request=async o=>{
          const url=new URL(o.url);
          accessed.push(url.pathname);
          try{
            const response=await fetch(base+url.pathname+url.search,{method:o.method,headers:o.header});
            o.success({data:await response.json(),statusCode:response.status,header:Object.fromEntries(response.headers)});
          }catch(e){o.fail(e);}
        };
        await f.page.onLoad({id:order});
        try {
          await f.page.onShow();
          const tree=template(f.page.data);
          const display=await browser.newPage({viewport:{width:390,height:844}});
          try {
            await display.addStyleTag({content:'body{margin:0;font-family:sans-serif}wx-view,wx-scroll-view,wx-page,wx-textarea,wx-picker{display:block}wx-button{display:inline-block}'+css});
            await display.evaluate(root=>{
              function mount(node) {
                if(typeof node!=='object')return document.createTextNode(String(node));
                const element=document.createElement(node.tag);
                for(const [k,v] of Object.entries(node.attr||{})){
                  if(k==='class'||k==='style')element.setAttribute(k,String(v));
                }
                for(const child of node.children||[])element.appendChild(mount(child));
                return element;
              }
              document.body.appendChild(mount(root));
            },tree);
            const visible=await display.locator('body').innerText();
            assert.doesNotMatch(visible,/新地址路89号|当前联系人/);
            assert.ok(accessed.every(p=>!p.includes('/addresses')));
            if(missing){
              assert.match(visible,/订单信息不完整，无法核实下单时的取回地址，请联系平台/);
              assert.doesNotMatch(visible,/接收路1号|确认开始取回/);
            }else{
              assert.equal(f.page.data.view,'shipment');
              assert.ok(await display.getByText('取回地址',{exact:true}).isVisible());
              assert.ok(await display.getByText('上海市 静安区 接收路1号',{exact:true}).isVisible());
              if(role==='orders'){
                assert.ok(await display.getByText('隔离接收人 138****0001',{exact:true}).isVisible());
                assert.equal(await display.locator('wx-button').filter({hasText:/^开始取回$/}).count(),0);
              }else{
                assert.ok(await display.locator('wx-button').filter({hasText:/^开始取回$/}).isVisible());
                assert.ok(f.page.data.actions.start_pickup);
              }
            }
            if(opening===(missing?1:2))await display.screenshot({path:path.join(output,'pickup-'+role+(missing?'-missing':'-reopened')+'.png'),fullPage:true});
            console.log(role,missing?'缺失快照提示已渲染':'第 '+opening+' 次打开显示下单地址');
          }finally{await display.close();}
        }finally{f.page.onUnload();}
      }
    }
  }finally{await browser.close();}
}
verify(JSON.parse(fs.readFileSync(0,'utf8'))).catch(e=>{console.error(e.message);process.exitCode=1;});
