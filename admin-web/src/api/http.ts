import {
  capture,
  assertCurrent,
  isCurrent,
  onSessionChange,
  canReadIdentity,
  StaleSessionError,
} from "../session/boundary";
import Ajv2020 from "ajv/dist/2020.js";
import contract from "./contract.json";
import d2contract from "./d2a.contract.json";
import bcontract from "./d2b.contract.json";
import ccontract from "./d2c.contract.json";
import tradingContract from "./d3b.contract.json";
import operationsContract from "./d7.contract.json";
import customContract from "./d6.contract.json";
import disputeContract from "./d5.contract.json";
import fulfillmentContract from "./d4.contract.json";
const ajv = new Ajv2020({ strict: false });
ajv.addFormat("date-time", {
  type: "string",
  validate: (s: string) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      s,
    ),
});
ajv.addFormat("uri", {
  type: "string",
  validate: (s: string) => /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s]+$/.test(s),
});
ajv.addFormat("date", {type:"string",validate:(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s});
const validators = new Map<string, Map<string, ReturnType<typeof ajv.compile>>>();
for (const source of [contract, d2contract, bcontract, ccontract, tradingContract, fulfillmentContract, disputeContract, customContract, operationsContract]) {
  for (const [path, operations] of Object.entries(source.paths)) {
    for (const [method, op] of Object.entries(operations)) {
      const statuses = new Map<string, ReturnType<typeof ajv.compile>>();
      validators.set(`${method.toUpperCase()} ${path}`, statuses);
      for (const [status, response] of Object.entries(
        (
          op as {
            responses: Record<
              string,
              { content: { "application/json": { schema: object } } }
            >;
          }
        ).responses,
      )) {
        if (!response.content?.["application/json"]) continue;
        statuses.set(
          status,
          ajv.compile({
            ...response.content["application/json"].schema,
            components: source.components,
          }),
        );
      }
    }
  }
}
function contractPath(path: string) {
  const clean = path.split("?")[0]!;
  return (
    Object.keys({ ...contract.paths, ...d2contract.paths, ...bcontract.paths, ...ccontract.paths, ...tradingContract.paths, ...fulfillmentContract.paths, ...disputeContract.paths, ...customContract.paths, ...operationsContract.paths })
      .sort((a, b) => Number(a.includes("{")) - Number(b.includes("{")))
      .find((p) =>
        new RegExp("^" + p.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(clean),
      ) || clean
  );
}
export class ApiError extends Error {
  constructor(
    public reason: string,
    public traceId = "",
    public owner = capture(),
    public outcome:
      | "business-rejection"
      | "session-expired"
      | "unknown" = "unknown",
  ) {
    super(reason);
  }
}
export const errorText: Record<string, string> = {
  CAPTCHA_INVALID:"验证码有误，请按新图重新输入。",
  CAPTCHA_EXPIRED:"验证码已失效，请按新图重新输入。",
  PAYMENT_CHANNEL_NOT_READY: "支付渠道尚未就绪，请联系平台确认开通条件。",
  PAYMENT_CHANNEL_UNAVAILABLE: "支付渠道暂时无法响应，请查询原操作结果。",
  MERCHANT_ONBOARDING_NOT_READY: "自助进件暂未开放，请联系平台办理。",
  MERCHANT_NOT_READY: "所选工厂尚不具备收款条件，请调整选品或联系平台。",
  CHANNEL_IDENTITY_MISMATCH: "渠道账户信息与原记录不一致，请联系平台核对。",
  MERCHANT_ALREADY_LINKED: "该商户账户已关联，请核对原记录。",
  PRICE_RULE_NOT_FOUND: "当前路线暂无可用运价，请调整配送安排或联系平台。",
  PRICE_RULE_OVERLAP: "运价与已有生效规则重叠，请核对时间和距离区间。",
  PRICE_RULE_IMMUTABLE: "该规则已发布，不能直接修改；请新建版本。",
  TRADING_OPERATION_UNCONFIRMED: "上次操作结果尚未确认，请先查询原操作。",
  TRADE_DATA_INCONSISTENT: "交易资料异常，请联系平台并提供追踪号。",
  PAYMENT_DATA_INCONSISTENT: "资金记录待核实，请联系平台并提供追踪号。",
  MAP_CHANNEL_NOT_READY: "路线报价暂未开通，可选择自提或联系平台。",
  MAP_UNAVAILABLE: "暂时无法取得路线，请稍后重试。",
  VEHICLE_NOT_MATCHED: "暂无匹配道具体积和重量的车型，请调整配送安排。",
  PACKAGING_DATA_MISSING: "道具运输资料尚未完善，请联系工厂补充。",
  RENTAL_WINDOW_NOT_OPEN: "尚未进入下单时间，请在使用前14天内提交。",
  RENTAL_WINDOW_CLOSED: "新下单时间已截止，请调整租期。",
  REALNAME_REQUIRED: "请先完成实名认证后再结算。",
  OVERDUE_FEE_PENDING: '归还交接或费用待核定，请先由平台在本单归还核验页处理。',
  COMPENSATION_OUTSTANDING: "尚有订单差额待补缴，请处理后再发起新交易。",
  FACTORY_COUNT_EXCEEDED: "本次选择的工厂过多，请减少后重试。",
  ADDRESS_CHANGED: "收货地址已变化，请重新选择并报价。",
  CHECKLIST_EMPTY: "请先在清单中选择道具。",
  QUOTE_EXPIRED: "报价已过期，请重新报价并核对。",
  QUOTE_CHANGED: "资料或价格已变化，请重新报价。",
  COUPON_UNAVAILABLE: "所选优惠券当前不可用，请重新选择。",
  ORDER_STATE_CHANGED: "订单状态已变化，请刷新后核对。",
  ACCEPT_DEADLINE_PASSED: "接单时间已截止，请查看订单处理结果。",
  CANCELLATION_QUOTE_CHANGED: "取消费用或订单状态已变化，请重新确认。",
  PAYMENT_WINDOW_EXPIRED: "原付款时间已到，请查询付款状态。",
  SUPPLIER_ROLE_REQUIRED: "此功能仅对工厂开放。",
  SKU_CHANGE_NOT_ALLOWED: "道具当前不能提交资料更新，请刷新核对。",
  SKU_AUDITING: "道具正在审核，暂不能编辑或调整库存。请查看原申请。",
  PROP_ALREADY_REVIEWED: "申请已处理，请刷新查看当前结果。",
  SKU_STATE_CONFLICT: "道具状态已变化，请刷新后核对。",
  SN_STATE_CONFLICT: "实物状态已变化，请重新查看。",
  SN_ADJUSTMENT_PENDING: "该实物已有待审调整，请查看原申请。",
  STOCK_NOT_ENOUGH: "当前可用库存不足，请核对数量。",
  SKU_NOT_RENTABLE: "该道具当前不可租。",
  DICTIONARY_OPTION_DISABLED: "此选项已停用，请选择其他选项。原有未改项可保留。",
  QR_IMAGE_NOT_READY: "标签图片尚未生成，请稍后刷新或重试图片。",
  QR_REVOKED: "此码已停用，请停止使用。",
  QR_TARGET_MISMATCH: "二维码与所选实物不一致，请重新扫码。",
  QR_ALREADY_ACTIVE: "已有活动二维码，请使用原码或重试原图片。",
  QR_GENERATION_UNAVAILABLE: "标签图片暂未生成，请稍后重试原码。",
  PROP_DATA_INCONSISTENT: "道具数据状态异常，请提供追踪号联系平台。",
  FACTORY_NOT_OPERATING: "工厂当前不能经营，可继续查看已有记录。",
  DEMANDER_ROLE_REQUIRED: "租期选品仅对租赁方开放。",

  PHONE_VERIFICATION_NOT_CONFIGURED:
    "联系电话更换暂未开放，可继续修改其他资料。",
  FACTORY_PROFILE_BASE_CHANGED: "工厂资料已更新，请刷新当前资料后重新核对。",
  FACTORY_ALREADY_REVIEWED: "此申请已审核，请刷新查看结果。",
  FACTORY_CREDIT_CODE_IN_USE: "该统一社会信用代码已有工厂主体，请核对。",
  FACTORY_LEGAL_ENTITY_CONFIRMATION_REQUIRED:
    "信用代码变更须确认同一法律主体并填写备注。",
  FACTORY_PROFILE_UNCHANGED: "资料没有变化，无需提交。",
  FACTORY_ROLE_NOT_ELIGIBLE: "当前账号身份不能办理该工厂业务。",
  INVITATION_INVALID: "邀请码不正确，请核对。",
  INVITATION_EXPIRED: "邀请码已过期，请联系平台。",
  INVITATION_UNAVAILABLE: "邀请码当前不可用，请联系平台。",
  INVITATION_ALREADY_CLAIMED: "邀请码已被其他账号锁定。",
  INVITATION_HAS_APPLICATION: "邀请码已有入驻申请，不能再次锁定或作废。",
  IDENTITY_BINDING_CONFLICT: "账号已进入其他身份流程，请刷新状态。",
  FACTORY_DATA_INCONSISTENT: "工厂资料状态异常，请提供追踪号联系平台。",

  CRYPTO_KEY_UNAVAILABLE: "认证资料暂不可解密，请提供追踪号联系平台。",
  REWARD_PROCESSOR_UNAVAILABLE: "认证结果暂不能提交，请联系平台检查奖励配置。",
  RESOURCE_NOT_FOUND: "未找到该记录，请刷新后重试。",
  CONTENT_TYPE_UNSUPPORTED: "请求格式不受支持，请刷新页面后重试。",
  PAYLOAD_TOO_LARGE: "提交内容过大，请缩短内容后重试。",
  VERSION_CONFLICT: "资料已变化，请刷新详情后核对。",
  REALNAME_ALREADY_REVIEWED: "这条实名申请已被审核，请刷新查看结果。",
  STUDENT_ALREADY_REVIEWED: "这条学生申请已被审核，请刷新查看结果。",
  IDEMPOTENCY_KEY_REUSED: "原操作编号对应的内容不同，请查询原操作。",
  OBJECT_STORAGE_UNAVAILABLE: "材料服务暂不可用，请稍后重试。",
  SENSITIVE_DATA_UNAVAILABLE: "敏感资料暂不可读取，请提供追踪号联系平台。",
  LOGIN_REQUIRED: "登录已失效，请重新登录。原页面及非敏感输入已保留。",
  CREDENTIALS_INVALID: "账号或密码错误。",
  CSRF_INVALID: "安全令牌已变化，请重新操作。",
  PERMISSION_DENIED: "当前账号没有访问权限。",
  ACCOUNT_ACTION_RESTRICTED: "账号当前不可执行此操作，请联系平台。",
  CLIENT_TYPE_MISMATCH: "凭据类型不匹配，请重新登录。",
  SESSION_STORE_UNAVAILABLE: "会话服务暂不可用，请稍后再试。",
  DATABASE_UNAVAILABLE: "数据服务暂不可用，请稍后再试。",
  TOO_MANY_REQUESTS: "尝试过于频繁，请稍后重试。",
  REQUEST_INVALID: "请求格式不正确，请检查输入。",
  ACCOUNT_CONTEXT_INCONSISTENT: "账号数据不一致，请提供追踪号联系平台。",
  UNEXPECTED_ERROR: "服务异常，操作结果尚未确认。",
  NETWORK_UNKNOWN: "网络中断或超时，操作结果尚未确认。",
  UNKNOWN_RESPONSE: "服务返回了无法识别的响应，操作结果尚未确认。",
};
export function requestErrorText(error: unknown, fallback = "操作未能完成，请重试。") {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : fallback;
  const text = errorText[error.reason] ?? fallback;
  return error.traceId ? text + " 追踪号：" + error.traceId : text;
}
let csrfToken = "";
onSessionChange(() => {
  csrfToken = "";
});
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  interactive = false,
  requestKey?: string,
): Promise<T> {
  const owner = capture();
  if (!path.startsWith("/api/admin/auth/") && !canReadIdentity())
    throw new ApiError("LOGIN_REQUIRED", "", owner);
  const headers: Record<string, string> = {};
  if (requestKey) headers["Idempotency-Key"] = requestKey;
  const multipart=typeof FormData!=="undefined" && body instanceof FormData;
  if (body !== undefined && !multipart) headers["Content-Type"] = "application/json";
  if (method === "POST") headers["X-CSRF-Token"] = csrfToken;
  if (interactive && method === "GET")
    headers["X-Session-Activity"] = "interactive";
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: body === undefined ? undefined : multipart ? body as FormData : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    assertCurrent(owner);
    throw new ApiError("NETWORK_UNKNOWN", "", owner);
  }
  assertCurrent(owner);
  let data: { code: string; reasonCode?: string; data: T; traceId: string };
  try {
    data = await response.json();
  } catch {
    assertCurrent(owner);
    throw new ApiError("UNKNOWN_RESPONSE", "", owner);
  }
  assertCurrent(owner);
  // 发券专项保留九种领域组合，网关仍采用 D1 的会话、CSRF 与限流协议。
  if (contractPath(path)==="/api/admin/coupon-distributions/issue" && !response.ok &&
      ["CSRF_INVALID","TOO_MANY_REQUESTS","ACCOUNT_ACTION_RESTRICTED","CLIENT_TYPE_MISMATCH","SESSION_STORE_UNAVAILABLE","DATABASE_UNAVAILABLE","REQUEST_INVALID"].includes(data?.reasonCode||"") &&
      validators.get("POST /api/admin/auth/login")?.get(String(response.status))?.(data))
    throw new ApiError(data.reasonCode!,data.traceId,owner,response.status>=500?"unknown":"business-rejection");
  if (
    !validators.get(`${method} ${contractPath(path)}`)?.get(String(response.status))?.(
      data,
    )
  )
    throw new ApiError("UNKNOWN_RESPONSE", "", owner);
  if (!response.ok || data.code !== "OK")
    throw new ApiError(
      data.reasonCode ?? "UNKNOWN_RESPONSE",
      data.traceId,
      owner,
      response.status >= 500
        ? "unknown"
        : ["LOGIN_REQUIRED", "CLIENT_TYPE_MISMATCH"].includes(
              data.reasonCode || "",
            )
          ? "session-expired"
          : "business-rejection",
    );
  return data.data;
}
export async function refreshCsrf() {
  const owner = capture();
  const result = await api<{ csrfToken: string }>("/api/admin/auth/csrf");
  assertCurrent(owner);
  csrfToken = result.csrfToken;
}
export function isStale(error: unknown) {
  return (
    error instanceof StaleSessionError ||
    (error instanceof ApiError && !isCurrent(error.owner))
  );
}
