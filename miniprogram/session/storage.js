const key = "mj.session";
let credential = wx.getStorageSync(key) || "";
let generation = 0;
const listeners = new Set();

class StaleSessionError extends Error {
  constructor() {
    super("请求所属会话已结束，结果已丢弃。");
    this.name = "StaleSessionError";
  }
}
function changed(value, message = "") {
  credential = value;
  generation += 1;
  getApp().globalData.context = null;
  listeners.forEach((listener) => listener(message));
}
function capture() {
  const value = wx.getStorageSync(key) || "";
  // 兼容开发工具隔离夹具替换凭据；正式写入口仍须使用replace/clear。
  if (value !== credential) changed(value);
  return { token: credential, generation };
}
function isCurrent(owner) {
  const current = capture();
  return (
    owner.generation === current.generation && owner.token === current.token
  );
}
function assertCurrent(owner) {
  if (!isCurrent(owner)) throw new StaleSessionError();
}
function clear(owner = capture(), message = "") {
  if (!isCurrent(owner)) return false;
  wx.removeStorageSync(key);
  changed("", message);
  return true;
}
function replace(value) {
  wx.setStorageSync(key, value);
  changed(value || "");
}
module.exports = {
  token: () => capture().token,
  capture,
  isCurrent,
  assertCurrent,
  clear,
  replace,
  StaleSessionError,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
