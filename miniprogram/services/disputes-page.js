const api = require('./trading');
const ui = require('./trading-page');
const materials = require('./verification');
const session = require('../session/storage');
const tabs = [{key:'claims',name:'索赔'}, {key:'arbitrations',name:'仲裁'}, {key:'compensation-receivables',name:'订单补缴'}];
const status = {draft:'草稿',submitted:'待平台审核',admin_reviewing:'审核中',supplement_required:'待工厂补充材料',waiting_user_response:'待买家回应',
  user_confirmed:'已确认',user_appealed:'已申诉',auto_confirmed:'已到期生效',executing:'执行中',execution_failed:'执行待处理',rejected:'已驳回',
  withdrawn:'已撤回',closed:'已关闭',open:'待审理',evidence_review:'核对材料中',waiting_evidence:'待补证',decision_draft:'待裁决确认',
  decided:'已裁决',cancelled:'已取消',pending:'待处理',paying:'支付中',paid:'已缴清',waived:'已减免',processing:'退款中',failed:'退款待处理',success:'退款成功'};
const stages=[{key:'',name:'全部有效案件'},{key:'awaiting_decision',name:'等待裁决'},{key:'decided',name:'裁决完成'},{key:'historical',name:'撤销历史'}];
const issueTypes=[{code:'damaged',name:'损坏'},{code:'quantity_mismatch',name:'数量不符'},{code:'hidden_defect',name:'隐蔽故障'},{code:'other',name:'其他'}];
const verbs={confirm:'确认核定金额',appeal:'提交申诉',submit:'正式提交索赔',withdraw:'撤回索赔',supplement:'提交补充材料',pay:'支付待补金额',save:'保存草稿'};
function present(row){
  return {...row,label:status[row.status],date:api.displayTime(row.createdAt),deadline:api.displayTime(row.responseDeadlineAt),
    deposit: row.depositBalance && {
      paid:api.money(row.depositBalance.paidFen), deducted:api.money(row.depositBalance.deductedFen),
      refunded:api.money(row.depositBalance.refundedFen), reserved:api.money(row.depositBalance.reservedFen),
    },
    decisionLabel: {draft:"裁决草稿",confirmed:"裁决结果",cancelled:"裁决已撤销"}[row.decision?.status],
    decisionTime: api.displayTime(row.decision?.confirmedAt),
    availableDeposit:api.money(row.availableDepositFen),
    claimed:api.money(row.claimedFen),approved:api.money(row.approvedLossFen),outstanding:api.money(row.outstandingFen),
    paid:api.money(row.paidFen),total:api.money(row.receivableFen),deducted:api.money(row.depositDeductedFen),loss:api.money(row.confirmedLossFen),
    rentDue:api.money(row.overdueRentDueFen), liabilityDue:api.money(row.overdueLiabilityDueFen),
    rentPaid:api.money(row.overdueRentPaidFen), liabilityPaid:api.money(row.overdueLiabilityPaidFen),
    decisionLoss:api.money(row.decision?.lossFen),decisionDeposit:api.money(row.decision?.depositDeductionFen),decisionExtra:api.money(row.decision?.receivableFen),
    refunds:(row.refunds || []).map(r=>({id:r.refundId,label:status[r.status],amount:api.money(r.amountFen)})),
    actionable:row.availableActions.some(action=>["submit","edit","confirm","appeal","supplement","withdraw","pay"].includes(action)),
    actions:Object.fromEntries(row.availableActions.map(k=>[k,true]))};
}
module.exports=function disputePage(factory){
  const orderBase='/api/me/'+(factory?'factory-orders':'rental-orders')+'/';
  const base=kind=>'/api/me/'+(factory?'factory-':'')+kind;
  return {
    data:{factory,tabs,stages,stageIndex:0,kind:'claims',items:[],id:'',orderId:'',detail:null,creating:false,editing:false,checkVersion:0,lines:[],issueTypes,
      amount:'',summary:'',photos:[],page:1,total:0,pending:false,busy:false,message:''},
    onLoad(q) {
      const kind = q.kind === 'receivables' ? 'compensation-receivables' : q.kind;
      const tab = tabs.some(item => item.key === kind) ? kind : 'claims';
      this.setData({
        kind: tab,
        orderId: q.orderId || '',
        id: q.id || (tab === 'compensation-receivables' && q['amp;id']) || '',
        creating: factory && tab === 'claims' && q.create === '1' && !!q.orderId,
      });
    },
    onShow(){ui.show(this);if(!this.picking)return this.load();},onHide(){ui.hide(this);},onUnload(){this.gone=true;ui.hide(this);},
    load(){return ui.run(this,current=>this.read(current));},
    async read(current){
      const d=this.data,endpoint=base(d.kind),page=await api.get(endpoint+'?page='+d.page+'&pageSize=15'+(d.kind==='arbitrations' && d.stageIndex?'&decisionStage='+stages[d.stageIndex].key:'')+(d.orderId?'&orderId='+encodeURIComponent(d.orderId):''));
      if(!current())return;
      this.setData({items:page.items.map(r=>({...present(r),listLabel:d.kind==='arbitrations'?stages.find(s=>s.key===r.decisionStage)?.name:status[r.status]})),total:Number(page.total)});
      let row=null;
      if(d.id){row=await api.get(endpoint+'/'+d.id);if(!current())return;this.setData({detail:present(row)});}
      this.setData({pending:api.pending.has(this.slot())});
      if(d.creating || row?.availableActions.includes('edit')){
        const fulfillment=await api.get(orderBase+(row?.orderId || d.orderId)+'/fulfillment');
        if(!current())return;
        const lines=fulfillment.returnCheck.items.map(i=>{
          const existing=row?.items.find(x=>x.itemId===i.itemId);
          return {...i,quantity:existing?.quantity || '',typeIndex:Math.max(0,issueTypes.findIndex(t=>t.code===existing?.issueType))};
        });
        this.setData({editing:true,lines,checkVersion:fulfillment.returnCheck.version,summary:row?.summary || '',
          amount:row?.claimedFen!=null?(row.claimedFen/100).toFixed(2):''});
      }
    },
    slot(){return 'dispute:'+this.data.kind+':'+(this.data.id || this.data.orderId);},
    chooseStage(e){
      if(this.data.busy)return;
      this.setData({stageIndex:Number(e.detail.value),page:1,items:[],id:'',detail:null,editing:false,summary:'',photos:[]});
      return this.load();
    },
    chooseTab(e){if(this.data.busy)return;this.setData({kind:e.currentTarget.dataset.key,stageIndex:0,page:1,items:[],id:'',detail:null,creating:false,editing:false,summary:'',amount:'',photos:[]});return this.load();},
    changePage(e){this.setData({page:this.data.page+Number(e.currentTarget.dataset.step),id:'',detail:null,editing:false});return this.load();},
    open(e){this.setData({id:e.currentTarget.dataset.id,detail:null,editing:false,creating:false,summary:'',photos:[]});return this.load();},
    edit(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
    line(e){const {i,field}=e.currentTarget.dataset;this.setData({['lines['+i+'].'+field]:e.detail.value});},
    async attach(){
      if(this.picking || this.data.busy)return;
      this.picking=true;const owner=session.capture();
      try{
        const picked=await new Promise((ok,fail)=>wx.chooseMedia({count:9,mediaType:['image'],success:ok,fail:e=>/cancel/i.test(e.errMsg||'')?ok(null):fail(e)}));
        if(!picked || this.gone || !session.isCurrent(owner))return;
        return await ui.run(this,async current=>{
          const d=this.data, node=d.kind==='arbitrations' || !factory?'arbitration':'claim';
          for(const file of picked.tempFiles){if(!current())return;const id=await materials.uploadOrder(orderBase+(d.detail?.orderId || d.orderId),node,file.tempFilePath);
            if(current())this.setData({photos:this.data.photos.concat(id)});}
        });
      }catch(e){if(!this.gone && session.isCurrent(owner))this.setData({message:'添加照片失败，请重新选择'});}finally{this.picking=false;}
    },
    backToRecords() {
      if (this.data.busy) return;
      this.setData({ id: '', detail: null, pending: false, creating: false, editing: false,
        summary: '', amount: '', photos: [], lines: [] });
    },
    sourceOrder(){const row=this.data.detail;if(row)wx.navigateTo({url:"/pages/"+(factory?"factory/order":"orders/detail")+"?id="+row.orderId});},
    evidence(e){const d=this.data.detail;if(!d)return;return ui.run(this,async current=>{
      const v=await api.post(orderBase+d.orderId+'/evidence/'+e.currentTarget.dataset.id+'/view',{});
      if(current())wx.previewImage({urls:[v.url]});
    });},
    act(e){
      const name=e.currentTarget.dataset.action,d=this.data,row=d.detail,slot=this.slot();
      if(!(api.pending.has(slot) || d.creating && name==='save' || name==='save' && row?.actions.edit || row?.actions[name]))return;
      return ui.run(this,async current=>{
        let result, intent=api.pending.get(slot),actual=name;
        try{
          if(intent){actual=intent.path.split('/').pop();try{const receipt=await api.recover(slot);result=receipt?.receipt || receipt;}
            catch(err){if(err.status!==404 || !current())throw err;result=await api.command(slot,intent.path,intent.body);}}
          else{
            const evidence={evidenceIds:[],uploadReceiptIds:d.photos},summary=d.summary.trim();
            let path=base(d.kind)+'/'+d.id+'/'+name,body={expectedVersion:row?.version ?? d.checkVersion};
            if(name==='save'){
              if(!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(d.amount) || !summary){this.setData({message:'请填写损失金额和情况说明'});return;}
              const items=d.lines.filter(i=>i.quantity && Number(i.quantity)>0).map(i=>({itemId:i.itemId,issueType:issueTypes[i.typeIndex].code,quantity:Number(i.quantity),description:null}));
              if(!items.length || items.some(v=>!Number.isSafeInteger(v.quantity) || v.quantity>d.lines.find(i=>i.itemId===v.itemId).expectedQuantity)){this.setData({message:'请核对受影响道具的数量'});return;}
              evidence.evidenceIds=row?.evidenceIds || [];
              Object.assign(body,{problemType:items[0].issueType,claimedFen:Math.round(Number(d.amount)*100),summary,evidence,items});
              if(d.creating)path=orderBase+d.orderId+'/claims';
            }else if(['appeal','supplement'].includes(name)){
              if(!summary){this.setData({message:'请填写原因或补充说明'});return;}
              Object.assign(body,{summary,evidence});
            }
            if(['submit','confirm','withdraw','appeal'].includes(name) && !await ui.confirm(verbs[name]+'？',name==='confirm'?'确认后按核定金额执行扣款及补缴。':'请核对本次提交的内容。'))return;
            if(!current())return;result=await api.command(slot,path,body);
          }
          if(!current())return;
          if(d.creating){this.setData({id:result?.resourceId || result?.receipt?.resourceId || '',creating:false});}
          if(actual==='pay' && result?.parameters)await api.nativePayment(result.parameters,current);
          if(current()){this.setData({summary:'',photos:[],editing:false});await this.read(current);}
        }finally{if(current())this.setData({pending:api.pending.has(this.slot())});}
      });
    }
  };
};
