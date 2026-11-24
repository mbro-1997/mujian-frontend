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
async function run(page, action, successLabel) {
  if (page.data.busy) return;
  const current = begin(page);
  page.setData({ busy: true, message: '', outstandingCompensation:false });
  try {
    const result = await action(current);
    if (successLabel && result && current()) successToast(successLabel);
    return result;
  } catch (error) {
    if (current()) {
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
      page.setData({ message: api.message(error),outstandingCompensation:error.reason==='COMPENSATION_OUTSTANDING' });
    }
  } finally {
    if (current()) page.setData({ busy: false });
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
module.exports = { showList: require("./planning-page").showList, run, begin, hide, show, confirm: require('./planning-page').confirm };
