const { ValidationError, UploadError, hint } = require("./form-error");
const successToast = require("./success-toast");
const api = require('./trading'),
  session = require('../session/storage');
// 所有交易页面统一隔离离页、并发刷新和身份切换，原生调起也使用此边界。
function begin(page) {
  const owner = session.capture(),
    round = (page.tradeRound = (page.tradeRound || 0) + 1);
  return () => !page.tradeHidden && round === page.tradeRound && session.isCurrent(owner);
}
function guide(current, title, content, confirmText, url) {
  wx.showModal({
    title, content, confirmText, cancelText: '暂不处理',
    success(result) {
      if (result.confirm && current()) wx.navigateTo({ url });
    },
  });
}
async function run(page, action, successLabel, transient = false) {
  if (page.data.busy) return;
  const current = begin(page);
  page.setData({ busy: true, message: '' });
  try {
    const result = await action(current);
    if (successLabel && result && current()) successToast(successLabel);
    return result;
  } catch (error) {
    if (current()) {
      if (error.reason === 'REALNAME_REQUIRED')
        return guide(current, '请完成实名认证', '认证完成后可返回继续结算。', '实名认证', '/pages/realname/form');
      if (error.reason === 'MERCHANT_NOT_READY')
        return hint('工厂暂不具备收款条件，请调整选品或联系平台');
      if (error.reason === 'COMPENSATION_OUTSTANDING')
        return guide(current, '请先处理待补缴款项', '查看补缴明细后可继续处理。', '查看明细', '/pages/orders/disputes?kind=compensation-receivables');
      if (error.reason === 'RENTAL_WINDOW_CLOSED' || error.reason === 'RENTAL_WINDOW_NOT_OPEN')
        return hint(api.message(error).split(' 追踪号：')[0]);
      if (error instanceof ValidationError) return hint(error.message);
      if ([401, 403, 404].includes(error.status)) {
        const cleared = { detail: null, items: [], quote: null };
        const defaults = { rows: [], total: '0', page: 0, loadedRevision: -1, exhausted: false,
          availableCount: '0', unavailableCount: '0', nextCheckAt: 0, context: null, record: null,
          progress: null, card: null, canAccept: false, canReject: false, canCancel: false, canExtend: false,
          fulfillmentVisible: false, expenseVisible: false, settlementVisible: false };
        for (const field of Object.keys(defaults)) {
          if (field in page.data) cleared[field] = defaults[field];
        }
        page.setData(cleared);
        if (page.onAccessLost) page.onAccessLost();
      }
      if (error instanceof UploadError) return hint(error.message);
      if (transient && ![401, 403, 404].includes(error.status))
        return hint(api.message(error).split(' 追踪号：')[0]);
      page.setData({ message: api.message(error) });
    }
  } finally {
    if (current()) {
      const state = { busy: false };
      if (page.hasPendingOperation) state.pending = page.hasPendingOperation();
      page.setData(state);
    }
  }
}
function hide(page) {
  page.tradeHidden = true;
  page.tradeRound = (page.tradeRound || 0) + 1;
  if (page.tradeTimer) clearTimeout(page.tradeTimer);
  page.tradeTimer = null;
}
function show(page) {
  page.tradeHidden = false;
  page.setData({ busy: false });
}
function act(page, action, successLabel) {
  return run(page, action, successLabel, true);
}
module.exports = { act, showList: require("./planning-page").showList, run, begin, hide, show, confirm: require('./planning-page').confirm };
