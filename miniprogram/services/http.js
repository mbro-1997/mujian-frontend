const env = require("../config/environment"),
  session = require("../session/storage");
const protocol = require("./response-contract");
const errors = {
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
  OVERDUE_FEE_PENDING: "归还交接或费用待核定，请先由平台在本单归还核验页处理。",
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
  SCHEME_LIMIT_REACHED: "未归档方案已达10个，请先归档已有方案。",
  SCHEME_ARCHIVED: "方案已归档，无法恢复编辑。",
  CHECKLIST_LIMIT_REACHED: "未转单清单已达3张。可删除不再需要的清单，或在转单后新建。",
  CHECKLIST_PAYMENT_IN_PROGRESS: "当前清单支付处理中，请等待支付结果。",
  CHECKLIST_NOT_CURRENT: "请先切换为当前清单。",
  CHECKLIST_READ_ONLY: "该清单当前只读。",
  SKU_NOT_PUBLIC: "道具已不可公开选择，请保留原项或移除。",
  RENTAL_DATE_PASSED: "租期已经开始，仅可减少数量、删除或整理备注。",
  VERSION_CONFLICT: "内容已变化，请刷新核对后重新保存。",
  SHARE_INVALID: "分享链接已失效。",
  PDF_PROCESSING: "方案书正在生成，请稍后再点「导出 PDF」。",
  PDF_CACHE_EXPIRED: "原文件已失效，请再次导出。",
  PDF_COOLDOWN: "同一方案3分钟内只能真实生成一次，请稍后再试。",
  PDF_DAILY_LIMIT: "今日已生成5次，已有有效文件仍可重新下载。",
  PDF_GENERATION_FAILED: "本次生成失败，已计入生成次数。可稍后主动重新生成。",
  PDF_GENERATION_TIMEOUT: "本次生成超时，已计入生成次数。",
  PDF_CAPACITY_UNAVAILABLE: "生成资源暂不可用，本次未接纳，请稍后重试。",
  AMOUNT_OUT_OF_RANGE: "方案预算超出支持范围，请减少数量。",
  PLANNING_DATA_INCONSISTENT: "数据状态异常，请联系平台并提供追踪号。",

  SKU_AUDITING: "道具正在审核，暂不能编辑或调整库存。请查看原申请。",
  PROP_ALREADY_REVIEWED: "申请已处理，请刷新查看当前结果。",
  SKU_STATE_CONFLICT: "道具状态已变化，请刷新后核对。",
  SN_STATE_CONFLICT: "实物状态已变化，请重新查看。",
  SN_ADJUSTMENT_PENDING: "该实物已有待审调整，请查看原申请。",
  STOCK_NOT_ENOUGH: "当前可用库存不足，请核对数量。",
  SKU_NOT_RENTABLE: "该道具当前不可租。",
  DICTIONARY_OPTION_DISABLED:
    "此选项已停用，请选择其他选项。原有未改项可保留。",
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

  LOGIN_IDENTITY_CONFLICT:
    "当前微信与授权手机号对应不同账号，请使用原账号登录。",
  CRYPTO_KEY_UNAVAILABLE: "认证资料暂不可读取，请提供追踪号联系平台。",
  OBJECT_STORAGE_UNAVAILABLE: "材料服务暂不可用，请稍后重试。",
  RULE_DOCUMENT_UNAVAILABLE: "平台规则暂不可读取，请稍后重试。",
  REALNAME_ROLE_NOT_ELIGIBLE: "请先绑定租赁方身份，再提交实名认证。",
  STUDENT_ROLE_NOT_ELIGIBLE: "请先绑定租赁方身份，再提交学生认证。",
  RESOURCE_NOT_FOUND: "暂未找到该记录，请稍后查询。",
  IDEMPOTENCY_KEY_REUSED: "此提交编号已对应其他内容，请查询原提交结果。",
  PAYLOAD_TOO_LARGE: "提交内容过大，请检查材料后重试。",
  CONTENT_TYPE_UNSUPPORTED: "提交格式不受支持，请重新打开页面。",
  RULE_VERSION_CHANGED: "平台规则已更新，请重新阅读并同意。",
  ROLE_CONFLICT: "当前账号已有正式身份，不能切换。",
  MATERIAL_REFERENCE_EXPIRED: "上传材料已超过有效时间，请重新选择材料。",
  MATERIAL_REFERENCE_INVALID: "材料无法使用，请重新选择。",
  MATERIAL_TYPE_UNSUPPORTED: "请选择有效的 JPEG 或 PNG 图片。",
  MATERIAL_TOO_LARGE: "图片不能超过5MiB或2000万像素。",
  CONSENT_VERSION_CHANGED: "材料处理说明已更新，请重新阅读并同意。",
  REQUEST_INVALID: "请检查填写内容和必填项。",
  WECHAT_CREDENTIAL_INVALID: "微信授权已失效，请重新授权。",
  WECHAT_UPSTREAM_UNAVAILABLE: "微信服务暂不可用，请稍后重新授权。",
  LOGIN_REQUIRED: "登录已失效，请重新登录。",
  CLIENT_TYPE_MISMATCH: "凭据类型不匹配，请重新登录。",
  ACCOUNT_ACTION_RESTRICTED: "账号当前受限，请联系平台。",
  PERMISSION_DENIED: "没有访问权限。",
  DATABASE_UNAVAILABLE: "数据服务暂不可用。",
  SESSION_STORE_UNAVAILABLE: "会话服务暂不可用。",
  ACCOUNT_CONTEXT_INCONSISTENT: "账号数据不一致，请联系平台。",
  TOO_MANY_REQUESTS: "操作过于频繁，请稍后重试。",
};
function request(
  path,
  method = "GET",
  interactive = false,
  data,
  extraHeaders = {},
  options = {},
) {
  if (
    options.pdf &&
    !(method === "POST" && /^\/api\/me\/schemes\/[0-9a-f]{32}\/exports$/.test(path))
  )
    return Promise.reject(new Error("不支持的文件请求"));
  const readOnly = method === "GET" || options.readOnly === true;
  const owner = session.capture();
  return new Promise((resolve, reject) => {
    if (!env.baseUrl) {
      reject(new Error("当前版本尚未配置服务地址"));
      return;
    }
    const header = { ...extraHeaders };
    if (data !== undefined) header["Content-Type"] = "application/json";
    const token = owner.token;
    if (token && !options.anonymous) header.Authorization = "Bearer " + token;
    if (interactive && method === "GET")
      header["X-Session-Activity"] = "interactive";
    wx.request({
      url: env.baseUrl + path,
      method,
      data,
      header,
      timeout: options.pdf ? 125000 : 15000,
      responseType: options.pdf ? "arraybuffer" : "text",
      success: (r) => {
        if (!session.isCurrent(owner)) {
          reject(new session.StaleSessionError());
          return;
        }
        let d = r.data;
        if (options.pdf) {
          const headers = Object.fromEntries(
            Object.entries(r.header || {}).map(([k, v]) => [
              k.toLowerCase(),
              v,
            ]),
          );
          const type = String(headers["content-type"] || "").split(";")[0];
          if (
            r.statusCode === 200 &&
            type === "application/pdf" &&
            d instanceof ArrayBuffer
          ) {
            const bytes = new Uint8Array(d);
            const length = Number(headers["content-length"]);
            if (
              bytes.length >= 5 &&
              String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-" &&
              Number.isSafeInteger(length) &&
              bytes.length === length &&
              /^[0-9a-f]{32}$/.test(headers["x-export-id"] || "")
            ) {
              resolve({
                buffer: d,
                exportId: headers["x-export-id"],
                expiresAt: headers["x-file-expires-at"],
                cacheHit: headers["x-cache-hit"] === "true",
              });
              return;
            }
          }
          if (type === "application/json" && d instanceof ArrayBuffer) {
            try {
              d = JSON.parse(
                decodeURIComponent(
                  Array.from(
                    new Uint8Array(d),
                    (x) => "%" + x.toString(16).padStart(2, "0"),
                  ).join(""),
                ),
              );
            } catch (_) {
              d = null;
            }
          } else d = null;
        }
        if (
          r.statusCode === 200 &&
          d &&
          d.code === "OK" &&
          protocol.accepts(path, method, r.statusCode, d)
        ) {
          if (options.onServerTime) {
            const stamp = Object.entries(r.header || {}).find(
              ([name]) => name.toLowerCase() === "x-mujian-time-ms",
            );
            if (stamp && /^\d{13}$/.test(String(stamp[1])))
              options.onServerTime(Number(stamp[1]));
          }
          resolve(d.data);
          return;
        }
        const failure = protocol.failure(path, method, r.statusCode, d);
        if (failure.outcome === "session-expired")
          session.clear(owner, errors[failure.reason]);
        reject(
          Object.assign(
            new Error(
              (errors[failure.reason] || "响应异常，操作结果尚未确认。") +
                (failure.traceId ? " 追踪号：" + failure.traceId : ""),
            ),
            failure,
          ),
        );
      },
      fail: () =>
        reject(
          session.isCurrent(owner)
            ? new Error(readOnly ? "读取失败，请检查网络后重试。" : "网络中断或超时，操作结果尚未确认。")
            : new session.StaleSessionError(),
        ),
    });
  });
}
module.exports = { request };
