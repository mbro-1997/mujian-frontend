const api = require("./props"),
  cache = require("./browse-cache");
const images = require("./public-images"),
  config = require("../config/browse");
// 所有影响服务器结果的条件统一入键，不把表单输入当作已提交查询。
function query(data) {
  return {
    root: data.rental
      ? "me/props/rentable"
      : data.keyword
        ? "me/props"
        : "public/props",
    typeCode: data.typeCode || "",
    styleCodes: [...(data.styleCodes || [])].sort(),
    keyword: data.keyword || "",
    startDate: data.rental ? data.startDate : "",
    endDate: data.rental ? data.endDate : "",
  };
}
function stateKey(query) {
  return cache.key("list-state", query);
}
function pageKey(query, page) {
  return cache.key("list-page", { ...query, page, pageSize: config.pageSize });
}
function normalizeCard(raw) {
  const value = cache.clone(raw),
    prop = value.prop || value;
  prop.cover = images.accept(prop.cover);
  return value;
}
async function page(query, pageNumber, force = false) {
  const { root, ...params } = query;
  const result = await cache.read(
    pageKey(query, pageNumber),
    () =>
      api.request(
        root +
          "?" +
          api.query({ ...params, page: pageNumber, pageSize: config.pageSize }),
      ),
    force,
  );
  result.items = result.items.map(normalizeCard);
  result.fetchedAt = cache.peek(pageKey(query, pageNumber))?.at || Date.now();
  return result;
}
function options() {
  return cache.read(cache.key("options", "public/props/options"), () =>
    api.request("public/props/options"),
  );
}
function staleLists() {
  cache.invalidate((k) => k.includes("|list-"));
}
function invalidate() {
  cache.invalidate((k) => k.includes("|list-") || k.includes("|detail|"));
}
function denied(error) {
  return (
    [401, 403, 404].includes(error.status) ||
    [
      "LOGIN_REQUIRED",
      "RESOURCE_NOT_FOUND",
      "PERMISSION_DENIED",
      "DEMANDER_ROLE_REQUIRED",
      "ACCOUNT_ACTION_RESTRICTED",
    ].includes(error.reason)
  );
}
function removeInaccessible() {
  cache.remove((k) => k.includes("|list-") || k.includes("|detail|"));
  images.clear();
}
function semantic(value) {
  if (Array.isArray(value)) return value.map(semantic);
  if (value && typeof value === "object") {
    const result = {};
    for (const k of Object.keys(value).sort())
      if (!["url", "expiresAt"].includes(k)) result[k] = semantic(value[k]);
    return result;
  }
  return value;
}
function fingerprint(raw) {
  const prop = raw.prop || raw;
  return JSON.stringify(
    semantic({
      skuId: prop.skuId,
      propName: prop.propName,
      cover: prop.cover,
      type: prop.type,
      styles: prop.styles,
      dailyRentPriceFen: prop.dailyRentPriceFen,
      depositAmountFen: prop.depositAmountFen,
      factory: { id: prop.factory.id, name: prop.factory.name },
      availability: raw.availability || null,
    }),
  );
}
function detailKey(id, dates) {
  return cache.key("detail", {
    id,
    startDate: dates.startDate || "",
    endDate: dates.endDate || "",
  });
}
async function detail(id, dates = {}, force = true) {
  const key = detailKey(id, dates),
    previous = cache.peek(key),
    baseline = cache.peek(
      cache.key("detail-baseline", {
        id,
        startDate: dates.startDate || "",
        endDate: dates.endDate || "",
      }),
    );
  const path =
    (dates.startDate ? "me" : "public") +
    "/props/" +
    id +
    "?" +
    api.query(dates);
  try {
    const result = await cache.read(key, () => api.request(path), force);
    result.prop.cover = images.accept(result.prop.cover);
    result.details.images = result.details.images.map(images.accept);
    const changed =
      (previous && fingerprint(previous.value) !== fingerprint(result)) ||
      (baseline && fingerprint(baseline.value) !== fingerprint(result));
    if (baseline)
      cache.put(
        cache.key("detail-baseline", {
          id,
          startDate: dates.startDate || "",
          endDate: dates.endDate || "",
        }),
        result,
      );
    if (changed) staleLists();
    return { ...result, changed: !!changed };
  } catch (error) {
    if (denied(error)) removeInaccessible();
    throw error;
  }
}
module.exports = {
  query,
  stateKey,
  page,
  options,
  detail,
  detailKey,
  fingerprint,
  staleLists,
  invalidate,
  denied,
  removeInaccessible,
  cache,
  images,
  config,
};
