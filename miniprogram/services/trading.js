const { rentReduction } = require('./coupon-benefit');
const http = require('./http');
const session = require('../session/storage');
const planning = require('./planning');
const images = require('./public-images');
const { displayTime } = require('./display-time');
// 私有意图仅保留在当前身份的内存中，支付参数、地址和报价不进持久缓存。
const pending = new Map();
const revision = { value: 0, orders: 0, wallet: 0 };
// 付款、取消与退款可同时改变持券；履约命令只影响订单。
function markChanged(path) {
  revision.value++;
  if (/^\/api\/me\/factory-wechat-account(?:\/|$)/.test(path)) return;
  revision.orders++;
  if (/^\/api\/me\/checkout-batches(?:\/|$)/.test(path) ||
      /\/(?:factory-orders|rental-orders)\/[^/]+\/(?:cancel|reject)$/.test(path)) revision.wallet++;
}
// 详情核对上一个可见列表中的同一张卡片，只比较服务端返回的稳定展示字段。
function checkListCard(kind, id, value) {
  const stack = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  const list = stack[stack.length - 2];
  const routes = kind === 'orders' ? ['pages/orders/index', 'pages/factory/orders', 'pages/home/index'] : ['pages/coupons/index'];
  if (!list || !routes.includes(list.route)) return;
  const rows = list.route === "pages/home/index" ? list.data.tradeOrders : list.data.items;
  const row = rows?.find(item => item.id === id);
  if (!row) return;
  if (!value) {
    // 详情明确不可访问时立即移除该卡，返回列表再向服务端核对总数和排序。
    require('../navigation/state').forget(list);
    const field = list.route === 'pages/home/index' ? 'tradeOrders' : 'items';
    list.setData({ [field]: rows.filter(item => item.id !== id) });
    revision[kind]++;
    return;
  }
  const keys = kind === 'orders'
    ? ['version', 'orderStatus', 'displayStatus', 'refundStatus', 'paidFen', 'deductedFen', 'refundedFen',
        'availableActions', 'acceptDeadlineAt', 'nextDeadlineAt', 'factoryName', 'buyerRemark', 'amounts']
    : ['status', 'validFrom', 'validUntil', 'usable', 'type', 'faceAmountFen', 'thresholdRentFen', 'name'];
  if (keys.some(key => key in value && key in row && JSON.stringify(value[key]) !== JSON.stringify(row[key]))) revision[kind]++;
}
const launches = new Map();
session.subscribe(() => {
  pending.clear();
  launches.clear();
  revision.value++;
  revision.orders++;
  revision.wallet++;
});
const labels = {
  claim_processing:'索赔处理中',arbitration_processing:'仲裁处理中',
  terminated: '已终止', termination_pending: '终止待回收',
  receipt_issue_paused: '收货问题处理中', in_use_issue_paused: '使用异常处理中',
  pending_receipt:'待收货核验',receipt_checking:'收货核验中',renting:'租赁中',overdue:'逾期未归还',
  return_in_transit:'归还运输中',return_closed:'归还核验已关闭',
  fulfilling: '履约中', return_checking: '归还核验中', completed: '已完成',
  pending_payment: '等待付款',
  payment_exception: '付款核实中',
  paid: '付款成功',
  closed: '付款已关闭',
  expired: '付款已超时',
  refund_processing: '原路退款中',
  refunded_closed: '原款已退回',
  manual_rejected: '工厂已拒绝',
  timeout_rejected: '接单超时',
  user_cancelled: '已取消',
  pending_accept: '待工厂接单',
  accepted: '已接单',
  pending_outbound: '待出库',
  rejected: '工厂已拒绝',
  accept_timeout: '接单超时',
  cancelled: '已取消',
  refunding: '退款中',
  refund_failed: '退款待处理',
  refunded: '应退款已退回',
  pending: '待处理',
  processing: '处理中',
  success: '已成功',
  failed: '待核实处理',
  available: '可使用',
  returned: '已返还',
  locked: '付款中锁定',
  used: '已使用',
  invalid: '已作废',
  not_applied: '未开通',
  active: '已开通',
  reviewing: '审核中',
  frozen: '已冻结',
  restricted: '受限',
};
const reasons = {
  OVERDUE_FEE_PENDING: '归还交接或费用待核定，请先由平台在本单归还核验页处理。',
  CHECK_INCOMPLETE: '请先完成本单全部实物与数量核对。',
  OUTBOUND_PHOTOS_REQUIRED: '请至少保存三张出库照片。',
  QR_INVALID: '无法识别此道具码，请重新扫描实物标签。',
  QR_NOT_IN_ORDER: '此实物不属于本单分配，请核对后重新扫码。',
  QR_NOT_ACTIVE: '此标签已失效，请扫描实物当前标签。',
  MATERIAL_EXPIRED: '照片上传凭证已过期，请重新选择照片。',
  MATERIAL_REFERENCE_INVALID: '照片来源与本次交接不符，请重新核对。',
  MATERIAL_TYPE_UNSUPPORTED: '请选择 JPEG 或 PNG 照片。',
  MATERIAL_TOO_LARGE: '单张照片请控制在 5 MiB 以内。',
  PRIVATE_STORAGE_UNAVAILABLE: '照片服务暂不可用，请稍后重试。',
  FULFILLMENT_NOT_OPEN: '异议处理尚未就绪，正常履约暂未开放。',
  FULFILLMENT_PAUSED: '此订单已暂停正常履约，请核对最新状态。',
  RETURN_CLAIM_EXISTS: '归还已发生索赔，请查看订单最新状态。',
  RETURN_TIME_INVALID: '请核实实际发出时间或预计到厂时间。',
  RETURN_ALREADY_SENT: '归还已发出，请刷新查看实际记录。',
  RETURN_ALREADY_CLOSED: '核验已关闭，请刷新查看处理结果。',
  FULFILLMENT_STATE_CHANGED: '订单状态已变化，请核对最新进度。',
  EXTENSION_WINDOW_CLOSED: '当前订单已无法申请延期，请按原安排归还。',
  EXTENSION_DAYS_EXCEEDED: '超过可延期天数，请缩短后重新试算。',
  ISSUE_STATE_CHANGED: '问题处理状态已变化，请刷新订单。',
  AMOUNT_OUT_OF_RANGE: '本次结算金额超出支持范围，请减少数量。',
  COUPON_EXPIRED: '优惠券已过期',
  COUPON_NOT_STARTED: '优惠券尚未生效',
  COUPON_SCOPE_NOT_MATCHED: '未包含适用工厂',
  COUPON_SCOPE_MISMATCH: '未包含适用工厂',
  COUPON_THRESHOLD_NOT_MET: '适用租金未达到门槛',
  COUPON_NOT_AVAILABLE: '此券当前不可用',
  MERCHANT_ONBOARDING_NOT_READY: '微信进件暂未开放，请联系平台确认开通条件',
  PAYMENT_CHANNEL_NOT_READY: '付款渠道尚未就绪，清单仍可保留',
  MAP_UNAVAILABLE: '暂时无法取得路线，请稍后重试',
  QUOTE_EXPIRED: '报价已过期，请重新报价并核对',
  QUOTE_CHANGED: '资料或价格已变化，请重新报价',
  CANCELLATION_QUOTE_CHANGED: '取消费用或订单状态已变化，请重新核对应退金额',
};
const get = (path) => http.request(path, 'GET', true);
const post = (path, body = {}, options = {}) => http.request(path, 'POST', false, body, {}, options);
function message(error) {
  return reasons[error.reason] || error.message || '暂时未能确认，请重试查询';
}
async function recover(slot) {
  const intent = pending.get(slot);
  if (!intent) return null;
  const owner = session.capture();
  const receipt = await get('/api/me/trading-operations/by-request/' + intent.requestId);
  session.assertCurrent(owner);
  if (pending.get(slot) === intent) pending.delete(slot);
  markChanged(intent.path);
  return receipt;
}
async function command(slot, path, body = {}) {
  const owner = session.capture(),
    fingerprint = JSON.stringify({ path, body });
  let intent = pending.get(slot);
  if (intent && intent.fingerprint !== fingerprint)
    throw new Error('上次操作结果尚未确认，请先查询原操作。');
  if (!intent) {
    intent = { requestId: await planning.uuid(), path, body, fingerprint };
    session.assertCurrent(owner);
    pending.set(slot, intent);
  }
  try {
    const result = await http.request(path, 'POST', false, body, {
      'Idempotency-Key': intent.requestId,
    });
    session.assertCurrent(owner);
    if (pending.get(slot) === intent) pending.delete(slot);
    markChanged(path);
    return result;
  } catch (error) {
    if (!session.isCurrent(owner)) throw error;
    // 500/503 即使带有结构化错误也先恢复原请求，不据文案推断回滚。
    if (!error.outcome || error.outcome === 'unknown' || error.status >= 500) {
      markChanged(path);
      try {
        const receipt = await recover(slot);
        return { recovered: true, receipt };
      } catch (recovery) {
        error.recovery = recovery;
      }
    } else if (pending.get(slot) === intent) pending.delete(slot);
    throw error;
  }
}
function amounts(value) {
  const result = { ...value };
  for (const [name, fen] of Object.entries(value))
    result[name.replace(/Fen$/, '')] = planning.money(fen);
  return result;
}
function item(value) {
  return {
    ...value,
    image: images.accept(value.image),
    daily: planning.money(value.dailyRentFen),
    rent: planning.money(value.rentCashFen),
    deposit: planning.money(value.depositFen),
  };
}
function route(value) {
  return {
    ...value,
    serviceLabel:
      {
        self_pickup: '自行取货',
        factory_delivery: '工厂配送',
        factory_assisted_call: '工厂协助叫车',
        user_return: '自行归还',
        factory_pickup: '工厂上门取回',
      }[value.serviceMode] || value.serviceMode,
    vehicleTierNameText: value.vehicleTierName ?? '',
    prepaid: planning.money(value.prepaidFen),
    distance: value.distanceMeter == null ? '' : (value.distanceMeter / 1000).toFixed(2),
  };
}
function group(value) {
  return {
    ...value,
    buyerRemarkText: value.buyerRemark ?? '',
    items: value.items.map(item),
    amounts: amounts(value.amounts),
    outbound: route(value.outbound),
    return: route(value.return),
  };
}
function order(value) {
  return {
    ...value,
    label: labels[value.displayStatus] || value.displayStatus,
    terminationRefund: value.displayStatus === 'terminated' ? ({
      processing:'退款中', failed:'退款待处理', partial_refunded:'已部分退款', full_refunded:'已全额退款'
    }[value.refundStatus] || '') : '',
    buyerRemarkText: value.buyerRemark ?? '',
    nextDeadlineText: displayTime(value.nextDeadlineAt),
    acceptDeadlineAtText: displayTime(value.acceptDeadlineAt),
    amounts: amounts(value.amounts),
    paid: planning.money(value.paidFen),
    refunded: planning.money(value.refundedFen),
    deducted: planning.money(value.deductedFen),
  };
}
function coupon(value) {
  return {
    ...value,
    label: labels[value.status] || value.status,
    validFromText: displayTime(value.validFrom),
    validUntilText: displayTime(value.validUntil),
    returnedAtText: displayTime(value.returnedAt),
    value:
      value.type === 'fixed_amount'
        ? '¥' + planning.money(value.faceAmountFen)
        : rentReduction(value.discountRateBps),
    threshold: planning.money(value.thresholdRentFen),
  };
}
function dateMillis(raw) {
  return Date.parse(/Z$|[+-]\d\d:\d\d$/.test(raw) ? raw : raw.replace(' ', 'T') + '+08:00');
}
// 只有当前可见页面和原身份允许调起；原生结果永远不能直接改写付款状态。
async function nativePayment(parameters, current = () => true) {
  if (!parameters || !current()) return;
  const owner = session.capture();
  session.assertCurrent(owner);
  return new Promise((resolve) =>
    wx.requestPayment({
      timeStamp: parameters.timeStamp,
      nonceStr: parameters.nonceStr,
      package: parameters.package,
      signType: parameters.signType,
      paySign: parameters.paySign,
      complete: () => resolve(),
    }),
  );
}
module.exports = {
  launches,
  get,
  post,
  command: require("./original-command")(command, (slot, path, body = {}, pdf = false) =>
    ({ slot, fingerprint: JSON.stringify([path, body, pdf]) })),
  recover,
  pending,
  revision,
  checkListCard,
  labels,
  reasons,
  message,
  amounts,
  item,
  group,
  route,
  order,
  coupon,
  dateMillis,
  displayTime,
  nativePayment,
  money: planning.money,
};
