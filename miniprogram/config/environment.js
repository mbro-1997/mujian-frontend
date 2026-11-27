const version = wx.getAccountInfoSync().miniProgram.envVersion;
// 体验、正式包在授权构建时填各自的合法 HTTPS API 域名。
const deploymentOrigins = { trial: "", release: "" };
let baseUrl = deploymentOrigins[version] || "";
let debugEndpoint = "";
let wechatPreviewDebug = false;
if (version === "develop") {
  const config = require("./development");
  const platform = wx.getDeviceInfo?.().platform;
  // 微信客户端均通过开发者微信身份校验，电脑微信预览同样走局域网入口。
  wechatPreviewDebug = config.mode === "lan" && platform !== "devtools" && typeof wx.login === "function";
  if (platform === "devtools") debugEndpoint = config.debugLocalUrl;
  if (wechatPreviewDebug) debugEndpoint = config.debugLanUrl;
  // 模拟器与后端同机，使用回环地址即可跨 Wi-Fi 切换；手机使用开发机的局域网地址。
  baseUrl = platform !== "devtools" && config.mode === "lan" ? config.lanBaseUrl : config.localBaseUrl;
}
module.exports = {
  development: version === "develop",
  baseUrl,
  debugEndpoint,
  wechatPreviewDebug,
};
