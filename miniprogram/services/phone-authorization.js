// 缺少手机号 code 可能是取消、能力权限或平台失败，不能一律归因为用户取消。
function failure(detail, development = false) {
  detail = detail || {};
  if (typeof detail.code === "string" && detail.code.trim()) return null;
  const raw = typeof detail.errMsg === "string" ? detail.errMsg : "";
  let message;
  if (/user\s+(deny|cancel)|:fail\s+cancel\b/i.test(raw))
    message = "你取消了手机号授权，可继续浏览。";
  else if (
    /no permission|permission denied|access denied|not authorized|api scope/i.test(
      raw,
    )
  )
    message = "微信暂未开放此小程序的手机号授权能力，请联系平台核对。";
  else if (/privacy/i.test(raw))
    message = "微信隐私授权尚未完成，请按微信提示确认后重试。";
  else if (/quota|balance|fee|exceed.*limit/i.test(raw))
    message = "微信手机号服务暂不可用，请稍后重试或联系平台。";
  else message = "微信未返回手机号授权码，登录尚未开始。请稍后重试。";
  if (development) {
    // 只显示平台错误说明；绝不回显 code/encryptedData/iv/手机号或完整事件。
    const safe = raw
      .replace(/(?:code|token|openid|phone)\s*[:=]\s*[^\s,;]+/gi, "[已隐藏]")
      .replace(/\d{11,}/g, "[已隐藏]")
      .replace(/[\r\n<>]/g, " ")
      .slice(0, 160);
    const number = Number.isSafeInteger(detail.errCode)
      ? ` (${detail.errCode})`
      : "";
    message += ` 调试信息：${safe || "微信回调未附错误说明"}${number}`;
  }
  return message;
}
module.exports = { failure };
