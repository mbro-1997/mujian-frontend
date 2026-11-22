const version = wx.getAccountInfoSync().miniProgram.envVersion;
// 体验、正式包在授权构建时填各自的合法 HTTPS API 域名。
const deploymentOrigins = { trial: "", release: "" };
let baseUrl = deploymentOrigins[version] || "";
let debugEndpoint = "";
let mobileDebug = false;
if (version === "develop") {
  const config = require("./development");
  const platform = wx.getDeviceInfo?.().platform;
  mobileDebug = config.mode === "lan" && ["ios", "android", "ohos", "harmonyos"].includes(platform);
  if (platform === "devtools") debugEndpoint = config.debugLocalUrl;
  if (mobileDebug) debugEndpoint = config.debugLanUrl;
  baseUrl = config.mode === "lan" ? config.lanBaseUrl : config.localBaseUrl;
}
module.exports = {
  development: version === "develop",
  baseUrl,
  debugEndpoint,
  mobileDebug,
};
