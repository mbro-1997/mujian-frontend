const evidencePhotos = require('./evidence-photos');
const { hint, ValidationError } = require("./form-error");
const api = require('./trading');
const ui = require('./trading-page');
const materials = require('./verification');
const session = require('../session/storage');

const titles = {
  outbound: '出库留证',
  receipt: '收货核验',
  shipment: '归还道具',
  returnCheck: '归还核验',
  complete: '核验结果',
  history: '履约记录',
};
const stageFilters = [{ key: "view", title: "履约阶段", options: Object.entries(titles).map(([code, label]) => ({ code, label })) }];
const nodes = {
  outbound: 'outbound',
  receipt: 'receipt_check',
  shipment: 'return_sent',
  returnCheck: 'return_check',
};
const labels = {
  pending: '待核对',
  problem_reported: '问题处理中',
  completed: '已出库',
  not_dispatched: '尚未出库',
  cancelled: '已取消',
  confirmed: '已确认收货',
  auto_confirmed: '到期已收货',
  not_started: '尚未开始',
  draft: '已暂存',
  sent: '已发出',
  warning: '核验已预警',
  no_issue: '工厂确认无异常',
  admin_closed: '平台已关闭核验',
  auto_closed: '到期已关闭核验',
  claim_submitted: '已提出索赔',
  refunded: '已退回',
  refunding: '原路退款中',
  paid: '已支付',
  held: '已收取',
  settled: '已结清',
  self_pickup: '用户自提',
  factory_delivery: '工厂配送',
  factory_assisted_call: '工厂代叫',
  user_return: '用户送回',
  factory_pickup: '工厂取回',
};
const outcomes = { intact: '核验完好', repair: '送修', lost: '丢失', scrap: '报废' };
const stockStates = { recorded: '已登记，待执行', repair_pending: '维修中，仍占用', applied: '已处理', replaced: '已续办' };
const blank = (v) => (v || '').trim() || null;
function initialView(f) {
  if (f.returnCheck.closedAt) return 'complete';
  if (f.returnCheck.id || f.shipment.status === 'sent') return 'returnCheck';
  if (f.receipt.confirmedAt) return 'shipment';
  return f.outbound.outboundAt ? 'receipt' : 'outbound';
}
function formFor(view, root) {
  const at = root.sentAt || root.expectedArrivalAt || '';
  return {
    handoverMethod: '', disputed: false,
    remark: root.remark || '',
    trackingNo: root.trackingNo || '',
    carrierName: root.carrierName || '',
    date: at.slice(0, 10),
    time: at.slice(11, 16),
    seconds: at.slice(17,23) || '00',
  };
}
function handoverTime(date,minute,seconds='00') {
  if(!date || !minute)return null;
  const parts=String(seconds || '00').trim().match(/^([0-5]?\d)(?:\.(\d{1,3}))?$/);
  if(!parts)return null;
  return date+'T'+minute+':'+parts[1].padStart(2,'0')+'.'+(parts[2] || '').padEnd(3,'0')+'+08:00';
}
function queryPage(path, page) {
  return (
    path + (path.includes('?') ? '&' : '?') + 'page=' + page + '&pageSize=12'
  );
}
function stageModel(context, order, view, factory) {
  const root = context[view] || context.returnCheck;
  const actions = context[view]
    ? Object.fromEntries(root.availableActions.map((key) => [key, true]))
    : {};
  const mode =
    view === 'outbound' || view === 'receipt'
      ? context.outbound.serviceMode
      : context.shipment.method;
  const items = (
    view === 'returnCheck' ? context.returnCheck : context.outbound
  ).items.map((row) => {
    const snapshot = order.items.find((i) => i.skuId === row.skuId);
    return {
      ...row,
      requirement: snapshot?.transportRequirement || '',
      quantityInput: String(row.checkedQuantity),
    };
  });
  const canPhoto = {
    outbound: factory && (actions.save || actions.append_evidence),
    receipt:
      !factory &&
      (actions.confirm ||
        (context.disputeProtectionReady && root.confirmedAt && !root.paused)),
    shipment:
      actions.save ||
      actions.start_pickup ||
      (context.disputeProtectionReady &&
        root.status === 'sent' &&
        factory === (root.method === 'factory_pickup')),
    returnCheck:
      factory &&
      root.id &&
      (actions.scan ||
        (context.disputeProtectionReady &&
          root.closedAt &&
          !root.claimCreated)),
  };
  return {
    view,
    root,
    actions,
    modeText: labels[mode],
    pickup: mode === 'factory_pickup',
    canPhoto: !!canPhoto[view],
    canRemove: !!(
      canPhoto[view] &&
      (view === 'outbound' || view === 'shipment') &&
      !root.outboundAt &&
      root.status !== 'sent'
    ),
    statusText: labels[root.status] || '待核实',
    depositText: labels[context.returnCheck.depositStatus] || '待核实',
    progress: items.reduce((sum, i) => sum + i.checkedQuantity, 0),
    expected: items.reduce((sum, i) => sum + i.expectedQuantity, 0),
    hasAsset: items.some((i) => i.assetType === 'A_ASSET'),
    items,
  };
}
function countdown(deadline, now) {
  const minutes = Math.ceil((Date.parse(deadline) - now) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes <= 0) return '已到截止时间，请刷新进度';
  return (
    '剩余 ' + Math.floor(minutes / 60) + ' 小时 ' + (minutes % 60) + ' 分钟'
  );
}
function nativeCall(method, options) {
  return new Promise((resolve, reject) =>
    wx[method]({
      ...options,
      success: resolve,
      fail: (e) =>
        /cancel/i.test(e.errMsg || '')
          ? resolve(null)
          : reject(new Error('调用微信设备能力失败，请检查授权后重试')),
    }),
  );
}
module.exports = function fulfillmentPage(factory) {
  return {
    data: {
      id: '',
      view: '',
      factory,
      stageFilters,
      photoFilters: [{"key": "photoKind", "title": "照片类型", "options": [{"code": "outbound", "label": "出库照片"}, {"code": "handover", "label": "交接照片"}]}],
      detail: null,
      context: null,
      root: {},
      actions: {},
      form: {},
      photoKind: 'outbound',
      items: [],
      photos: [],
      records: [],
      message: '',
      busy: false,
      issueOpen: false, issueSummary: '', issueEffect: '', issueRows: [], issuePhotos: [],
      issueTypes: [
        { code: 'not_as_described', label: '与描述不符' }, { code: 'quantity_mismatch', label: '数量不符' },
        { code: 'damaged', label: '破损' }, { code: 'hidden_defect', label: '隐蔽故障' }, { code: 'other', label: '其他' }
      ],
      claimStock: [], stockForm: null, stockChoices: [],
      pending: false,
    },
    feeModel(fee) {
      if (!fee) return null;
      const labels={awaiting_handover:'待核实交接',pending_review:'待平台核定',effective:'已核定'};
      const amount=v=>v==null?'待核定':'¥'+api.money(v);
      const methodLabels={carrier:'实际交运',self_delivery:'实际开始自送',factory_pickup:'工厂实际接走'};
      return {...fee, label:labels[fee.status], method:methodLabels[fee.handoverMethod] || '实际交接', at:fee.handoverAt?api.displayTime(fee.handoverAt):'待核实',
        elapsed:fee.elapsedMs==null?'待核实':fee.elapsedMs/1000+' 秒',
        rent:amount(fee.rentFen), cap:amount(fee.capFen), liability:amount(fee.liabilityFen),
        rentOffset:amount(fee.rentOffsetFen), liabilityOffset:amount(fee.liabilityOffsetFen),
        rentDue:amount(fee.rentDueFen), liabilityDue:amount(fee.liabilityDueFen), rentPaid:amount(fee.rentPaidFen),
        liabilityPaid:amount(fee.liabilityPaidFen), remaining:amount(fee.availableDepositFen)};
    },
    recordPickup() {
      return ui.run(this,async current=>{
        const {form,fee}=this.data;
        const at=handoverTime(form.actualDate,form.actualTime,form.actualSeconds);
        if(!this.data.canRecordPickup || !at || !blank(form.actualBasis))
          throw new ValidationError('请填实际接走的北京时间和交接依据');
        if(!await ui.confirm('已从买家处接走？','请核对实际接走时间及依据。'))return;
        await this.mutate('/return-shipment/handover',{expectedVersion:fee.version,
          handoverAt:at, basis:form.actualBasis.trim(),disputed:!!form.disputed},'已登记实际接走',current);
      });
    },
    createClaim(){wx.navigateTo({url:'/pages/factory/disputes?create=1&orderId='+this.data.id});},
    onLoad(q) {
      this.rootPath =
        '/api/me/' + (factory ? 'factory-orders/' : 'rental-orders/') + q.id;
      this.slot = 'fulfillment:' + (factory ? 'factory:' : 'buyer:') + q.id;
      this.setData({ id: q.id, view: titles[q.view] ? q.view : '' });
    },
    onShow() {
      ui.show(this);
      if (!this.nativeOpen) return this.load();
    },
    onHide() {
      ui.hide(this);
      clearInterval(this.countdownTimer);
      this.setData({ photos: [] });
    },
    onUnload() {
      this.unloaded = true;
      this.onHide();
    },
    onSessionReset() {
      clearInterval(this.countdownTimer);
      this.nativeOpen = false;
      this.dirty = false;
    },
    async read(current) {
      const [context, order] = await Promise.all([
        api.get(this.rootPath + '/fulfillment'),
        api.get(this.rootPath).catch((error) => {
          if (error.reason === 'TRADE_DATA_INCONSISTENT') return null;
          throw error;
        }),
      ]);
      if (!current()) return;
      const view = this.data.view || initialView(context);
      if (!order) {
        this.setData({
          detail: null,
          actions: {},
          message: view === 'shipment' && context.shipment.method === 'factory_pickup'
            ? '订单信息不完整，无法核实下单时的取回地址，请联系平台。'
            : '订单信息不完整，请联系平台核实。',
        });
        return;
      }
      const model = stageModel(context, order, view, factory);
      let claimStock = [];
      if (factory && view === 'returnCheck') {
        const ids = order.disputes?.claimIds || [];
        claimStock = await Promise.all(ids.map(async id => {
          const result = await api.get(this.rootPath + '/return-check/claim-stock?claimId=' + encodeURIComponent(id));
          return { ...result, records: result.records.map(r => ({ ...r, label: outcomes[r.outcome], statusText: stockStates[r.status] })) };
        }));
        if (!current()) return;
      }
      const form = this.dirty ? this.data.form : formFor(view, model.root);
      const dates = {};
      for (const key of [
        'startAt',
        'deadlineAt',
        'confirmedAt',
        'sentAt',
        'expectedArrivalAt',
        'expectedCheckStartAt',
        'warningAt',
        'autoCloseAt',
        'closedAt',
        'outboundAt',
      ])
        dates[key] = api.displayTime(model.root[key]);
      this.setData({
        fee: this.feeModel(order.disputes?.overdueFee),
        canRecordPickup: context.shipment.availableActions.includes('confirm_pickup_handover'),
        ...model, claimStock, stockForm: null,
        canReport: !factory && order.availableActions.includes('report_issue') && !context.shipment.sentAt && !context.returnCheck.id &&
          ((view === 'receipt' && ['accepted','fulfilling'].includes(order.orderStatus) && !context.receipt.confirmedAt) ||
           (view === 'shipment' && context.receipt.confirmedAt && order.orderStatus === 'fulfilling')),
        context,
        detail: order,
        pickupPhone: model.pickup && !factory
          ? (order.receiver?.phone || '').replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
          : '',
        dates,
        form,
        pending: api.pending.has(this.slot),
        photos: [],
        records: [],
        photoPage: 0,
        recordPage: 0,
        morePhotos: false,
        moreRecords: false,
      });
      wx.setNavigationBarTitle({
        title: view === 'shipment' && model.pickup ? '工厂取回' : titles[view],
      });
      clearInterval(this.countdownTimer);
      const clientStart = Date.now(),
        serverStart = Date.parse(context.serverTime);
      const tick = () =>
        this.setData({
          remaining: countdown(
            model.root.deadlineAt,
            serverStart + Date.now() - clientStart,
          ),
        });
      tick();
      if (
        view === 'receipt' &&
        !model.root.confirmedAt &&
        model.root.deadlineAt
      )
        this.countdownTimer = setInterval(tick, 30000);
      if (nodes[view]) await this.readPhotos(current, 1);
      if (
        current() &&
        (view === 'history' ||
          (factory &&
            ['outbound', 'returnCheck'].includes(view) &&
            model.root.id))
      )
        await this.readRecords(current, 1);
    },
    load() {
      return ui.run(this, (current) => this.read(current));
    },
    openStock(e) {
      const data = e.currentTarget.dataset;
      const state = this.data.claimStock[data.claim];
      const prior = data.record == null ? null : state.records[data.record];
      const line = prior ? state.lines.find(l => l.reservationId === prior.reservationId) : state.lines[data.line];
      if (!line || !state.canRecord) return;
      const choices = Object.entries(outcomes).filter(([code]) => !prior || code !== 'repair').map(([code,label]) => ({code,label}));
      this.setData({stockChoices: choices, stockForm: {claimId: state.claimId, expectedVersion:state.version, reservationId:line.reservationId,
        itemId:line.itemId, name:line.name, snId:line.snId, snCode:line.snCode, replacesId:prior?.id || null,
        quantity: prior ? prior.quantity : line.snId ? 1 : '', max: prior ? prior.quantity : line.unrecordedQuantity, choice:null, remark:''}});
    },
    editStock(e) { this.setData({['stockForm.' + e.currentTarget.dataset.field]: e.detail.value}); },
    cancelStock() { this.setData({stockForm:null}); },
    submitStock() {
      return ui.run(this, async current => {
        const f=this.data.stockForm, quantity=Number(f.quantity);
        if (f.choice == null || !f.remark.trim() || !Number.isInteger(quantity) || quantity<1 || quantity>f.max)
          throw new ValidationError('请选择实际处置，填写数量和核验说明');
        const selected=this.data.stockChoices[f.choice];
        if (!await ui.confirm('登记实物结果？', f.name+' · '+quantity+' 件 · '+selected.label)) return;
        await this.mutate('/return-check/claim-stock', {claimId:f.claimId,expectedVersion:f.expectedVersion,reservationId:f.reservationId,
          itemId:f.itemId,snId:f.snId,replacesId:f.replacesId,quantity,outcome:selected.code,remark:f.remark.trim()},
          '实物结果已登记',current);
      });
    },
    changeStage(e) {
      if (this.data.busy || this.data.view === e.detail.value)
        return;
      const url =
        '/pages/' +
        (factory ? 'factory' : 'orders') +
        '/fulfillment?id=' +
        this.data.id +
        '&view=' +
        e.detail.value;
      wx.redirectTo({ url });
    },
    edit(e) {
      this.dirty = true;
      this.setData({
        ['form.' + e.currentTarget.dataset.field]: e.detail.value,
      });
    },
    quantityInput(e) {
      this.setData({
        ['items[' + e.currentTarget.dataset.index + '].quantityInput']:
          e.detail.value,
      });
    },
    photoKind(e) {
      const kind = e.detail.value;
      if (
        !['outbound', 'handover'].includes(kind) ||
        this.data.view !== 'outbound' ||
        this.data.busy
      )
        return;
      this.setData({ photoKind: kind, photos: [] });
      return ui.run(this, (current) => this.readPhotos(current, 1));
    },
    async readPhotos(current, page) {
      const node =
        this.data.view === 'outbound'
          ? this.data.photoKind
          : nodes[this.data.view];
      const data = await api.get(
        queryPage(this.rootPath + '/evidence?node=' + node, page),
      );
      if (!current()) return;
      const photos = await evidencePhotos(this.rootPath, data.items);
      if (current())
        this.setData({
          photos: (page === 1 ? [] : this.data.photos).concat(photos),
          photoPage: page,
          morePhotos: page * 12 < Number(data.total),
        });
    },
    morePhotos() {
      return ui.run(this, (current) =>
        this.readPhotos(current, this.data.photoPage + 1),
      );
    },
    async readRecords(current, page) {
      const view = this.data.view;
      const path =
        view === 'history'
          ? '/fulfillment/events'
          : (view === 'outbound' ? '/outbound' : '/return-check') + '/scans';
      const data = await api.get(queryPage(this.rootPath + path, page));
      const rows = data.items.map((v) => ({
        id: v.id,
        label: v.summary || v.snCode,
        time: api.displayTime(v.time || v.scannedAt),
      }));
      if (current())
        this.setData({
          records: (page === 1 ? [] : this.data.records).concat(rows),
          recordPage: page,
          moreRecords: page * 12 < Number(data.total),
        });
    },
    moreRecords() {
      return ui.run(this, (current) =>
        this.readRecords(current, this.data.recordPage + 1),
      );
    },
    preview(e) {
      return ui.run(this, async (current) => {
        const { url } = await api.post(
          this.rootPath + '/evidence/' + e.currentTarget.dataset.id + '/view',
        );
        if (current()) wx.previewImage({ urls: [url], current: url });
      });
    },
    async mutate(path, body, feedback, current, clearForm = false) {
      try {
        const result = await api.command(this.slot, this.rootPath + path, body);
        if (!current()) return;
        if (clearForm) this.dirty = false;
        hint(result.duplicate ? '此件已核对，数量未重复增加' : feedback);
        await this.read(current);
      } catch (error) {
        if (current()) {
          this.setData({ pending: api.pending.has(this.slot) });
          if (
            [
              'VERSION_CONFLICT',
              'FULFILLMENT_STATE_CHANGED',
              'RETURN_ALREADY_CLOSED',
              'RETURN_CLAIM_EXISTS', 'CLAIM_STATE_CHANGED',
              'FULFILLMENT_PAUSED',
            ].includes(error.reason)
          )
            await this.read(current);
        }
        throw error;
      }
    },
    write(path, fields, message, clearForm) {
      const body = { expectedVersion: this.data.root.version, ...fields };
      return ui.run(this, (current) =>
        this.mutate(path, body, message, current, clearForm),
      );
    },
    quantity(e) {
      const item = this.data.items[e.currentTarget.dataset.index],
        value = item.quantityInput;
      if (!/^\d+$/.test(value) || Number(value) > item.expectedQuantity) {
        hint('请填写 0 至 ' + item.expectedQuantity + ' 之间的整数');
        return;
      }
      return this.write(
        (this.data.view === 'outbound' ? '/outbound' : '/return-check') +
          '/quantity',
        { itemId: item.itemId, quantity: Number(value) },
        '核对数量已保存',
      );
    },
    async device(method, options, consume) {
      if (this.nativeOpen || this.data.busy) return;
      const owner = session.capture(),
        version = this.data.root.version;
      this.nativeOpen = true;
      try {
        const value = await nativeCall(method, options);
        if (this.unloaded || !session.isCurrent(owner)) return;
        if (value)
          await ui.run(this, (current) => consume(value, version, current));
        else if (!this.tradeHidden) await this.load();
      } catch (error) {
        if (!this.unloaded && session.isCurrent(owner))
          this.setData({ message: error.message });
      } finally {
        this.nativeOpen = false;
      }
    },
    scan() {
      return this.device(
        'scanCode',
        { onlyFromCamera: true },
        (code, expectedVersion, current) =>
          this.mutate(
            (this.data.view === 'outbound' ? '/outbound' : '/return-check') +
              '/scans',
            { expectedVersion, code: code.path || code.result },
            '扫码成功，进度已保存',
            current,
          ),
      );
    },
    openIssue() {
      if (!this.data.canReport) return;
      const version = this.data.view === 'receipt' ? this.data.context.receipt.version : this.data.detail.version;
      this.setData({ issueOpen: true, issueVersion: version, issueSummary: '', issueRows: [], issuePhotos: [], issueEffect: '' });
      this.addIssueItem();
    },
    addIssueItem() {
      this.setData({ issueRows: this.data.issueRows.concat({ itemIndex: 0, typeIndex: 0, quantity: '1' }) });
    },
    removeIssueItem(event) {
      this.setData({ issueRows: this.data.issueRows.filter((_, index) => index !== Number(event.currentTarget.dataset.index)) });
    },
    editIssueItem(event) {
      const { index, field } = event.currentTarget.dataset;
      const value = field === 'quantity' ? event.detail.value : Number(event.detail.value);
      this.setData({ ['issueRows[' + index + '].' + field]: value });
    },
    editIssueSummary(event) { this.setData({ issueSummary: event.detail.value }); },
    selectIssueEffect(event) { this.setData({ issueEffect: event.detail.value }); },
    removeDraftPhoto(e) {
      if (this.data.busy || this.data.pending) return;
      this.setData({ issuePhotos: this.data.issuePhotos.filter(photo => photo.id !== e.currentTarget.dataset.id) });
    },
    attachIssuePhoto() {
      return this.device('chooseMedia', { count: 9, mediaType: ['image'], sourceType: ['camera','album'] },
        async (selection, version, current) => {
          const node = this.data.view === 'receipt' ? 'receipt_check' : 'in_use_report';
          for (const file of selection.tempFiles) {
            if (!current()) return;
            const receiptId = await materials.uploadOrder(this.rootPath, node, file.tempFilePath);
            if (current()) this.setData({ issuePhotos: this.data.issuePhotos.concat({ id: receiptId, src: file.tempFilePath }) });
          }
        });
    },
    submitIssue() {
      return ui.run(this, async (current) => {
        const scene = this.data.view === 'receipt' ? 'receipt' : 'in_use';
        const summary = this.data.issueSummary.trim(), effect = this.data.issueEffect;
        if (!summary || !effect || !this.data.issueRows.length) throw new ValidationError('请填写说明、涉及道具和处理方式');
        const keys = new Set();
        const items = this.data.issueRows.map(row => {
          const item = this.data.items[row.itemIndex], type = this.data.issueTypes[row.typeIndex].code;
          if (!item || !/^[1-9][0-9]*$/.test(row.quantity) || Number(row.quantity) > item.expectedQuantity)
            throw new ValidationError('受影响数量须在本单道具数量范围内');
          const key = item.itemId + ':' + type;
          if (keys.has(key)) throw new ValidationError('同一道具的同类问题请合并填写数量');
          keys.add(key);
          return { itemId: item.itemId, issueType: type, quantity: Number(row.quantity), description: null };
        });
        const input = { expectedVersion: this.data.issueVersion, scene, summary, effect,
          primaryIssueType: items[0].issueType, items, evidence: { evidenceIds: [], uploadReceiptIds: this.data.issuePhotos.map(photo => photo.id) } };
        try {
          await api.command(this.slot, this.rootPath + '/issues', input);
          if (!current()) return;
          this.setData({ issueOpen: false });
          hint(effect === 'paused' ? '已提交问题，普通履约已暂停' : '已提交问题，订单继续履约');
          await this.read(current);
        } catch (error) {
          if (current()) this.setData({ pending: api.pending.has(this.slot) });
          if (current() && error.reason === 'VERSION_CONFLICT') {
            await this.read(current);
            if (current()) this.setData({ issueVersion: scene === 'receipt' ? this.data.context.receipt.version : this.data.detail.version });
          }
          throw error;
        }
      });
    },
    photo() {
      return this.device(
        'chooseMedia',
        { count: 9, mediaType: ['image'], sourceType: ['camera', 'album'] },
        async (selection, expectedVersion, current) => {
          const node =
              this.data.view === 'outbound'
                ? this.data.photoKind
                : nodes[this.data.view],
            parts = [];
          for (const file of selection.tempFiles) {
            if (!current()) return;
            const receiptId = await materials.uploadOrder(
              this.rootPath,
              node,
              file.tempFilePath,
            );
            parts.push({
              receiptId,
              node,
              scene: node === 'return_sent' ? 'packaging' : null,
              itemId: null,
              statementId: null,
              transportLegId: null,
              capturedAt: null,
              text: null,
            });
          }
          if (current() && parts.length)
            await this.mutate(
              '/evidence',
              { expectedVersion, materials: parts },
              '照片已保存',
              current,
            );
        },
      );
    },
    async remove(e) {
      if (this.data.canRemove && !this.data.pending)
        return this.write(
          '/evidence/' + e.currentTarget.dataset.id + '/remove',
          {},
          '已移除草稿照片',
        );
    },
    async submit(e) {
      const name = e.currentTarget.dataset.action,
        view = this.data.view,
        form = this.data.form;
      if (!this.data.actions[name]) return;
      let path,
        fields = {},
        success;
      if (view === 'outbound') {
        path = '/outbound/' + name;
        if (name === 'save') fields = { remark: blank(form.remark) };
        if (
          name === 'confirm' &&
          blank(form.remark) !== blank(this.data.root.remark)
        ) {
          hint('备注有修改，请先暂存后再确认出库');
          return;
        }
        success = name === 'save' ? '出库草稿已暂存' : '已确认出库';
      } else if (view === 'receipt') {
        path = '/receipt/confirm';
        success = '已确认收货';
      } else if (view === 'shipment') {
        const at=handoverTime(form.date,form.time,form.seconds);
        if ((!at && (name !== 'save' || form.date)) || !!form.date !== !!form.time) {
          hint('请填写完整的日期和北京时间');
          return;
        }
        path =
          '/return-shipment/' +
          (name === 'start_pickup' ? 'start-pickup' : name);
        fields =
          name === 'start_pickup'
            ? { expectedArrivalAt: at, remark: blank(form.remark) }
            : {
                sentAt: at,
                carrierName: blank(form.carrierName),
                trackingNo: blank(form.trackingNo),
                remark: blank(form.remark),
              };
        if(name==='send') {
          if(!form.handoverMethod){hint('请选择实际寄送或自行送回');return;}
          fields.handoverMethod=form.handoverMethod;
          fields.disputed=!!form.disputed;
        }
        success = {
          start_pickup: '已开始取回',
          send: '已确认发出',
          save: '归还信息已暂存',
        }[name];
      } else {
        path = name === 'confirm_termination' ? '/return-check/confirm-termination' : '/return-check/confirm';
        success = name === 'confirm_termination' ? '已按终止方案入库' : '归还核验已关闭，请查看实际退押进度';
      }
      const confirmations = {
        '/outbound/confirm': '确认后将登记实际出库并开始收货计时。',
        '/receipt/confirm': '请先核对实物、数量和外观。确认后将记录实际收货。',
        '/return-shipment/send':
          '请核实道具已实际发出，提交后开始计算预计核验时间。',
        '/return-shipment/start-pickup':
          '请核实已实际开始取回，并确认预计到厂时间。',
        '/return-check/confirm-termination': '请核实道具已实际到厂并逐项核对。入库后按已确认方案办理退款。',
        '/return-check/confirm':
          '请核实数量、外观、清洁及包装。确认无异常后将释放库存并处理原路退押。',
      };
      const owner = session.capture(),
        version = this.data.root.version;
      if (
        confirmations[path] &&
        !(await ui.confirm('确认本次交接？', confirmations[path]))
      )
        return;
      if (
        !session.isCurrent(owner) ||
        this.tradeHidden ||
        version !== this.data.root.version
      )
        return;
      return this.write(path, fields, success, true);
    },
    recover() {
      return ui.run(this, async (current) => {
        const intent = api.pending.get(this.slot);
        if (!intent) return this.read(current);
        try {
          await api.recover(this.slot);
        } catch (error) {
          if (error.status !== 404 || !current()) throw error;
          if (
            !(await ui.confirm(
              '恢复原操作？',
              '尚未查到原回执，将使用原请求编号和内容重试。',
            )) ||
            !current()
          )
            return;
          await api.command(this.slot, intent.path, intent.body);
        }
        if (current()) await this.read(current);
      });
    },
    refund(e) {
      wx.navigateTo({
        url: '/pages/refund/detail?id=' + e.currentTarget.dataset.id,
      });
    },
  };
};
