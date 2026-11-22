const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../miniprogram');
function fixture(role='supplier'){
 const modules=new Map(),storage=new Map([['mj.session','A']]),requests=[],nav=[],scroll=[];let definition;
 const context={userId:'123456789abc4def8123456789abcdef',roleCode:role,registrationStage:role==='supplier'?'factory_bound':'demander_bound',accessMode:'normal',nickname:'测试工厂'},profile={id:'abcdef12345647898123456789abcdef',factoryStatus:'active',materials:{factoryName:'测试工厂'}};
 const app={globalData:{context}},wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),switchTab:o=>nav.push(o.url),navigateTo:o=>nav.push(o.url),redirectTo:o=>nav.push(o.url),navigateBack:()=>nav.push('BACK'),setNavigationBarTitle(){},showToast(){},pageScrollTo:o=>scroll.push(o.scrollTop)};
 const table={};function load(file){file=path.resolve(root,file);if(modules.has(file))return modules.get(file).exports;const m={exports:{}};modules.set(file,m);vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:m,wx,getApp:()=>app,getCurrentPages:()=>[],Page:o=>definition=o,setTimeout,clearTimeout,require:n=>{const p=path.resolve(path.dirname(file),n+'.js');if(p.endsWith("/config/environment.js"))return {development:true};if(p.endsWith('/services/account.js'))return {context:async()=>context,logout:async()=>load('session/storage.js').clear()};if(p.endsWith('/services/factory.js'))return {request:async()=>profile};if(p.endsWith('/services/http.js'))return {request:(p)=>{requests.push(p);const matched=Object.keys(table).find(k=>p.startsWith(k));if(matched)return typeof table[matched]==='function'?table[matched](p):Promise.resolve(table[matched]);return Promise.resolve({items:[],total:'0'});}};if(p.endsWith('/session/activity.js'))return {report(){},interaction(){}};return load(p);}},{filename:file});return m.exports;}
 function page(name){modules.delete(path.resolve(root,'pages/'+name+'.js'));load('pages/'+name+'.js');return {...definition,route:'pages/'+name,data:JSON.parse(JSON.stringify(definition.data)),getTabBar:()=>({setData:v=>{page.tab={...page.tab,...v};}}),setData(v){Object.assign(this.data,v);}};}
 return {load,page,wx,requests,nav,scroll,storage,table,context,profile};
}
test('two role roots have four tabs; factory home loads its overview and pending orders once on ordinary return',async()=>{
 const f=fixture();const home=f.page('home/index');await home.onShow();assert.equal(home.data.factoryRoot,true);assert.equal(f.page.tab.items.map(x=>x.text).join(','),'首页,发布,仓库,我的');assert.deepEqual(f.requests,["/api/me/factory-orders/overview","/api/me/factory-orders?view=factory_pending&page=1"]);
 home.onHide();await home.onShow();assert.equal(f.requests.length,2);
 const mine=f.page('mine/index');await mine.onShow();assert.equal(mine.data.factoryRoot,true);assert.equal(mine.data.factoryMenus.filter(x=>x.key==='ledger').length,1);mine.factoryOpen({currentTarget:{dataset:{key:'rules'}}});assert.equal(f.nav.pop(),'/pages/factory/rules?readOnly=1');
 const r=fixture('demander');await r.page('plan/index').onShow();assert.equal(r.page.tab.items.map(x=>x.text).join(','),'首页,方案,清单,我的');
});
test('warehouse uses server asset/status/auditing filters; stale page replies never win',async()=>{
 const f=fixture();const w=f.page('checklist/index');await w.onShow();w.setData({keyword:'木',page:3,tab:'pending'});await w.asset({currentTarget:{dataset:{type:'A_ASSET'}}});await new Promise(r=>setImmediate(r));const q=f.requests.at(-1);assert.match(q,/assetType=A_ASSET/);assert.match(q,/auditing=true/);assert.doesNotMatch(q,/skuStatus=pending/);assert.match(q,/page=1/);
 w.setData({tab:'offline'});await w.load();assert.match(f.requests.at(-1),/skuStatus=offline/);
});
test('warehouse query/page/scroll restores per factory and clears on logout',async()=>{
 const f=fixture();const w=f.page('checklist/index');await w.onShow();w.setData({keyword:'灯',assetType:'B_CONSUMABLE',page:4,tab:'online'});w.onPageScroll({scrollTop:420});w.onHide();const restored=f.page('checklist/index');await restored.onShow();assert.equal(restored.data.page,4);assert.equal(restored.data.keyword,'灯');assert.equal(f.scroll.at(-1),420);
 f.load('session/storage.js').clear();f.storage.set('mj.session','B');const fresh=f.page('checklist/index');await fresh.onShow();assert.equal(fresh.data.keyword,'');assert.equal(fresh.data.page,1);
});
test('SKU ledger selection branches A to SN list and B to quantity movements; no-stack SN return preserves SKU',async()=>{
 const f=fixture(),p=f.page('inventory/select');await p.onLoad({});p.setData({items:[{id:'a',assetType:'A_ASSET'},{id:'b',assetType:'B_CONSUMABLE'}]});p.open({currentTarget:{dataset:{id:'a'}}});assert.equal(f.nav.pop(),'/pages/inventory/index?id=a&source=ledger');p.open({currentTarget:{dataset:{id:'b'}}});assert.equal(f.nav.pop(),'/pages/inventory/movements?id=b&source=ledger');const logs=f.page('inventory/logs');await logs.onLoad({id:'sn',skuId:'a',source:'ledger'});logs.navigationBack();assert.equal(f.nav.pop(),'/pages/inventory/index?id=a&source=ledger');
});
test('cold owned deep link authenticates before requesting private data; logout clears old return target',async()=>{
 const f=fixture();f.load('session/storage.js').clear();const p=f.page('inventory/logs');await p.onLoad({id:'sn',skuId:'a'});await p.onShow();assert.equal(f.requests.length,0);assert.match(f.nav[0],/account\/index\?resume=1&return=/);const q=f.page('account/index');q.onLoad({return:'/pages/props/detail?id=old'});f.load('session/storage.js').replace('B');assert.equal(q.data.returnPath,'/pages/home/index');
});
test('application and inventory nested state restore uses object-specific keys',async()=>{
 const f=fixture(),a=f.page('props/reviews');await a.onLoad({skuId:'a'});a.setData({page:3,status:'rejected',assetType:'A_ASSET'});a.onPageScroll({scrollTop:220});a.onHide();const b=f.page('props/reviews');await b.onLoad({skuId:'b'});assert.equal(b.data.page,1);const a2=f.page('props/reviews');await a2.onLoad({skuId:'a'});assert.equal(a2.data.page,3);assert.equal(a2.data.status,'rejected');
});
test('D2 ownedList real HTTP responses replay through warehouse mapping without client filtering',async()=>{
 const evidence=process.env.MJ_EVIDENCE_DIR;assert.ok(evidence);const rows=fs.readFileSync(path.join(evidence,'nav-owned-asset-http.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.path.startsWith('/api/me/factory-props?')&&x.status===200);
 assert.ok(rows.length>20);for(const row of rows){const f=fixture(),p=f.page('inventory/select');f.table['/api/me/factory-props?']=row.body.data;await p.onLoad({});await p.onShow();assert.equal(p.data.items.length,row.body.data.items.length);assert.equal(p.data.total,row.body.data.total);}
});

test('late warehouse filter response cannot replace newer filter rows or error state',async()=>{const f=fixture(),p=f.page('inventory/select');await p.onLoad({});let pending=[];f.table['/api/me/factory-props?']=()=>new Promise((resolve,reject)=>pending.push({resolve,reject}));p.setData({assetType:'A_ASSET'});const a=p.load();p.setData({assetType:'B_CONSUMABLE'});const b=p.load();pending[1].resolve({items:[{id:'b',skuStatus:'online'}],total:'1'});await b;pending[0].reject(Error('old error'));await a;assert.equal(p.data.items[0].id,'b');assert.equal(p.data.message,'');});

test('no-stack SKU inventory and scoped application list return to their source SKU',async()=>{const f=fixture(),i=f.page('inventory/index');await i.onLoad({id:'sku'});i.navigationBack();assert.equal(f.nav.pop(),'/pages/props/detail?id=sku');const a=f.page('props/reviews');await a.onLoad({skuId:'sku'});a.navigationBack();assert.equal(f.nav.pop(),'/pages/props/detail?id=sku');});

test('cold scan restores server identity before QR resolution and refuses demander without private request',async()=>{const f=fixture('demander'),p=f.page('props/scan/index');p.onLoad({code:'123456789abc4def8123456789abcdef'});p.onShow();await new Promise(r=>setImmediate(r));assert.equal(f.requests.length,0);assert.equal(p.data.loginRequired,true);assert.match(p.data.message,/工厂账号/);p.onUnload();});

for(const name of ['props/reviews','inventory/movements'])test(name+' ignores late results after filter changes',async()=>{const f=fixture(),p=f.page(name);await p.onLoad({id:'sku'});let pending=[];f.table[name==='props/reviews'?'/api/me/prop-reviews?':'/api/me/factory-props/sku/movements?']=()=>new Promise(resolve=>pending.push(resolve));const a=p.load(),b=p.load();pending[1]({items:[],pendingCounts:{total:'2'},total:'2'});await b;pending[0]({items:[],pendingCounts:{total:'9'},total:'9'});await a;assert.equal(p.data.total,'2');});
