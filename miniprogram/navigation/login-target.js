const routes = require("../constants/routes");
const home = routes.tabs[0];

// Only consumes server context from account.context() or the completed login response.
// URL validity is owned by safeReturn.
// Object ownership and write eligibility remain server decisions, never inferred from a URL.
function select(context, requested) {
  if (!context) return home;
  if (!context.roleCode) {
    if (
      context.accessMode === "restricted" ||
      context.registrationStage === "new"
    )
      return null; // Keep the existing identity selection/restricted account page.
    return "/pages/factory/index"; // Existing flow resolves invite/profile/review/revision.
  }
  const url = routes.safeReturn(requested),
    parts = url.split("?"),
    path = parts[0];
  const query = {};
  for (const pair of (parts[1] || "").split("&")) {
    if (!pair) continue;
    const [key, value = ""] = pair.split("=");
    try {
      query[key] = decodeURIComponent(value);
    } catch (_) {
      return home;
    }
  }
  // These login producers belong to the renter's plan/checklist placeholders.
  // Sharing physical root paths must not turn that intent into factory publish/warehouse.
  // Normal tab navigation does not use this login continuation selector.
  if (
    context.roleCode === "supplier" &&
    ["/pages/plan/index", "/pages/checklist/index"].includes(path)
  )
    return home;
  if (routes.tabs.includes(path)) return path;
  if (path === "/pages/props/browse" || path === "/pages/props/product") {
    // browse uses public unless keyword/dates; product uses public unless dates.
    const rental =
      !!query.startDate ||
      !!query.endDate ||
      (path === "/pages/props/browse" && !!query.keyword);
    return !rental || context.roleCode === "demander" ? url : home;
  }
  if (
    /^\/pages\/(plan\/(detail|create|select)|custom\/(index|detail|form|factory)|checklist\/(detail|history)|address\/(index|edit)|props\/dates|orders\/(detail|index|issues|extensions|disputes|fulfillment)|refund\/detail)$/.test(
      path,
    )
  )
    return context.roleCode === "demander" ? url : home;
  if (context.roleCode !== "supplier") return home;
  if (
    /^\/pages\/(props\/(manage|detail|review|reviews|form|scan\/index)|inventory\/(index|adjust|movements|select|logs)|factory\/(custom|custom-detail|profile|phone|status|orders|order|fulfillment|expense|extensions|disputes|settlements))$/.test(
      path,
    )
  )
    return url;
  if (path === "/pages/factory/form" && query.mode === "change") return url;
  if (path === "/pages/factory/rules" && query.readOnly === "1") return url;
  return home;
}
function open(url) {
  if (!url) return;
  if (routes.tabs.includes(url)) wx.switchTab({ url });
  else wx.redirectTo({ url });
}
module.exports = { select, open };
