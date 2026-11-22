const test = require('node:test'), assert = require('node:assert/strict');
const {fixture} = require('./web-fixture.cjs');
const exportsList = ['load','decide','send','resumeDecision','unknown','refilling','command','detail','status','keyword','from','to','page','message'];
const originalKey = '12345678901234567890123456789012';
function setup(domain, state='pending', actor=null) {
 const calls=[], storageKey=`mj.review.admin-A.${domain}.application-A`;
 let record={application:{id:'application-A',status:state},canReview:state==='pending',caseId:'case-A',version:0,caseVersion:0,reviewedByAdminUserId:actor};
 class ApiError extends Error { constructor(reason){super(reason);this.reason=reason;} }
 const f=fixture({props:{domain},route:{query:{id:'application-A'},path:'/accounts/'+domain},mocks:{
  '../../session/state':{me:{value:{userId:'admin-A',permissions:[]}},notice:{value:''},explain(){}},
  '../../session/view':{useSessionView:()=>({capture:()=>1,current:()=>true})},
  '../../api/http':{ApiError,isStale:()=>false,refreshCsrf:async()=>{},api:async(...args)=>{calls.push(args);if(args[1]==='POST'){if(f.failure)throw new ApiError(f.failure);record={...record,application:{...record.application,status:'rejected'},canReview:false,reviewedByAdminUserId:'admin-A'};return {};}return record;}}
 }});
 f.stored.set(storageKey,originalKey);
 const component=f.load('views/verification/VerificationQueue.vue',exportsList.concat('remark','years'));
 return {...f,component,calls,storageKey, fail(reason){f.failure=reason;}, reviewedByOther(){record={...record,canReview:false,application:{...record.application,status:"rejected"},reviewedByAdminUserId:"admin-B"};}};
}
for(const domain of ['realname','student']) {
 test(domain+' refreshed pending refills original review key and executes one decision',async()=>{
  const f=setup(domain),c=f.component;await c.load();assert.equal(c.unknown.value,true);assert.equal(c.command.value,null);
  c.resumeDecision();assert.equal(c.refilling.value,true);c.remark.value='虚构核验驳回';await c.decide('reject');
  const posts=f.calls.filter(x=>x[1]==='POST');assert.equal(posts.length,1);assert.equal(posts[0][4],originalKey);
  assert.equal(f.stored.has(f.storageKey),false);assert.equal(c.detail.value.application.status,'rejected');
 });
 for(const actor of ['admin-A','admin-B'])test(domain+' refreshed already reviewed by '+actor+' loads outcome without issuing review',async()=>{
  const f=setup(domain,'rejected',actor);await f.component.load();assert.equal(f.component.unknown.value,false);assert.equal(f.component.detail.value.reviewedByAdminUserId,actor);assert.equal(f.stored.has(f.storageKey),false);assert.equal(f.calls.some(x=>x[1]==='POST'),false);assert.match(f.component.message.value,/本次没有再次执行审核/);
 });
 test(domain+' original review key survives uncertain and definite refill failures',async()=>{
  const f=setup(domain),c=f.component;await c.load();c.resumeDecision();c.remark.value='复核';f.fail('REQUEST_INVALID');await c.decide('reject');assert.equal(c.unknown.value,true);assert.equal(f.stored.get(f.storageKey),originalKey);
 });
}
test('domain policy excludes empty status parameter and unsupported realname expired',()=>{
 const f=fixture(),p=f.load('views/verification/policy.ts');
 assert.equal(p.filterPolicy.student.defaultStatus,'');assert.equal(p.listQuery('student','',1).has('status'),false);
 for(const domain of ['student','realname'])for(const status of p.filterPolicy[domain].statuses){const q=p.listQuery(domain,status,2);assert.equal(q.get('status'),status||null);assert.equal(q.get('page'),'2');}
 assert.throws(()=>p.listQuery('realname','expired',1));
});
test('changing domain resets filters and page before loading',async()=>{
 const f=setup('student'),c=f.component;c.status.value='expired';c.keyword.value='学校';c.from.value='2026-01-01';c.to.value='2026-02-01';c.page.value=3;
 f.props.domain='realname';f.route.query={};f.watchers.find(w=>Array.isArray(w.sources)).fn(['realname',''],['student','application-A']);
 assert.equal(c.status.value,'pending');assert.equal(c.page.value,1);assert.equal(c.keyword.value,'');assert.equal(c.from.value,'');assert.equal(c.to.value,'');assert.ok(f.calls.at(-1)[0].includes('status=pending'));
});

for(const domain of ['student','realname']) test(domain+' late other review conflict recovers domain-specific already-reviewed code',async()=>{
 const f=setup(domain),c=f.component;await c.load();c.resumeDecision();c.remark.value='review';f.reviewedByOther();f.fail(domain.toUpperCase()+'_ALREADY_REVIEWED');await c.decide('reject');assert.equal(c.unknown.value,false);assert.equal(c.detail.value.reviewedByAdminUserId,'admin-B');assert.equal(f.stored.has(f.storageKey),false);
});
