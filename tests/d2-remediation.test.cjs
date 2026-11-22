const test = require('node:test'), assert = require('node:assert/strict');
const {fixture,tick}=require('./support/d2-page-fixture.cjs');
const key='55555555555545558555555555555555';
async function reloadMissing(f,domain,status=404){
 f.verification.remember(domain,'user-A',key);
 const load=f.page.load();await tick();
 f.pending[0].resolve({application:null,canSubmit:true,realnameStatus:'unverified',consent:{version:domain+'-material-v1'}});
 await tick();f.pending[1].reject(Object.assign(new Error('unconfirmed'),{status}));await load;
}
function filled(f){Object.assign(f.page.data,{name:'虚构测试',card:'11010519491231002X',photos:['front','back'],agreed:true});}
async function uploaded(f,count=2){for(let i=0;i<count;i++){await tick();f.uploads[i].success({statusCode:200,data:JSON.stringify({code:'OK',data:{uploadId:String(i+1).repeat(32)}})});}await tick();}
for(const d of ['realname','student']){
 for(const status of [404,500]) test(d+' missing in-memory command can refill with original identifier after '+status,async()=>{
  const f=fixture(d);await reloadMissing(f,d,status);
  assert.equal(f.page.data.canRetryOriginal,false);
  assert.equal(typeof f.page.refillOriginal,'function');
  f.page.refillOriginal();filled(f);
  const send=f.page.submit();await uploaded(f);
  assert.equal(f.pending[2].args[4]['Idempotency-Key'],key);
  f.pending[2].resolve({outcome:'created'});await send;
  assert.equal(f.verification.pending(d,'user-A'),'');
  assert.ok(f.navigations.includes('/pages/'+d+'/status'));
 });
 for(const slot of [0,1]) test(d+' required slot '+slot+' is blocked before any upload',async()=>{
  const f=fixture(d);f.page.userId='user-A';filled(f);f.page.data.current={canSubmit:true,consent:{version:d+'-material-v1'}};
  f.page.data.photos=d==='student'?['front','back','supplement']:['front','back'];delete f.page.data.photos[slot];
  const submission=f.page.submit();await tick();assert.equal(f.uploads.length,0);await submission;assert.equal(f.pending.length,0);assert.match(f.page.data.message,/照片|材料/);
 });
 test(d+' recovery late failure cannot repopulate another account',async()=>{
  const f=fixture(d);f.page.userId='user-A';f.page.data.requestId=key;const recovery=f.page.recover();f.session.replace('owner-B');
  f.pending[0].reject(Object.assign(new Error('old-account-error'),{status:404}));await recovery;
  assert.equal(f.page.data.unknown,false);assert.notEqual(f.page.data.message,'old-account-error');
 });
}
for(const d of ['realname','student']) {
 for(const state of ['pending', d==='student'?'approved':'verified','rejected']) test(d+' refresh recovers existing '+state+' without new submission',async()=>{
  const f=fixture(d,true);f.page.userId='user-A';f.page.data.requestId=key;f.verification.remember(d,'user-A',key);
  const task=f.page.recover();f.pending[0].resolve({id:'original',status:state});await task;
  assert.equal(f.page.data.application.id,'original');assert.equal(f.page.data.unknown,false);assert.equal(f.verification.pending(d,'user-A'),'');assert.equal(f.uploads.length,0);
 });
 test(d+' in-memory retry keeps original body and key after lost response',async()=>{
  const f=fixture(d);f.page.userId='user-A';filled(f);f.page.data.current={canSubmit:true,consent:{version:d+'-material-v1'}};
  let task=f.page.submit();await uploaded(f);const first=f.pending[0];first.reject(new Error('connection lost'));await task;
  task=f.page.retryOriginal();assert.equal(f.pending[1].args[4]['Idempotency-Key'],first.args[4]['Idempotency-Key']);assert.equal(f.pending[1].args[3],first.args[3]);f.pending[1].resolve({outcome:'replayed'});await task;assert.equal(f.uploads.length,2);
 });
 test(d+' late original commit conflicts with refill and recovers original result',async()=>{
  const f=fixture(d);await reloadMissing(f,d);f.page.refillOriginal();filled(f);const task=f.page.submit();await uploaded(f);
  f.pending[2].reject(Object.assign(new Error('conflict'),{status:409,reason:'IDEMPOTENCY_KEY_REUSED'}));await tick();
  assert.ok(f.pending[3].args[0].includes(key));f.pending[3].resolve({id:'late-original',status:'pending'});await task;
  assert.equal(f.page.data.application.id,'late-original');assert.equal(f.page.data.unknown,false);assert.equal(f.verification.pending(d,'user-A'),'');assert.equal(f.pending.filter(r=>r.args[1]==='POST').length,1);
 });
 test(d+' status page refill navigates without generating an identifier',async()=>{
  const f=fixture(d,true);await reloadMissing(f,d);f.page.refillOriginal();assert.equal(f.navigations[0],'/pages/'+d+'/form?recover=1');assert.equal(f.verification.pending(d,'user-A'),key);
 });
 for(const count of d==='student'?[2,3]:[2])test(d+' valid '+count+' photos preserve required positions',async()=>{
  const f=fixture(d);f.page.userId='user-A';filled(f);if(count===3)f.page.data.photos.push('supplement');f.page.data.current={canSubmit:true,consent:{version:d+'-material-v1'}};
  const task=f.page.submit();await uploaded(f,count);assert.deepEqual(f.uploads.map(x=>x.filePath),count===3?['front','back','supplement']:['front','back']);
  const body=f.pending[0].args[3];assert.deepEqual(JSON.parse(JSON.stringify(d==='student'?body.materialUploadIds:[body.frontUploadId,body.backUploadId])),Array.from({length:count},(_,i)=>String(i+1).repeat(32)));
  f.pending[0].resolve({});await task;
 });
 test(d+' canceled selection and replacement preserve other slots',async()=>{
  const f=fixture(d);filled(f);f.wx.chooseMedia=o=>o.fail({errMsg:'chooseMedia:fail cancel'});await f.page.choose({currentTarget:{dataset:{position:0}}});assert.deepEqual(JSON.parse(JSON.stringify(f.page.data.photos)),['front','back']);
  f.wx.chooseMedia=o=>o.success({tempFiles:[{size:100,tempFilePath:'new-back'}]});f.wx.getImageInfo=o=>o.success({type:'png',width:10,height:10});await f.page.choose({currentTarget:{dataset:{position:1}}});assert.deepEqual(JSON.parse(JSON.stringify(f.page.data.photos)),['front','new-back']);
 });
}

