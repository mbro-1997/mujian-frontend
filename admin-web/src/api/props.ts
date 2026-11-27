import { prepareUploadImage } from "./upload-image";
import { api, refreshCsrf, ApiError } from "./http";
import { capture, assertCurrent } from "../session/boundary";
import { me } from "../session/state";
import type { CommandResult, ImageLocator, ReviewResult, UploadResult } from "./prop-types";

/** 通过管理端同源接口读取图片，浏览器请求自动携带现有管理会话。 */
export function propImageContentUrl(locator: ImageLocator) {
  const parameters = new URLSearchParams({
    sourceType: locator.sourceType,
    sourceId: locator.sourceId,
    section: locator.section,
    index: String(locator.index),
  });
  return "/api/admin/prop-materials/content?" + parameters.toString();
}
export const names: Record<string, string> = {
  sku_audit: "SKU 资料 / 上下架",
  sn_adjustment: "A 类实物调整",
  stock_adjustment: "B 类数量调整",
  pending: "待审核",
  filled: "已填写",
  pending_fill: "待补填",
  qr_cancelled: "已取消",
  suspected_leak: "疑似泄露",
  unreadable_untrusted: "损坏 / 无法识别",
  wrong_binding: "绑定对象不符",
  other: "其他",
  disable_only: "停用原码",
  confirmed_normal: "核实正常（历史）",
  reissue: "换发（历史）",
  approved: "已通过",
  rejected: "已驳回",
  cancelled: "已撤回",
  reported: "待处理",
  resolved: "已停用原码",
  draft: "待完善",
  online: "已上架",
  offline: "已下架",
  disabled: "已停用",
  pending_label: "待贴标",
  idle: "空闲",
  locked: "锁定",
  renting: "租赁中",
  held: "临时占用",
  paid_locked: "已支付锁定",
  overdue_holding: "逾期占用",
  disputed_holding: "争议占用",
  released: "已释放",
  expired: "已过期",
  completed: "已完成",
  outbound: "出库",
  return: "归还",
  lock: "锁定",
  release: "释放",
  arbitration_decrease: "仲裁扣减",
  manual_adjustment: "人工调整",
  order_fulfillment: "订单履约",
  arbitration: "仲裁",
  system_correction: "系统校正",
  repairing: "维修中",
  lost: "丢失",
  scrapped: "报废",
  retired: "退库",
  increase: "增加",
  decrease: "减少",
  repair: "维修",
  abnormal_decrease: "异常扣减",
  up: "上架",
  down: "下架",
  create: "新增上架",
};
export const money = (n: number) => (n / 100).toFixed(2);
export const time = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(s))
    : "—";
export const query = (
  v: Record<string, string | number | string[] | undefined>,
) =>
  new URLSearchParams(
    Object.entries(v)
      .filter(([, v]) => v !== undefined && v !== "")
      .flatMap(([k, v]) =>
        (Array.isArray(v) ? v : [v]).map((x) => [k, String(x)]),
      ),
  ).toString();
type Pending = {
  path: string;
  body: object;
  key: string;
  operation: string;
  review: boolean;
};
const storage = () => "mj.prop.pending." + me.value?.userId;
export function pending(): Pending | null {
  const s = sessionStorage.getItem(storage());
  return s ? JSON.parse(s) : null;
}
export async function command(
  path: string,
  body: object,
  operation: string,
  review = false,
): Promise<CommandResult | ReviewResult> {
  const owner = capture();
  let old = pending();
  if (old) {
    const result = await recover();
    assertCurrent(owner);
    if (result) return result;
    if (old.path !== path || JSON.stringify(old.body) !== JSON.stringify(body))
      throw Error("原操作结果尚未确定，请先恢复原操作。");
  } else {
    old = {
      path,
      body,
      operation,
      review,
      key: crypto.randomUUID().replaceAll("-", ""),
    };
    sessionStorage.setItem(storage(), JSON.stringify(old));
  }
  await refreshCsrf();
  assertCurrent(owner);
  try {
    const r = await api<CommandResult | ReviewResult>(
      old.path,
      "POST",
      old.body,
      false,
      old.key,
    );
    assertCurrent(owner);
    sessionStorage.removeItem(storage());
    return r;
  } catch (e) {
    if (
      e instanceof ApiError &&
      e.outcome === "business-rejection" &&
      e.reason !== "IDEMPOTENCY_KEY_REUSED"
    ) {
      assertCurrent(owner);
      sessionStorage.removeItem(storage());
    }
    throw e;
  }
}
export async function recover(): Promise<CommandResult | ReviewResult | null> {
  const owner = capture(),
    old = pending();
  if (!old) return null;
  try {
    const r = await api<CommandResult | ReviewResult>(
      "/api/admin/" +
        (old.review ? "prop-review-actions" : "prop-operations") +
        "/by-request/" +
        old.key +
        (old.review ? "" : "?operation=" + old.operation),
    );
    assertCurrent(owner);
    sessionStorage.removeItem(storage());
    return r;
  } catch (e) {
    if (e instanceof ApiError && e.reason === "RESOURCE_NOT_FOUND") return null;
    throw e;
  }
}
export async function retryPending() {
  const p = pending();
  return p ? command(p.path, p.body, p.operation, p.review) : null;
}
export async function upload(files: File[]): Promise<string[]> {
  if (files.length > 4) throw Error("最多4张证据图片");
  await refreshCsrf();
  const owner = capture(),
    out: string[] = [],
    queue = files.map((f, i) => ({ f, i }));
  async function work() {
    while (queue.length) {
      const job = queue.shift()!;
      const file = await prepareUploadImage(job.f);
      assertCurrent(owner);
      const body = new FormData();
      body.append("purpose", "qr_exception_evidence");
      body.append("file", file);
      out[job.i] = (
        await api<UploadResult>("/api/admin/prop-materials", "POST", body)
      ).uploadId;
      assertCurrent(owner);
    }
  }
  await Promise.all([work(), work()]);
  return out;
}
