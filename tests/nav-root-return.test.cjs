const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram');
function fixture(role='supplier') {
  const modules=new Map(), storage=new Map([['mj.session','original']]), updates=[], scroll=[], nav=[];
  const app={globalData:{context:null}}, context={userId:'123456789abc4def8123456789abcdef',roleCode:role,registrationStage:role==='supplier'?'factory_bound':'demander_bound',accessMode:'normal'};
  let definition, contextReply=async()=>context, profileReply=async()=>({id:'abcdef12345647898123456789abcdef',factoryStatus:'active',materials:{factoryName:'原工厂'}}), contextReads=0;
  const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),pageScrollTo:o=>scroll.push(o.scrollTop),setNavigationBarTitle(){},navigateTo:o=>nav.push(o.url),switchTab:o=>nav.push(o.url),showToast(){}};
  function load(file) {
    file=path.resolve(root,file);if(modules.has(file))return modules.get(file).exports;
    const m={exports:{}};modules.set(file,m);
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:m,wx,getApp:()=>app,getCurrentPages:()=>[],Page:o=>definition=o,setTimeout,clearTimeout,require:n=>{
      const p=path.resolve(path.dirname(file),n+'.js');
      if(p.endsWith('/services/account.js'))return {context:()=>{contextReads++;return contextReply();}};
      if(p.endsWith('/services/factory.js'))return {request:()=>profileReply()};
      if(p.endsWith('/services/http.js'))return {request:async()=>({items:[],total:'0'})};
      if(p.endsWith('/session/activity.js'))return {report(){},interaction(){}};
      if(p.endsWith('/config/environment.js'))return {development:true};
      return load(p);
    }},{filename:file});return m.exports;
  }
  function page(name='mine') {
    modules.delete(path.resolve(root,'pages/'+name+'/index.js'));load('pages/'+name+'/index.js');
    return {...definition,route:'pages/'+name+'/index',data:JSON.parse(JSON.stringify(definition.data)),getTabBar:()=>({setData(){}}),setData(v){updates.push({...v});Object.assign(this.data,v);}};
  }
  return {page,load,context,updates,scroll,nav,reads:()=>contextReads,reply:fn=>contextReply=fn,profile:fn=>profileReply=fn};
}
for(const name of ['home','plan','checklist','mine'])test(name+' return keeps mounted factory root while revalidating server state',async()=>{
  const f=fixture(),p=f.page(name);await p.onShow();assert.equal(p.data.rootReady,true);
  p.onPageScroll({scrollTop:388});p.onHide();f.updates.length=0;
  let complete;f.reply(()=>new Promise(r=>complete=r));const returning=p.onShow();
  assert.equal(p.data.rootReady,true,'return must not replace page with loading state');assert.equal(p.data.rootLoading,true);
  if(name==='plan'){p.factoryCreate({currentTarget:{dataset:{type:'A_ASSET'}}});assert.equal(f.nav.length,0,'publish waits for refreshed permissions');}
  complete(f.context);await returning;assert.equal(f.reads(),2);assert.equal(p.data.rootLoading,false);
  assert.equal(f.updates.some(u=>u.rootReady===false),false);
  if(name==='mine')assert.equal(f.scroll.at(-1),388);
});
test('mine first entry waits for profile; returning refresh updates profile without clearing the page',async()=>{
  const f=fixture(),p=f.page();let finish;f.profile(()=>new Promise(r=>finish=r));const first=p.onShow();await new Promise(r=>setImmediate(r));assert.equal(p.data.rootReady,false);
  finish({id:'abcdef12345647898123456789abcdef',factoryStatus:'active',materials:{factoryName:'原名'}});await first;
  f.profile(async()=>({id:'abcdef12345647898123456789abcdef',factoryStatus:'suspended',materials:{factoryName:'新名'}}));await p.onShow();
  assert.equal(p.data.factoryProfile.materials.factoryName,'新名');assert.equal(p.data.factoryProfile.factoryStatus,'suspended');
});
test('failed revalidation hides private root; retry restores saved mine position',async()=>{
  const f=fixture(),p=f.page();await p.onShow();p.onPageScroll({scrollTop:510});p.onHide();f.reply(async()=>{throw Error('网络失败');});await p.onShow();
  assert.equal(p.data.rootReady,false);assert.equal(p.data.rootMessage,'网络失败');f.reply(async()=>f.context);await p.onShow();assert.equal(p.data.rootReady,true);assert.equal(f.scroll.at(-1),510);
});
test('session clear during return clears private content and rejects late response and scroll',async()=>{
  const f=fixture(),p=f.page();await p.onShow();p.onPageScroll({scrollTop:510});p.onHide();let finish;f.reply(()=>new Promise(r=>finish=r));const returning=p.onShow();
  f.load('session/storage.js').clear();assert.equal(p.data.rootReady,false);assert.equal(p.data.factoryProfile,null);finish(f.context);await returning;
  assert.equal(p.data.rootReady,false);assert.equal(p.data.factoryProfile,null);assert.equal(f.scroll.length,0);
});
test('renter mine return also retains mounted page while checking context',async()=>{
  const f=fixture('demander'),p=f.page();await p.onShow();f.updates.length=0;let finish;f.reply(()=>new Promise(r=>finish=r));const returning=p.onShow();
  assert.equal(p.data.rootReady,true);finish(f.context);await returning;assert.equal(p.data.factoryRoot,false);assert.equal(f.updates.some(u=>u.rootReady===false),false);
});
