const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../miniprogram'),routes=require('../miniprogram/constants/routes');
const id='7197187c3512420986837938630abf8a',sn='de904bdb52c243d9a4eaa88b820e07d2',home=routes.tabs[0];
const query=o=>Object.entries(o).filter(([,v])=>v!==''&&v!==null&&v!==undefined).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
function producer(name,data){
 let page,result;
 function load(file){const m={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:m,require:n=>n.endsWith('/page')?o=>page=o:n.endsWith('/props')?{query}:n.endsWith('/prop-browser-page')?load(path.join(root,'services/prop-browser-page.js')):{},wx:{}});return m.exports;}
 load(path.join(root,'pages/props/'+name+'.js'));
 page.login.call({...page,data,openLogin:p=>result=p});return result;
}
test('NAV-R01 real browse/product login producers preserve Chinese, JSON styles, type and rental dates',()=>{
 for(const p of [producer('browse',{keyword:'木质 道具',styleCodes:['chinese','modern'],typeCode:'prop',rental:true,startDate:'2026-11-03',endDate:'2026-11-05'}),producer('product',{id,startDate:'2026-11-03',endDate:'2026-11-05'})])assert.equal(routes.safeReturn(p),p);
});
test('NAV-R01 full 128-character encoded Chinese search and empty style selection remain valid',()=>{
 const p=producer('browse',{keyword:'道'.repeat(128),styleCodes:[],typeCode:'',rental:false});assert.ok(p.length>1024);assert.equal(routes.safeReturn(p),p);
});
test('NAV-R01 factory SKU, application, SN, code and scene targets preserve exact object parameters',()=>{
 for(const p of ['/pages/props/detail?'+query({id}),'/pages/props/review?'+query({id,type:'sku_audit'}),'/pages/props/form?'+query({id,mode:'resubmit',previous:sn}),'/pages/inventory/logs?'+query({id:sn,skuId:id,source:'ledger'}),...['id','code','scene'].map(k=>'/pages/props/scan/index?'+query({[k]:id}))])assert.equal(routes.safeReturn(p),p);
});
test('NAV-R01 route-specific unknown, duplicate, external and malformed values safely fall back',()=>{
 const bad=['constructor','__proto__','toString','https://evil.invalid/x','//evil.invalid','/pages/props/../account/index','/pages/home/index?keyword=x','/pages/props/product?'+query({id,styles:'[]'}),'/pages/props/product?'+query({id})+'&id='+id,'/pages/props/product?'+query({id,startDate:'2026-11-03'}),'/pages/props/product?'+query({id,startDate:'2026-02-30',endDate:'2026-03-01'}),'/pages/props/product?'+query({id,startDate:'2026-11-05',endDate:'2026-11-03'}),'/pages/props/product?'+query({id,startDate:'2026-11-03',endDate:'2027-03-03'}),'/pages/props/browse?keyword=%E9','/pages/props/browse?keyword=%250A','/pages/props/browse?'+query({styles:'["a","a"]'}),'/pages/props/browse?'+query({styles:'["a","b","c","d"]'}),'/pages/props/browse?'+query({keyword:'x\n'}),'/pages/props/scan/index?'+query({id,code:id}),'/pages/props/form?'+query({mode:'edit'}),'/pages/inventory/logs?'+query({id:'not-an-id'}),'/pages/props/browse?constructor=x'];
 // Literal "%0A" is a printable search term, not a recursively decoded control character.
 bad.splice(bad.indexOf('/pages/props/browse?keyword=%250A'),1);
 for(const p of bad)assert.equal(routes.safeReturn(p),home,p);
});
