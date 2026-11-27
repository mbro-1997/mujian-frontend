const { hint } = require("./form-error");
const api = require('./trading'),
  ui = require('./trading-page');
module.exports = function (factory) {
  const endpoint = '/api/me/' + (factory ? 'factory-orders' : 'rental-orders');
  return {
    data: {
      id: '',
      detail: null,
      items: [],
      factory,
      quote: null,
      extensionDays: '1',
      extensionQuote: null,
      reason: '',
      rejecting: false,
      busy: false,
      message: '',
      fulfillmentVisible: false, expenseVisible:false,
      canAccept: false,
      canReject: false,
      canCancel: false,
    },
    onLoad(q) {
      this.setData({ id: q.id });
    },
    onShow() {
      ui.show(this);
      return this.load();
    },
    onHide() {
      ui.hide(this);
    },
    hasPendingOperation() {
      return ['accept:', 'reject:', 'cancel-order:', 'extend:'].some(key => api.pending.has(key + this.data.id));
    },
    onUnload() {
      ui.hide(this);
    },
    onAccessLost() { api.checkListCard("orders", this.data.id, null); },
    load() {
      return ui.run(this, async (current) => {
        const detail = await api.get(endpoint + '/' + this.data.id);
        if (!current()) return;
        const { items, ...summary } = detail;
        const card = api.order(summary);
        api.checkListCard("orders", this.data.id, card);
        this.setData({
          detail: {
            ...card,
            outbound: api.route(detail.outbound),
            return: api.route(detail.return),
          },
          extensionQuote: null,
          items: items.map(api.item),
          expenseVisible:detail.availableActions.includes('transport_expense'),settlementVisible:detail.availableActions.includes('view_settlement'),
          fulfillmentVisible: ["accepted", "fulfilling", "return_checking", "completed"].includes(detail.orderStatus),
          canExtend:detail.availableActions.includes('request_extension'),
          canAccept: detail.availableActions.includes('accept'),
          canReject: detail.availableActions.includes('reject'),
          canCancel: detail.availableActions.includes('cancel'),
          quote: null,
          rejecting: false,
        });
      });
    },
    changeExtensionDays(event) {
      this.setData({ extensionDays: event.detail.value, extensionQuote: null });
    },
    previewExtension() {
      const days = String(this.data.extensionDays);
      if (!/^[1-9][0-9]{0,2}$/.test(days) || Number(days) > 120) {
        this.setData({ extensionQuote: null });
        hint('请填写 1 至 120 之间的整数天数');
        return;
      }
      this.setData({ extensionQuote: null });
      return ui.act(this, async (current) => {
        const quote = await api.get(endpoint + '/' + this.data.id + '/extension-quote?extraDays=' + days);
        if (current() && String(this.data.extensionDays) === days)
          this.setData({ extensionQuote: {
            orderVersion:quote.orderVersion,extraDays:quote.extraDays,
            dueDate: quote.requestedDueDate,
            amount: api.money(quote.rentFen),
            deadline: api.displayTime(quote.latestPaidAt),
          } });
      });
    },
    disputes() {wx.navigateTo({url:"/pages/"+(factory?"factory":"orders")+"/disputes?orderId="+this.data.id});},
    extensions() {wx.navigateTo({url:'/pages/'+(factory?'factory':'orders')+'/extensions?orderId='+this.data.id});},
    submitExtension() {
      const id=this.data.id,q=this.data.extensionQuote,slot='extend:'+id;
      if(!q && !api.pending.has(slot))return;
      return ui.act(this,async current=>{
        let result,ext;
        if(api.pending.has(slot)){
          const intent=api.pending.get(slot);
          try {ext=(await api.recover(slot)).resourceId;}
          catch(err){if(err.status!==404 || !current())throw err;result=await api.command(slot,intent.path,intent.body);}
        }else result=await api.command(slot,endpoint+'/'+id+'/extensions',{expectedVersion:q.orderVersion,extraDays:q.extraDays});
        if(!current())return;
        if(result){ext=result.recovered?result.receipt.resourceId:result.resourceId;if(result.parameters)await api.nativePayment(result.parameters);}
        if(current())wx.navigateTo({url:'/pages/orders/extensions?orderId='+id+'&id='+ext});
      });
    },
    reason(e) {
      this.setData({ reason: e.detail.value });
    },
    async accept() {
      if (
        !(await ui.confirm(
          '确认接单？',
          '请核对库存、租期和配送要求。接单后出库前仍可能发生取消。',
        ))
      )
        return;
      const result = await ui.act(this, () =>
        api.command('accept:' + this.data.id, endpoint + '/' + this.data.id + '/accept', {
          expectedVersion: this.data.detail.version,
        }),
        "已接单",
      );
      if (result) return this.load();
    },
    reject() {
      this.setData({ rejecting: true, reason: '', quote: null, message: '' });
    },
    async confirmReject() {
      if (!this.data.reason.trim()) {
        hint('请填写拒绝接单原因');
        return;
      }
      const result = await ui.act(this, () =>
        api.command('reject:' + this.data.id, endpoint + '/' + this.data.id + '/reject', {
          expectedVersion: this.data.detail.version,
          reason: this.data.reason.trim(),
        }),
        "已拒绝接单",
      );
      if (result) return this.load();
    },
    cancelQuote() {
      return ui.act(this, async (current) => {
        const quote = await api.post(endpoint + '/' + this.data.id + '/cancel-quote', {
          expectedVersion: this.data.detail.version,
        });
        if (current())
          this.setData({
            quote: {
              ...quote,
              deduction: api.money(quote.deductionFen),
              rent: api.money(quote.rentRefundFen),
              deposit: api.money(quote.depositRefundFen),
              freight: api.money(quote.freightRefundFen),
              total: api.money(quote.totalRefundFen),
            },
            reason: '',
            rejecting: false,
          });
      });
    },
    async confirmCancel() {
      if (!this.data.quote) return;
      if (!this.data.reason.trim()) {
        hint('请填写取消原因');
        return;
      }
      const result = await ui.act(this, () =>
        api.command('cancel-order:' + this.data.id, endpoint + '/' + this.data.id + '/cancel', {
          confirmToken: this.data.quote.confirmToken,
          reason: this.data.reason.trim(),
        }),
        "取消申请已提交",
      );
      if (result) return this.load();
    },
    close() {
      this.setData({ quote: null, rejecting: false, message: '' });
    },
    recover() {
      return ui.act(this, async (current) => {
        if (api.pending.has('extend:' + this.data.id)) {
          const receipt = await api.recover('extend:' + this.data.id);
          if (current() && receipt) wx.navigateTo({url:'/pages/orders/extensions?orderId='+this.data.id+'&id='+receipt.resourceId});
          return;
        }
        for (const prefix of ['accept:', 'reject:', 'cancel-order:'])
          if (api.pending.has(prefix + this.data.id)) {
            await api.recover(prefix + this.data.id);
            if (current()) this.tradeTimer = setTimeout(() => this.load(), 0);
            return;
          }
        throw new Error('没有待确认操作，请刷新订单');
      });
    },
    issues() { wx.navigateTo({url:"/pages/orders/issues?id="+this.data.id}); },
    settlements(){wx.navigateTo({url:"/pages/factory/settlements"});},
    expense(){wx.navigateTo({url:"/pages/factory/expense?id="+this.data.id});},
    fulfillment() {
      wx.navigateTo({ url: "/pages/" + (factory ? "factory" : "orders") + "/fulfillment?id=" + this.data.id });
    },
    rules() {
      const rule = this.data.detail && this.data.detail.cancellationRule;
      if (rule) wx.navigateTo({ url: '/pages/rules/index?id=' + rule.documentId });
    },
    refund(e) {
      wx.navigateTo({ url: '/pages/refund/detail?id=' + e.currentTarget.dataset.id });
    },
    payment() {
      if (!factory) wx.navigateTo({ url: '/pages/payment/index?id=' + this.data.detail.batchId });
    },
    inaccessible(e) {
      this.setData({ detail: null, items: [], message: e.detail.message });
    },
  };
};
