const loginTarget = require("./login-target");
const routes = require("../constants/routes"),
  session = require("../session/storage");
function renterRoute(route) {
  return /^pages\/(plan\/(detail|create|select)|custom\/(index|detail|form|factory)|checklist\/detail|address\/(index|edit)|checkout\/index|payment\/index|orders\/(index|detail|issues|extensions|disputes|fulfillment)|coupons\/(index|detail|records)|refund\/detail)$/.test(
    route || "",
  );
}
function protectedRoute(route) {
  return (
    renterRoute(route) ||
    /^pages\/(props\/(manage|detail|review|reviews|form)|inventory\/(index|adjust|movements|select|logs)|factory\/(custom|custom-detail|profile|phone|orders|order|merchant|ratings|fulfillment|expense|extensions|disputes|settlements))$/.test(
      route || "",
    )
  );
}
function target(route, q) {
  if (/^pages\/(orders|factory)\/disputes$/.test(route) &&
      ["receivables", "compensation-receivables"].includes(q?.kind) &&
      !q.id && q["amp;id"]) {
    q = { ...q, id: q["amp;id"] };
  }
  return routes.safeReturn(
    "/" +
      route +
      (Object.keys(q || {}).length
        ? "?" +
          Object.entries(q)
            .filter(([k]) =>
              [
                "id",
                "orderId",
                "skuId", "kind", "factoryId",
                "type",
                "source",
                "mode",
                "previous",
                "assetType",
                "scene",
                "code",
                "select",
                "view",
                "statement",
              ].includes(k),
            )
            .map(([k, v]) => k + "=" + encodeURIComponent(v))
            .join("&")
        : ""),
  );
}
async function enter(page, q) {
  if (!protectedRoute(page.route)) return true;
  if (!session.token()) {
    wx.redirectTo({
      url:
        "/pages/account/index?resume=1&return=" +
        encodeURIComponent(target(page.route, q)),
    });
    return false;
  }
  const owner = session.capture();
  const c = await require("../services/account").context();
  session.assertCurrent(owner);
  if (renterRoute(page.route)) {
    if (c.roleCode !== "demander") {
      loginTarget.open(
        loginTarget.select(c, target(page.route, q)) || "/pages/account/index",
      );
      return false;
    }
    require("./state").bind(c, "");
    return true;
  }
  if (c.roleCode !== "supplier") {
    loginTarget.open(
      loginTarget.select(c, target(page.route, q)) || "/pages/account/index",
    );
    return false;
  }
  const profile = await require("../services/factory").request(
    "factory-profile",
  );
  session.assertCurrent(owner);
  require("./state").bind(c, profile.id);
  session.assertCurrent(owner);
  return true;
}
function back(page) {
  const stack = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  if (stack.length > 1) {
    wx.navigateBack({ delta: 1 });
    return;
  }
  const route = page.route || "";
  let url = "/pages/home/index";
  const source = (page._navigationQuery || {}).source;
  if (route === "pages/inventory/logs" && page.data.skuId)
    url =
      "/pages/inventory/index?id=" +
      page.data.skuId +
      "&source=" +
      (source === "ledger" ? "ledger" : "sku");
  else if (
    route.startsWith("pages/inventory/") &&
    route !== "pages/inventory/select"
  )
    url =
      source === "ledger"
        ? "/pages/inventory/select"
        : page.data.id
          ? (route === "pages/inventory/index"
              ? "/pages/props/detail?id="
              : "/pages/inventory/index?id=") + page.data.id
          : "/pages/inventory/select";
  else if ((route.endsWith("/extensions") || route.endsWith("/disputes")) && page.data.orderId)
    url=(renterRoute(route)?"/pages/orders/detail?id=":"/pages/factory/order?id=")+page.data.orderId;
  else if ((route.endsWith("/fulfillment") || route==="pages/factory/expense") && page.data.id)
    url = (renterRoute(route) ? "/pages/orders/detail?id=" : "/pages/factory/order?id=") + page.data.id;
  else if (route.startsWith("pages/custom/")) url = "/pages/mine/index";
  else if (route.startsWith("pages/plan/")) url = "/pages/plan/index";
  else if (route.startsWith("pages/checklist/")) url = "/pages/checklist/index";
  else if (route.startsWith("pages/address/")) url = "/pages/mine/index";
  else if (route === "pages/props/review") url = "/pages/props/reviews";
  else if (route === "pages/props/reviews" && page.data.skuId)
    url = "/pages/props/detail?id=" + page.data.skuId;
  else if (route === "pages/props/detail") url = "/pages/checklist/index";
  else if (route === "pages/props/form") url = "/pages/plan/index";
  else if (
    route === "pages/inventory/select" ||
    route === "pages/props/reviews" ||
    route.startsWith("pages/factory/")
  )
    url = "/pages/mine/index";
  if (routes.tabs.includes(url)) wx.switchTab({ url });
  else wx.redirectTo({ url });
}
module.exports = { enter, back, protectedRoute };
