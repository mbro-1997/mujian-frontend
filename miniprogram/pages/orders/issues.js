const { hint, ValidationError } = require("../../services/form-error");
const successToast = require("../../services/success-toast");
const api = require('../../services/trading');
const ui = require('../../services/trading-page');
const materials = require('../../services/verification');
const session = require('../../session/storage');
const labels = { submitted:'已上报', processing:'处理中', waiting_evidence:'请补充材料',
  resolved:'已解决', transferred_arbitration:'已转仲裁', closed:'已关闭' };
function present(issue) {
  const progress={pending:'待提交退款',processing:'退款中',success:'退款成功',failed:'退款待处理',cancelled:'已撤销'};
  const refunds=issue.plan ? issue.plan.refunds.map(r=>({...r,amount:api.money(r.amountFen),label:progress[r.status]})) : [];
  return { ...issue, refunds, statusText: labels[issue.status], createdText: api.displayTime(issue.createdAt),
    canSupplement: issue.availableActions.includes('supplement') };
}
require('../../session/page')({
  data: { orderId:'', issueId:'', items:[], detail:null, page:1, total:0, summary:'', photos:[], message:'', busy:false, pending:false },
  onLoad(q) { this.setData({orderId:q.id,issueId:q.issueId || ''}); },
  onShow() { ui.show(this); if (!this.picking) return this.load(); },
  onHide() { ui.hide(this); },
  onUnload() { this.gone=true; ui.hide(this); },
  async read(current) {
    if (this.data.issueId) return this.readDetail(this.data.issueId, current);
    const result=await api.get('/api/me/issues?orderId='+this.data.orderId+'&page='+this.data.page+'&pageSize=15');
    if (!current()) return;
    this.setData({items:result.items.map(present),total:Number(result.total)});
  },
  async readDetail(id,current) {
    const issue=await api.get('/api/me/issues/'+id);
    if (current()) this.setData({detail:present(issue),pending:api.pending.has('supplement:'+id)});
  },
  load() { return ui.run(this,current=>this.read(current)); },
  open(e) {
    if (this.data.busy) return;
    wx.navigateTo({url:'/pages/orders/issues?id='+encodeURIComponent(this.data.orderId)+'&issueId='+encodeURIComponent(e.currentTarget.dataset.id)});
  },
  changePage(e) {
    this.setData({page:this.data.page+Number(e.currentTarget.dataset.step),detail:null,summary:'',photos:[]});
    return this.load();
  },
  edit(e) { this.setData({summary:e.detail.value}); },
  removeDraftPhoto(e) {
      if (this.data.busy || this.data.pending) return;
      this.setData({ photos: this.data.photos.filter(photo => photo.id !== e.currentTarget.dataset.id) });
    },
  async attach() {
    if (this.picking || this.data.busy || !this.data.detail) return;
    const owner=session.capture(), issue=this.data.detail;
    this.picking=true;
    try {
      const selection=await new Promise((resolve,reject)=>wx.chooseMedia({count:9,mediaType:['image'], sizeType: ["original", "compressed"],
        success:resolve,fail:e=>/cancel/i.test(e.errMsg || '') ? resolve(null) : reject(e)}));
      if (!selection || this.gone || !session.isCurrent(owner)) return;
      await ui.act(this,async current=>{
        for (const file of selection.tempFiles) {
          if (!current()) return;
          const id=await materials.uploadOrder('/api/me/rental-orders/'+issue.orderId,
            issue.scene==='receipt'?'receipt_check':'in_use_report',file.tempFilePath);
          if (current()) this.setData({photos:this.data.photos.concat({ id, src: file.tempFilePath })});
        }
      });
    } catch (error) { if (!this.gone && session.isCurrent(owner)) hint('无法添加照片，请重新选择'); }
    finally { this.picking=false; }
  },
  submit() {
    const issue=this.data.detail;
    if (!issue) return;
    return ui.act(this,async current=>{
      const slot='supplement:'+issue.id;
      try {
        if (api.pending.has(slot)) {
          const intent=api.pending.get(slot);
          try { await api.recover(slot); }
          catch (e) {
            if (e.status!==404 || !current()) throw e;
            await api.command(slot,intent.path,intent.body);
          }
        } else {
          const summary=this.data.summary.trim();
          if (!summary) throw new ValidationError('请填写补充说明');
          await api.command(slot,'/api/me/issues/'+issue.id+'/supplement',{expectedVersion:issue.version,summary,
            evidence:{evidenceIds:[],uploadReceiptIds:this.data.photos.map(photo => photo.id)}});
        }
        if (!current()) return;
        this.setData({summary:'',photos:[],pending:false});
        successToast('补充说明已提交');
        await this.read(current);
      } catch(e) {
        if (current()) this.setData({pending:api.pending.has(slot)});
        if (current() && e.reason==='VERSION_CONFLICT') await this.readDetail(issue.id,current);
        throw e;
      }
    });
  },
});
