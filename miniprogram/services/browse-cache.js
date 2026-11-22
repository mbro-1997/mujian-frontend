const session = require("../session/storage");
const config = require("../config/browse");
const entries = new Map(),
  pending = new Map();
let revision = 0;
// 会话代次已覆盖退出、重新登录及服务端身份变更。
function scope() {
  const owner = session.capture();
  const context = getApp().globalData.context || {};
  return [
    owner.generation,
    context.userId || "guest",
    context.roleCode || "",
    context.accessMode || "",
  ].join(":");
}
function key(kind, conditions) {
  return scope() + "|" + kind + "|" + JSON.stringify(conditions);
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function peek(cacheKey) {
  const entry = entries.get(cacheKey);
  if (!entry) return null;
  entries.delete(cacheKey);
  entries.set(cacheKey, entry);
  return {
    value: clone(entry.value),
    at: entry.at,
    dirty: entry.dirty,
    fresh: !entry.dirty && Date.now() - entry.at < config.freshMs,
  };
}
function put(cacheKey, value, at = Date.now(), dirty = false) {
  entries.delete(cacheKey);
  entries.set(cacheKey, {
    value: clone(value),
    at,
    dirty,
    bytes: JSON.stringify(value).length * 2,
  });
  let bytes = 0;
  for (const entry of entries.values()) bytes += entry.bytes;
  while (entries.size > config.capacity || bytes > config.maxCacheBytes) {
    const oldest = entries.keys().next().value;
    bytes -= entries.get(oldest).bytes;
    entries.delete(oldest);
  }
}
// 同键合并；失效或换身份后，旧响应既不写缓存也不返回给旧调用者。
function read(cacheKey, loader, force = false) {
  const existing = peek(cacheKey);
  if (!force && existing && existing.fresh)
    return Promise.resolve(existing.value);
  if (pending.has(cacheKey)) return pending.get(cacheKey);
  const owner = session.capture(),
    started = revision;
  const promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      session.assertCurrent(owner);
      if (started !== revision)
        throw Object.assign(new Error("浏览结果已失效，请重试"), {
          name: "StaleBrowseError",
        });
      put(cacheKey, value);
      return clone(value);
    })
    .finally(() => {
      if (pending.get(cacheKey) === promise) pending.delete(cacheKey);
    });
  pending.set(cacheKey, promise);
  return promise;
}
// 保留旧列表画面但标记失效；页缓存必须整体失效，不能新第一页拼接旧批次。
function invalidate(predicate) {
  revision += 1;
  pending.clear();
  for (const [cacheKey, entry] of entries)
    if (predicate(cacheKey, entry.value)) entry.dirty = true;
}
function remove(predicate) {
  revision += 1;
  pending.clear();
  for (const [cacheKey, entry] of entries)
    if (predicate(cacheKey, entry.value)) entries.delete(cacheKey);
}
function clear() {
  revision += 1;
  entries.clear();
  pending.clear();
}
session.subscribe(clear);
module.exports = {
  key,
  scope,
  peek,
  put,
  read,
  invalidate,
  remove,
  clear,
  clone,
};
