const tabs = [
  "/pages/home/index",
  "/pages/plan/index",
  "/pages/checklist/index",
  "/pages/mine/index",
];
const renter = ["首页", "方案", "清单", "我的"];
const factory = ["首页", "发布", "仓库", "我的"];
const id = (v) => /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(v);
const oneOf =
  (...values) =>
  (v) =>
    values.includes(v);
// Code follows the C contract; styles additionally follow browse.parseStyles.
const code = (v) => /^[!-~]{1,32}$/.test(v);
const keyword = (v) =>
  v.length >= 1 && v.length <= 128 && !/[\u0000-\u001f\u007f]/.test(v);
function styles(v) {
  try {
    const list = JSON.parse(v);
    return (
      Array.isArray(list) &&
      list.length <= 3 &&
      new Set(list).size === list.length &&
      list.every(
        (x) => typeof x === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(x),
      )
    );
  } catch (_) {
    return false;
  }
}
function date(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const n = Date.parse(v + "T00:00:00Z");
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === v;
}
const source = oneOf("ledger", "sku");
const definitions = {
  "/pages/custom/index": {params:{}},
  "/pages/factory/custom": {params:{}},
  "/pages/custom/factory": {params:{id},required:["id"]},
  "/pages/custom/form": {params:{id,factoryId:id,skuId:id,mode:oneOf("template")}},
  ...Object.fromEntries(["custom/detail","factory/custom-detail"].map(p => ["/pages/"+p,{params:{id, kind:oneOf("requirements","orders")}, required:["id","kind"]}])) ,
  "/pages/checkout/index": {params:{id},required:["id"]},
  "/pages/payment/index": {params:{id},required:["id"]},
  "/pages/orders/index": {params:{view:oneOf("all","pending_accept","accepted","cancelled","refund_exception","pending_outbound","pending_receipt","renting","overdue","return_in_transit","return_checking","return_closed","completed","factory_pending","exceptions")}},
  "/pages/orders/issues": {params:{id},required:["id"]},
  "/pages/orders/detail": {params:{id},required:["id"]},
  "/pages/factory/orders": {params:{view:oneOf("all","pending_accept","accepted","cancelled","refund_exception","pending_outbound","pending_receipt","renting","overdue","return_in_transit","return_checking","return_closed","completed","factory_pending","exceptions")}},
  "/pages/factory/order": {params:{id},required:["id"]},
  "/pages/factory/merchant": {params:{}},
  "/pages/coupons/index": {params:{}},
  "/pages/coupons/detail": {params:{id},required:["id"]},
  "/pages/coupons/records": {params:{}},
  ...Object.fromEntries(["orders", "factory"].map(role => [
    "/pages/" + role + "/fulfillment",
    {params: {id, view: oneOf("outbound", "receipt", "shipment", "returnCheck", "complete", "history")}, required: ["id"]},
  ])),
  ...Object.fromEntries(["orders","factory"].flatMap(role => [
    ["/pages/"+role+"/extensions",{params:{id,orderId:id}}],
    ["/pages/"+role+"/disputes",{params:{id,orderId:id,kind:oneOf("claims","arbitrations","compensation-receivables","receivables"),...(role==="factory"?{create:oneOf("1")}:{})}}],
  ])),
  "/pages/factory/settlements": {params:{id}},
  "/pages/factory/expense": {params:{id,statement:id},required:["id"]},
  "/pages/refund/detail": {params:{id},required:["id"]},
  "/pages/plan/detail": { params: { id }, required: ["id"] },
  "/pages/plan/create": { params: { skuId: id } },
  "/pages/plan/select": { params: { skuId: id }, required: ["skuId"] },
  "/pages/plan/share": {
    params: { token: (v) => /^[A-Za-z0-9_-]{43}$/.test(v) },
    required: ["token"],
  },
  "/pages/checklist/detail": { params: { id }, required: ["id"] },
  "/pages/address/index": { params: { select: oneOf("1") } },
  "/pages/address/edit": { params: { id } },
  "/pages/props/dates": {
    params: {
      schemeId: id,
      expectedVersion: (v) => /^\d+$/.test(v),
      keyword,
      styles,
      typeCode: code,
      startDate: date,
      endDate: date,
    },
    dates: true,
  },
  ...Object.fromEntries(tabs.map((p) => [p, { params: {} }])),
  "/pages/props/browse": {
    params: { keyword, styles, typeCode: code, startDate: date, endDate: date },
    dates: true,
  },
  "/pages/props/product": {
    params: { id, startDate: date, endDate: date },
    required: ["id"],
    dates: true,
  },
  "/pages/props/manage": { params: {} },
  "/pages/props/detail": { params: { id }, required: ["id"] },
  "/pages/props/review": {
    params: {
      id,
      type: oneOf("sku_audit", "sn_adjustment", "stock_adjustment"),
    },
    required: ["id", "type"],
  },
  "/pages/props/reviews": { params: { skuId: id } },
  "/pages/props/form": {
    params: {
      id,
      previous: id,
      assetType: oneOf("A_ASSET", "B_CONSUMABLE"),
      mode: oneOf("create", "edit", "resubmit", "update"),
    },
  },
  "/pages/props/scan/index": { params: { id, scene: id, code: id } },
  "/pages/inventory/index": { params: { id, source }, required: ["id"] },
  "/pages/inventory/adjust": { params: { id }, required: ["id"] },
  "/pages/inventory/movements": { params: { id, source }, required: ["id"] },
  "/pages/inventory/select": { params: {} },
  "/pages/inventory/logs": {
    params: { id, skuId: id, source },
    required: ["id"],
  },
  "/pages/factory/profile": { params: {} },
  "/pages/factory/phone": { params: {} },
  "/pages/factory/status": {
    params: { id, mode: oneOf("onboarding", "change") },
  },
  "/pages/factory/form": { params: { mode: oneOf("onboarding", "change") } },
  "/pages/factory/rules": { params: { readOnly: oneOf("1") } },
  "/pages/factory/invite": { params: {} },
};
function safeReturn(p) {
  const home = tabs[0];
  if (p === "/pages/message/index" || p === "/pages/factory/index") return home;
  // 128 Chinese characters need >1024 bytes when percent encoded. Field bounds remain authoritative.
  if (typeof p !== "string" || p.length > 4096 || p.includes("#")) return home;
  const parts = p.split("?");
  const spec = Object.prototype.hasOwnProperty.call(definitions, parts[0])
    ? definitions[parts[0]]
    : null;
  if (parts.length > 2 || !spec) return home;
  const values = Object.create(null);
  if (parts.length === 2) {
    if (!parts[1]) return home;
    for (const pair of parts[1].split("&")) {
      const split = pair.indexOf("=");
      if (split < 1) return home;
      const key = pair.slice(0, split),
        raw = pair.slice(split + 1);
      if (
        !Object.prototype.hasOwnProperty.call(spec.params, key) ||
        key in values ||
        !/^[A-Za-z0-9_.!~*'()%+\-]*$/.test(raw)
      )
        return home;
      let value;
      try {
        value = decodeURIComponent(raw.replace(/\+/g, " "));
      } catch (_) {
        return home;
      }
      if (!spec.params[key](value)) return home;
      values[key] = value;
    }
  }
  if ((spec.required || []).some((k) => !(k in values))) return home;
  if (spec.dates) {
    if ("startDate" in values !== "endDate" in values) return home;
    if (values.startDate) {
      const span =
        (Date.parse(values.endDate + "T00:00:00Z") -
          Date.parse(values.startDate + "T00:00:00Z")) /
        86400000;
      if (span < 0 || span >= 120) return home;
      // Whether a formerly valid rental period is still available belongs to the business page/server.
    }
  }
  if (parts[0] === "/pages/props/scan/index" && Object.keys(values).length > 1)
    return home;
  if (parts[0] === "/pages/props/form") {
    if (["edit", "resubmit", "update"].includes(values.mode) && !values.id) return home;
    if (values.mode === "resubmit" && !values.previous) return home;
    if (values.previous && values.mode !== "resubmit") return home;
  }
  return p;
}
module.exports = {
  tabs,
  safeReturn,
  items: (c) =>
    tabs.map((path, i) => ({
      path,
      text: (c && c.roleCode === "supplier" ? factory : renter)[i],
      icon:
        c && c.roleCode === "supplier"
          ? ["home", "plus", "box", "person"][i]
          : "circle",
    })),
};
