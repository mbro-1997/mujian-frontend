const session = require("../session/storage");
const cache = require("./browse-cache"),
  config = require("../config/browse");
const images = new Map(),
  pending = new Map();
// 后端使用上海本地毫秒时间；显式时区，避免iOS解析差异。
function expires(image) {
  if (!image || !image.expiresAt) return 0;
  const raw = image.expiresAt.replace(" ", "T");
  return Date.parse(/Z$|[+-]\d\d:\d\d$/.test(raw) ? raw : raw + "+08:00");
}
function key(image) {
  return cache.scope() + ":" + image.cacheKey;
}
function valid(image) {
  return !!image && expires(image) > Date.now();
}
// 有效旧URL优先；刷新业务数据不会无故更换同一对象的地址。
function accept(image) {
  if (!image || !image.cacheKey) return image;
  const k = key(image),
    existing = images.get(k);
  const selected = valid(existing) ? existing : image;
  images.delete(k);
  images.set(k, selected);
  while (images.size > config.imageCapacity)
    images.delete(images.keys().next().value);
  return { ...selected };
}
// 仅在加载/预览/图片错误时调用；同SKU续取合并，调用者控制一次错误重试。
async function ensure(image, skuId, renew, failed = false, options = {}) {
  if (!image) return null;
  const owner = session.capture();
  if (failed && image.cacheKey) images.delete(key(image));
  const current = failed ? image : accept(image);
  if (!failed && valid(current)) return current;
  const pendingKey = cache.scope() + ":" + (options.scope || "sku:" + skuId);
  let request = pending.get(pendingKey);
  if (!request) {
    request = Promise.resolve()
      .then(renew)
      .then((result) => {
        session.assertCurrent(owner);
        const available = options.extract
          ? options.extract(result)
          : [result.prop.cover, ...result.details.images];
        for (const candidate of available) if (candidate) accept(candidate);
        return available;
      })
      .finally(() => {
        if (pending.get(pendingKey) === request) pending.delete(pendingKey);
      });
    pending.set(pendingKey, request);
  }
  const available = await request;
  session.assertCurrent(owner);
  if (options.current && !options.current())
    throw new session.StaleSessionError();
  const replacement = available.find(
    (candidate) => candidate && candidate.cacheKey === image.cacheKey,
  );
  return replacement ? accept(replacement) : null;
}
function clear() {
  images.clear();
  pending.clear();
}
session.subscribe(clear);
/** 当前公开道具图片由业务后端读取，使用与列表相同的服务地址。 */
function publicPropContentUrl(skuId, image) {
  return require("../config/environment").baseUrl + "/api/public/props/" +
    encodeURIComponent(skuId) + "/images/" + encodeURIComponent(image.cacheKey);
}
module.exports = { accept, ensure, valid, clear, publicPropContentUrl };
