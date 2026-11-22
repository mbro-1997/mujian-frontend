import { explain } from '../session/state';
import { reactive } from 'vue';
import { api, ApiError, refreshCsrf, errorText } from './http';
import { capture, assertCurrent, onSessionChange } from '../session/boundary';
import type { Receipt } from './trading-types';
export { money, time, query } from './props';
export const labels: Record<string, string> = {
  pending: '待处理',
  claim_processing:'索赔处理中',arbitration_processing:'仲裁处理中',
  terminated:'已终止',termination_pending:'终止待回收',receipt_issue_paused:'收货问题处理中',in_use_issue_paused:'使用异常处理中',
  not_started:'尚未开始履约',pending_receipt:'待收货核验',receipt_checking:'收货核验中',renting:'租赁中',overdue:'逾期未归还',return_in_transit:'归还运输中',return_checking:'归还核验中',return_closed:'归还核验已关闭',completed:'已完成',
  paying: '付款中',
  success: '已成功',
  closed: '已关闭',
  failed: '失败待处理',
  processing: '处理中',
  manual_rejected: '工厂已拒绝',
  timeout_rejected: '接单超时',
  user_cancelled: '已取消',
  pending_accept: '待接单',
  accepted: '已接单',
  pending_outbound: '待出库',
  rejected: '已拒绝',
  cancelled: '已取消',
  accept_timeout: '接单超时',
  refunding: '退款中',
  refunded: '应退款已退回',
  refund_failed: '退款待处理',
  partial_refunded: '部分已退',
  full_refunded: '全部已退',
  none: '无',
  not_applied: '未申请',
  reviewing: '审核中',
  need_action: '待办理',
  active: '已启用',
  frozen: '已冻结',
  unavailable: '未开通',
  restricted: '受限',
  draft: '草稿',
  expired: '已到期',
  enabled: '启用',
  disabled: '停用',
  self_pickup: '自行取货',
  factory_delivery: '工厂配送',
  factory_assisted_call: '工厂协助叫车',
  user_return: '自行归还',
  factory_pickup: '工厂取回',
  returned: '已返券',
  not_returned: '未返券',
  refund_exception: '退款异常',
  paid_frozen: '已付待结算',
  partially_refunded: '部分退款',
  fully_refunded: '全部退款',
  profit_sharing: '分账中',
  profit_shared: '已分账',
  finished: '已结清',
  partial_received: '部分实收',
};
interface Intent {
  key: string;
  fingerprint: string;
  path: string;
  body: object;
}
const intents = reactive(new Map<string, Intent>());
onSessionChange(() => intents.clear());
export function hasPending(slot: string) {
  return intents.has(slot);
}
export async function recover(slot: string) {
  const intent = intents.get(slot);
  if (!intent) return null;
  const owner = capture();
  const receipt = await api<Receipt>('/api/admin/trading-operations/by-request/' + intent.key);
  assertCurrent(owner);
  intents.delete(slot);
  return receipt;
}
export async function command<T>(
  slot: string,
  path: string,
  body: object,
): Promise<T | { recovered: true; receipt: Receipt }> {
  const owner = capture(),
    fingerprint = JSON.stringify({ path, body });
  let intent = intents.get(slot);
  if (intent && intent.fingerprint !== fingerprint)
    throw new ApiError('TRADING_OPERATION_UNCONFIRMED');
  if (!intent) {
    intent = { key: crypto.randomUUID(), fingerprint, path, body };
    intents.set(slot, intent);
  }
  try {
    await refreshCsrf();
    assertCurrent(owner);
    const result = await api<T>(path, 'POST', body, false, intent.key);
    assertCurrent(owner);
    intents.delete(slot);
    return result;
  } catch (error) {
    assertCurrent(owner);
    if (error instanceof ApiError && error.outcome === 'business-rejection') intents.delete(slot);
    else {
      try {
        const receipt = await recover(slot);
        if (receipt) return { recovered: true, receipt };
      } catch {
        /* 原号保留，用户可恢复或按原内容重试。 */
      }
    }
    throw error;
  }
}

export function tradeError(error: unknown) {
  const failure = error instanceof ApiError ? error : explain(error);
  if (
    [
      'LOGIN_REQUIRED',
      'CLIENT_TYPE_MISMATCH',
      'ACCOUNT_ACTION_RESTRICTED',
      'PERMISSION_DENIED',
      'CSRF_INVALID',
    ].includes(failure.reason)
  )
    explain(failure);
  return (
    (errorText[failure.reason] || '操作未能完成，请稍后重试。') +
    (failure.traceId ? ' 追踪号：' + failure.traceId : '')
  );
}
