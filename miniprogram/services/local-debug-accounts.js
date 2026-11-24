const env = require("../config/environment");
const session = require("../session/storage");
const roles = ["demander", "supplier"];
let switching = false;

function available() {
  return env.development && Boolean(env.debugEndpoint);
}

async function authorization() {
  if (env.wechatPreviewDebug) {
    const result = await new Promise((resolve, reject) => wx.login({
      timeout: 8000,
      success: resolve,
      fail: () => reject(new Error("微信未能确认当前账号，请重试。")),
    }));
    if (!result.code) throw new Error("微信未返回登录凭据，请重试。");
    return "WeChat " + result.code;
  }
  const pair = wx.getStorageSync("mj.localDebugPair");
  if (pair?.origin !== env.baseUrl || !/^[0-9a-f]{64}$/.test(pair.secret))
    throw new Error("请先在电脑运行调试账号命令。");
  return "Bearer " + pair.secret;
}

function request(options) {
  return new Promise((resolve, reject) => wx.request({
    ...options, timeout: 8000, success: resolve,
    fail: () => reject(new Error("无法连接开发服务，请核对电脑地址、网络和调试服务状态。")),
  }));
}

async function switchAccount(role, { logoutFirst = false } = {}) {
  if (!available() || !roles.includes(role)) throw new Error("当前环境不可切换测试账号。");
  if (switching) throw new Error("正在切换账号");
  switching = true;
  try {
    if (logoutFirst && session.token()) {
      await require("./account").logout();
      if (session.token()) throw new Error("登录状态已变化，请重新选择测试账号。");
    }
    const owner = session.capture();
    const auth = await authorization();
    session.assertCurrent(owner);
    const issued = await request({
      url: env.debugEndpoint + "/sessions/" + role, method: "POST",
      header: { Authorization: auth },
    });
    if (env.wechatPreviewDebug && issued.statusCode === 403)
      throw new Error("请使用与本机微信开发者工具相同的微信账号打开开发预览。");
    if (issued.statusCode !== 200 || !issued.data?.token)
      throw new Error(issued.statusCode === 409 ? "测试账号或工厂状态已变化，请核对开发库。" : "调试服务不可用，请重新运行调试账号命令。");
    const { token, userId } = issued.data;
    const result = await request({ url: env.baseUrl + "/api/me/context", method: "GET",
      header: { Authorization: "Bearer " + token } });
    const context = result.data?.data;
    if (result.statusCode !== 200 || !userId || context?.userId !== userId || context.roleCode !== role ||
        context.userStatus !== "active" || context.accessMode !== "normal")
      throw new Error("当前后端无法确认所选测试账号，请核对开发服务。");
    session.assertCurrent(owner);
    session.replace(token);
    await new Promise((resolve, reject) => wx.reLaunch({ url: "/pages/home/index", success: resolve, fail: reject }));
    return userId;
  } finally { switching = false; }
}
module.exports = { available, switchAccount };
