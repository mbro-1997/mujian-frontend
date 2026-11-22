const http = require("./http"),
  session = require("../session/storage");
const rules = () => http.request("/api/public/rules?scene=register");
async function login(phoneCode, acceptedRules, isActive = () => true) {
  const owner = session.capture();
  const code = await new Promise((resolve, reject) =>
    wx.login({
      success: (r) =>
        r.code ? resolve(r.code) : reject(new Error("微信授权失败")),
      fail: () => reject(new Error("微信授权失败")),
    }),
  );
  session.assertCurrent(owner);
  if (!isActive()) throw new session.StaleSessionError();
  const result = await http.request(
    "/api/public/auth/wechat-phone-login",
    "POST",
    false,
    {
      loginCode: code,
      phoneCode,
      consentAccepted: true,
      acceptedRules: acceptedRules.map((r) => ({
        documentId: r.documentId,
        version: r.version,
      })),
    },
  );
  session.assertCurrent(owner);
  if (!isActive()) throw new session.StaleSessionError();
  session.replace(result.sessionToken);
  getApp().globalData.context = result.context;
  return { result, owner: session.capture() };
}
module.exports = {
  rules,
  login,
  bind: () => http.request("/api/me/roles/demander", "POST", false, {}),
  summary: () => http.request("/api/me/account-summary"),
};
