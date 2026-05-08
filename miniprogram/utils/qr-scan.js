function extractQrCodeIdFromText(raw = "") {
  const text = decodeURIComponent(String(raw || ""));
  if (!text) return "";

  const queryStart = text.indexOf("?");
  const query = queryStart >= 0 ? text.slice(queryStart + 1) : text;
  const pairs = query.split("&");
  for (const pair of pairs) {
    const splitIndex = pair.indexOf("=");
    if (splitIndex < 0) continue;
    const key = pair.slice(0, splitIndex);
    const value = pair.slice(splitIndex + 1);
    if ((key === "q" || key === "qrCodeId") && value) {
      return value;
    }
    if (key === "scene" && value) {
      const sceneQrCodeId = extractQrCodeIdFromText(value);
      if (sceneQrCodeId) return sceneQrCodeId;
    }
  }

  const matched = text.match(/QR-\d{14}-[A-Za-z0-9_-]+/);
  return matched ? matched[0] : "";
}

function scanQrCode() {
  return new Promise((resolve, reject) => {
    wx.scanCode({
      onlyFromCamera: true,
      success(res) {
        // 微信小程序码通常把携带参数放在 path，普通二维码才主要看 result。
        const qrCodeId = extractQrCodeIdFromText(res.path || res.result || res.rawData || "");
        if (!qrCodeId) {
          reject(new Error("未识别到有效的道具二维码"));
          return;
        }
        resolve({ qrCodeId, raw: res });
      },
      fail(err) {
        reject(new Error(err.errMsg || "扫码失败"));
      },
    });
  });
}

module.exports = {
  extractQrCodeIdFromText,
  scanQrCode,
};
