const session = require("../session/storage");
const { hint } = require("../services/form-error");

function decode(value) {
  const s = decodeURIComponent(value);
  if (!/^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(s))
    throw Error("不是平台道具码，请重新扫描");
  return s;
}

function scanPropCode(onCode) {
  const owner = session.capture();
  wx.scanCode({
    onlyFromCamera: false,
    success(result) {
      if (!session.isCurrent(owner)) return;
      const raw = result.path || result.result || "";
      const match = /^\/?pages\/props\/scan\/index\?scene=([^&]+)$/.exec(raw);
      let code;
      try { code = decode(match ? match[1] : raw); }
      catch { hint("不是平台道具码，请重新扫描"); return; }
      onCode(code);
    },
    fail(error) {
      if (session.isCurrent(owner) && !String(error.errMsg).includes("cancel")) hint("未能识别，请重新扫描");
    },
  });
}

function openScanner() {
  scanPropCode(code => wx.navigateTo({ url: "/pages/props/scan/index?code=" + code }));
}
module.exports = { decode, scanPropCode, openScanner };
