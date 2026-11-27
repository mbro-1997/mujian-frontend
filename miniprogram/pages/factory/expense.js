const evidencePhotos = require("../../services/evidence-photos");
const { hint } = require("../../services/form-error");
const successToast = require("../../services/success-toast");
const api = require('../../services/trading'),
  ui = require('../../services/trading-page');
const materials = require('../../services/verification');
const session = require('../../session/storage');
const sources = ['factory_vehicle', 'third_party'],
  sourceNames = ['工厂自有车辆', '第三方承运'];
const fees = ['toll', 'parking', 'handling', 'waiting'],
  feeNames = ['通行费', '停车费', '装卸费', '等候费'];
const statuses = {
  draft: '待提交',
  submitted: '等待平台审核',
  reviewing: '审核中',
  returned: '退回补证',
  approved: '已核准',
  cancelled: '已取消',
};
const chargeNames = {
  freight_pool: '平台暂收',
  cod: '到付',
  none: '无平台运费',
};
const fen = require("../../services/yuan-input");
function legForm(l, label) {
  return {
    ...l,
    label,
    chargeLabel: chargeNames[l.chargeMode],
    sourceIndex: Math.max(0, sources.indexOf(l.source)),
    sourceLabel: sourceNames[sources.indexOf(l.source)] || '选择执行方式',
    carrierName: l.carrierName || '',
    carrierOrderNo: l.carrierOrderNo || '',
    base: l.source === 'third_party' ? api.money(l.baseAmountFen) : '',
    own:
      l.frozenOwnVehicleAmountFen == null
        ? ''
        : api.money(l.frozenOwnVehicleAmountFen),
    total: api.money(l.totalAmountFen),
    fees: l.extraFees.map((f) => ({
      ...f,
      typeIndex: fees.indexOf(f.type),
      label: feeNames[fees.indexOf(f.type)],
      amount: api.money(f.amountFen),
    })),
    photos: [],
  };
}
function input(l) {
  if (l.chargeMode !== 'freight_pool')
    return {
      source: null,
      carrierName: null,
      carrierOrderNo: null,
      baseAmountFen: null,
      extraFees: [],
    };
  return {
    source: l.source,
    carrierName:
      l.source === 'third_party' ? l.carrierName.trim() || null : null,
    carrierOrderNo:
      l.source === 'third_party' ? l.carrierOrderNo.trim() || null : null,
    baseAmountFen: l.source === 'third_party' ? fen(l.base, false) : null,
    extraFees: l.fees.map((f) => ({
      type: f.type,
      amountFen: fen(f.amount, true),
      description: f.description.trim(),
      evidenceIds: f.evidenceIds,
    })),
  };
}
require('../../session/page')({
  data: {
    id: '',
    statement: '',
    detail: null,
    legs: [],
    history: [],
    page: 0,
    busy: false,
    message: '',
    pending: false,
    sourceNames,
    feeNames,
    writable: false,
    canSubmit: false,
    revise: false,
    selectedReuse: [],
    dirty: false,
    moreEvidence: false,
    moreHistory: false,
  },
  onLoad(q) {
    this.base = '/api/me/factory-orders/' + q.id;
    this.slot = 'freight:' + q.id;
    this.setData({ id: q.id, statement: q.statement || '' });
  },
  onShow() {
    ui.show(this);
    if (!this.choosing) return this.load();
  },
  onHide() {
    ui.hide(this);
  },
  onUnload() {
    this.gone = true;
    ui.hide(this);
  },
  load() {
    return ui.run(this, (current) => this.read(current));
  },
  async read(current, reset = false) {
    const [ctx, order, h] = await Promise.all([
      api.get(this.base + '/transport-expense'),
      api.get(this.base),
      api.get(this.base + '/transport-expenses?page=1&pageSize=10'),
    ]);
    if (!current()) return;
    let row = ctx.latest;
    if (this.data.statement && row?.id !== this.data.statement)
      row = await api.get(
        this.base + '/transport-expenses/' + this.data.statement,
      );
    if (!current()) return;
    const isLatest = !row || row.id === ctx.latest?.id;
    const active =
      ctx.required &&
      ['accepted', 'fulfilling', 'return_checking'].includes(order.orderStatus);
    const protection = await api.get(this.base + '/fulfillment');
    if (!current()) return;
    const revise = isLatest && !!row?.availableActions.includes('revise');
    const writable =
      isLatest &&
      active &&
      (row
        ? row.availableActions.includes('save') || revise
        : protection.disputeProtectionReady);
    const keep =
      this.data.dirty && !reset && this.data.detail?.row?.id === row?.id;
    const legs = keep
      ? this.data.legs
      : [
          legForm(row?.outbound || ctx.outbound, '去程'),
          legForm(row?.return || ctx.return, '回程'),
        ];
    const pool = row?.prepaidPoolFen ?? order.amounts.freightFen;
    this.setData({
      detail: {
        row,
        number: order.orderNo,
        factory: order.factoryName,
        status: statuses[row?.status] || '待提交',
        pool: api.money(pool),
        declared: api.money(row?.declaredTotalFen || 0),
        over: api.money(Math.max((row?.declaredTotalFen || 0) - pool, 0)),
        online: api.money(row?.onlineSettleFen || 0),
        refund: api.money(row?.refundableFen || 0),
      },
      legs,
      writable,
      revise,
      canSubmit: !!row?.availableActions.includes('submit'),
      pending: api.pending.has(this.slot),
      dirty: keep,
      selectedReuse: keep ? this.data.selectedReuse : [],
      history: h.items.map((v) => ({ ...v, label: statuses[v.status] })),
      page: 1,
      moreHistory: 10 < Number(h.total),
      evidencePage: 0,
      moreEvidence: false,
    });
    if (row) await this.photos(current, 1);
  },
  async photos(current, page) {
    const row = this.data.detail.row;
    const list = await api.get(
      this.base +
        '/evidence?node=transport_expense&statementId=' +
        row.id +
        '&page=' +
        page +
        '&pageSize=12',
    );
    if (!current()) return;
    const photos = await evidencePhotos(this.base, list.items);
    if (!current()) return;
    const legs = this.data.legs.map((l) => ({
      ...l,
      photos: (page === 1 ? [] : l.photos).concat(
        photos
          .filter((p) => p.transportLegId === l.transportLegId)
          .map((p) => ({
            ...p,
            reused: p.statementId !== row.id,
            selected: this.data.selectedReuse.includes(p.id),
          })),
      ),
    }));
    for (const leg of legs)
      leg.fees = leg.fees.map((f) => ({
        ...f,
        options: leg.photos.map((p) => ({
          id: p.id,
          checked: f.evidenceIds.includes(p.id),
        })),
      }));
    this.setData({
      legs,
      evidencePage: page,
      moreEvidence: 12 * page < Number(list.total),
    });
  },
  morePhotos() {
    return ui.act(this, (current) =>
      this.photos(current, this.data.evidencePage + 1),
    );
  },
  moreHistory() {
    return ui.act(this, async (current) => {
      const page = this.data.page + 1;
      const h = await api.get(
        this.base + '/transport-expenses?page=' + page + '&pageSize=10',
      );
      if (current())
        this.setData({
          page,
          history: this.data.history.concat(
            h.items.map((v) => ({ ...v, label: statuses[v.status] })),
          ),
          moreHistory: 10 * page < Number(h.total),
        });
    });
  },
  prior(e) {
    wx.navigateTo({
      url:
        '/pages/factory/expense?id=' +
        this.data.id +
        '&statement=' +
        e.currentTarget.dataset.id,
    });
  },
  edit(e) {
    const d = e.currentTarget.dataset;
    this.setData({
      ['legs[' + d.leg + '].' + d.field]: e.detail.value,
      dirty: true,
    });
  },
  source(e) {
    const i = Number(e.detail.value),
      l = e.currentTarget.dataset.leg;
    this.setData({
      ['legs[' + l + '].source']: sources[i],
      ['legs[' + l + '].sourceIndex']: i,
      ['legs[' + l + '].sourceLabel']: sourceNames[i],
      dirty: true,
    });
  },
  addFee(e) {
    const l = e.currentTarget.dataset.leg;
    this.setData({
      ['legs[' + l + '].fees']: this.data.legs[l].fees.concat([
        {
          type: fees[0],
          typeIndex: 0,
          label: feeNames[0],
          description: '',
          amount: '',
          evidenceIds: [],
          options: this.data.legs[l].photos.map((p) => ({
            id: p.id,
            checked: false,
          })),
        },
      ]),
      dirty: true,
    });
  },
  feeEdit(e) {
    const { leg, index, field } = e.currentTarget.dataset,
      k = 'legs[' + leg + '].fees[' + index + ']';
    if (field === 'type') {
      const i = Number(e.detail.value);
      this.setData({
        [k + '.type']: fees[i],
        [k + '.typeIndex']: i,
        [k + '.label']: feeNames[i],
        dirty: true,
      });
    } else this.setData({ [k + '.' + field]: e.detail.value, dirty: true });
  },
  feePhotos(e) {
    const { leg, index } = e.currentTarget.dataset;
    this.setData({
      ['legs[' + leg + '].fees[' + index + '].evidenceIds']: e.detail.value,
      ['legs[' + leg + '].fees[' + index + '].options']: this.data.legs[
        leg
      ].photos.map((p) => ({
        id: p.id,
        checked: e.detail.value.includes(p.id),
      })),
      dirty: true,
    });
  },
  removeFee(e) {
    const { leg, index } = e.currentTarget.dataset;
    this.setData({
      ['legs[' + leg + '].fees']: this.data.legs[leg].fees.filter(
        (_, i) => i !== Number(index),
      ),
      dirty: true,
    });
  },
  reuse(e) {
    const id = e.currentTarget.dataset.id;
    const ids = new Set(this.data.selectedReuse);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    this.setData({
      selectedReuse: [...ids],
      legs: this.data.legs.map((l) => ({
        ...l,
        photos: l.photos.map((p) => ({ ...p, chosen: ids.has(p.id) })),
      })),
      dirty: true,
    });
  },
  async send(path, body, current) {
    try {
      await api.command(this.slot, this.base + path, body);
      if (current()) {
        successToast("操作已保存");
        await this.read(current, true);
      }
    } catch (e) {
      if (current()) {
        this.setData({ pending: api.pending.has(this.slot) });
        if (
          [
            'VERSION_CONFLICT',
            'EXPENSE_IMMUTABLE',
            'EXPENSE_VERSION_NOT_CURRENT',
          ].includes(e.reason)
        )
          await this.read(current);
      }
      throw e;
    }
  },
  save() {
    return ui.act(this, async (current) => {
      const row = this.data.detail.row,
        legs = this.data.legs;
      let reuse = this.data.selectedReuse;
      if (row?.status === 'draft') {
        reuse = [];
        for (let page = 1; ; page++) {
          const pictures = await api.get(
            this.base +
              '/evidence?node=transport_expense&statementId=' +
              row.id +
              '&page=' +
              page +
              '&pageSize=100',
          );
          if (!current()) return;
          reuse.push(
            ...pictures.items
              .filter((p) => p.statementId !== row.id)
              .map((p) => p.id),
          );
          if (page * 100 >= Number(pictures.total)) break;
        }
      }
      await this.send(
        '/transport-expense/save',
        {
          expectedVersion: row?.version || 0,
          previousStatementId: this.data.revise ? row.id : null,
          reusedEvidenceIds: reuse,
          outbound: input(legs[0]),
          return: input(legs[1]),
        },
        current,
      );
    });
  },
  async submit() {
    if (this.data.dirty) {
      hint('费用已修改，请先暂存后核对申报金额');
      return;
    }
    const row = this.data.detail.row,
      owner = session.capture();
    if (
      (await ui.confirm(
        '提交往返费用核销？',
        '提交后平台按本版本及凭证审核。',
      )) &&
      !this.tradeHidden &&
      session.isCurrent(owner)
    )
      return ui.act(this, (current) =>
        this.send(
          '/transport-expense/' + row.id + '/submit',
          { expectedVersion: row.version },
          current,
        ),
      );
  },
  async attach(e) {
    const row = this.data.detail.row,
      leg = this.data.legs[e.currentTarget.dataset.leg],
      owner = session.capture();
    if (!row || row.status !== 'draft' || this.data.dirty) {
      hint('请先暂存本版费用，再上传凭证');
      return;
    }
    this.choosing = true;
    try {
      const file = await new Promise((resolve, reject) =>
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'], sizeType: ["original", "compressed"],
          success: (r) => resolve(r.tempFiles[0]),
          fail: (e) =>
            /cancel/.test(e.errMsg || '')
              ? resolve(null)
              : reject(Error('请检查相册权限后重试')),
        }),
      );
      if (!file || this.gone || !session.isCurrent(owner)) return;
      return await ui.act(this, async (current) => {
        const receiptId = await materials.uploadOrder(
          this.base,
          'transport_expense',
          file.tempFilePath,
        );
        if (current())
          await this.send(
            '/evidence',
            {
              expectedVersion: row.version,
              materials: [
                {
                  receiptId,
                  node: 'transport_expense',
                  scene: e.currentTarget.dataset.scene,
                  itemId: null,
                  statementId: row.id,
                  transportLegId: leg.transportLegId,
                  capturedAt: null,
                  text: null,
                },
              ],
            },
            current,
          );
      });
    } catch (e) {
      if (session.isCurrent(owner)) hint(e.message);
    } finally {
      this.choosing = false;
    }
  },
  preview(e) {
    return ui.act(this, async (current) => {
      const v = await api.post(
        this.base + '/evidence/' + e.currentTarget.dataset.id + '/view',
      );
      if (current()) wx.previewImage({ urls: [v.url] });
    });
  },
  async remove(e) {
    const id = e.currentTarget.dataset.id,
      row = this.data.detail.row;
    if (this.data.writable && !this.data.dirty && !this.data.pending)
      return ui.act(this, (current) =>
        this.send(
          '/evidence/' + id + '/remove',
          { expectedVersion: row.version },
          current,
        ),
      );
  },
  recover() {
    return ui.act(this, async (current) => {
      await api.recover(this.slot);
      if (current()) await this.read(current, true);
    });
  },
});