for(const domain of ['realname','student']) for(const trusted of [false,true]) test(domain+' '+(trusted?'trusted rejection permits correction':'non-protocol 400 preserves original command'), async()=>{
 const f=fixture(domain);f.page.userId='user-A';filled(f);f.page.data.current={canSubmit:true,consent:{version:domain+'-material-v1'}};
 const task=f.page.submit();await uploaded(f);const request=f.pending[0];
 request.reject(Object.assign(new Error('test failure'),{status:400,reason:trusted?'REQUEST_INVALID':'UNKNOWN_RESPONSE',outcome:trusted?'business-rejection':'unknown'}));await task;
 assert.equal(!!f.page.command,!trusted);assert.equal(!!f.verification.pending(domain,'user-A'),!trusted);
 assert.equal(f.page.data.unknown,!trusted);
 if(!trusted){assert.equal(f.page.command.body,request.args[3]);assert.equal(f.page.command.key,request.args[4]['Idempotency-Key']);}
});

for(const domain of ['realname','student'])test(domain+' restricted current response remains valid and cannot permit submit',()=>{
 const protocol=require('../miniprogram/services/response-contract');
 const data={application:null,canSubmit:false,nextAction:'ACCOUNT_RESTRICTED',consent:{version:domain+'-material-v1',text:'处理说明'},uploadPolicy:{contentTypes:['image/jpeg','image/png'],maxBytes:5242880,maxPixels:20000000,receiptTtlSeconds:86400},...(domain==='realname'?{phoneMasked:'+86****0000'}:{realnameStatus:'unverified'})};
 const body={code:'OK',message:'成功',data,traceId:'00000000000040008000000000000001'},path='/api/me/'+domain+'-verifications/current';
 assert.equal(protocol.accepts(path,'GET',200,body),true);data.canSubmit=true;assert.equal(protocol.accepts(path,'GET',200,body),false);
});
