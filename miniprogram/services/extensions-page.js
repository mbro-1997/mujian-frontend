const { hint } = require("./form-error");
const successToast = require("./success-toast");
const api = require('./trading');
const ui = require('./trading-page');

const statuses = {
  pending_payment:'待支付延期租金',pending_factory:'待工厂确认',factory_warning:'已预警 · 待工厂确认',
  approved:'延期已生效',rejected_refunding:'工厂已拒绝，退款中',rejected_refunded:'工厂已拒绝，退款已到账',
  payment_failed:'付款已关闭',cancelled:'延期已取消',
};
const refunds = {pending:'待提交退款',processing:'退款中',failed:'退款待处理',success:'退款已到账',cancelled:'退款已撤销'};
function present(row) {
  return {...row,label:statuses[row.extensionStatus],amount:api.money(row.rentFen),deadline:api.displayTime(row.factoryDeadlineAt),
    refundLabel:row.refund && refunds[row.refund.status],actions:Object.fromEntries(row.availableActions.map(a=>[a,true]))};
}
module.exports = function extensionPage(factory) {
  const endpoint='/api/me/'+(factory?'factory-extensions':'extensions');
  return {
    data:{orderId:'',id:'',items:[],detail:null,reason:'',page:1,total:0,factory,busy:false,message:'',pending:false},
    onLoad(q){this.setData({orderId:q.orderId || '',id:q.id || ''});},
    onShow(){ui.show(this);return this.load();},onHide(){ui.hide(this);},onUnload(){ui.hide(this);},
    load(){return ui.run(this,current=>this.read(current));},
    async read(current) {
      if (this.data.id) return this.readDetail(this.data.id, current);
      const query='?page='+this.data.page+'&pageSize=15'+(this.data.orderId?'&orderId='+encodeURIComponent(this.data.orderId):'');
      const page=await api.get(endpoint+query);
      if(!current())return;
      this.setData({items:page.items.map(present),total:Number(page.total)});
    },
    async readDetail(id, current) {
      const row = await api.get(endpoint + '/' + id);
      if (current()) this.setData({detail: present(row), pending: api.pending.has('extension-action:' + id)});
    },
    changePage(e){this.setData({page:this.data.page+Number(e.currentTarget.dataset.step),id:'',detail:null,reason:''});return this.load();},
    open(e) {
      if (this.data.busy) return;
      const id = e.currentTarget.dataset.id;
      wx.navigateTo({ url: '/pages/' + (factory ? 'factory' : 'orders') + '/extensions?id=' +
        encodeURIComponent(id) + (this.data.orderId ? '&orderId=' + encodeURIComponent(this.data.orderId) : '') });
    },
    reason(e){this.setData({reason:e.detail.value});},
    async act(e){
      const name=e.currentTarget.dataset.action,row=this.data.detail;
      if(!row || this.data.busy || !(this.data.pending || row.actions[name]))return;
      const slot='extension-action:'+row.id, reason=this.data.reason.trim();
      if(name==='reject' && !reason){hint('请说明拒绝原因');return;}
      return ui.act(this,async current=>{
        if(!this.data.pending && name!=='pay'){
          const title={approve:'确认同意延期？',reject:'确认拒绝延期？',cancel:'确认取消延期？'}[name];
          const message=name==='approve'?'生效后按新的归还日期履约。':'本次延期租金将原路退回。';
          if(!await ui.confirm(title,message) || !current())return;
        }
        try {
          let result;
          if(api.pending.has(slot)){
            const intent=api.pending.get(slot);
            try {await api.recover(slot);}
            catch(err){if(err.status!==404 || !current())throw err;result=await api.command(slot,intent.path,intent.body);}
          }else result=await api.command(slot,endpoint+'/'+row.id+'/'+name,{expectedVersion:row.version,...(name==='reject'?{reason}:{})});
          if(!current())return;
          if(result && result.parameters)await api.nativePayment(result.parameters);
          else if(name!=='pay')successToast('操作已提交');
        }finally {
          if(current()){this.setData({pending:api.pending.has(slot)});await this.read(current);}
        }
      });
    }
  };
};
