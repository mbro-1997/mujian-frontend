// 只使用显式编译导入；数据库 componentPath 不得拼接成 import 路径。
export const pageRegistry = [
  {routePath:"/workbench/dashboard",componentPath:"workbench/Dashboard",load:()=>import("../views/operations/Administration.vue")},
  {routePath:"/workbench/cases",componentPath:"workbench/Cases",load:()=>import("../views/operations/Administration.vue")},
  {routePath:"/system/accounts",componentPath:"system/Accounts",load:()=>import("../views/operations/Administration.vue")},
  {routePath:"/system/role-grants",componentPath:"system/RoleGrants",load:()=>import("../views/operations/Administration.vue")},
  {routePath:"/system/rules",componentPath:"system/Rules",load:()=>import("../views/operations/Administration.vue")},
  {routePath:"/system/audits",componentPath:"system/Audits",load:()=>import("../views/operations/Administration.vue")},
  {routePath:"/accounts/users",componentPath:"accounts/Users",load:()=>import("../views/operations/Administration.vue")},
  {routePath:"/operations/templates",componentPath:"operations/Templates",load:()=>import("../views/operations/CouponOperations.vue")},
  {routePath:"/operations/activities",componentPath:"operations/Activities",load:()=>import("../views/operations/CouponOperations.vue")},
  {routePath:"/operations/rewards",componentPath:"operations/Rewards",load:()=>import("../views/operations/CouponOperations.vue")},
  {routePath:"/operations/facts",componentPath:"operations/Facts",load:()=>import("../views/operations/CouponOperations.vue")},
  {routePath:"/operations/batches",componentPath:"operations/Batches",load:()=>import("../views/operations/CouponOperations.vue")},
  {routePath:"/operations/coupons",componentPath:"operations/Coupons",load:()=>import("../views/operations/CouponOperations.vue")},
{routePath:"/operations/coupon-issue",componentPath:"operations/CouponIssue",load:()=>import("../views/operations/CouponIssue.vue")},
{routePath:"/custom/extensions",componentPath:"custom/Extensions",load:()=>import("../views/custom/Review.vue")},
{routePath:"/custom/after-sales",componentPath:"custom/AfterSales",load:()=>import("../views/custom/Review.vue")},
{routePath:"/fulfillment/extensions",componentPath:"fulfillment/Extensions",load:()=>import("../views/fulfillment/DisputeReview.vue")},
{routePath:"/fulfillment/claims",componentPath:"fulfillment/Claims",load:()=>import("../views/fulfillment/DisputeReview.vue")},
{routePath:"/fulfillment/arbitrations",componentPath:"fulfillment/Arbitrations",load:()=>import("../views/fulfillment/DisputeReview.vue")},
{routePath:"/fulfillment/receivables",componentPath:"fulfillment/Receivables",load:()=>import("../views/fulfillment/DisputeReview.vue")},

{routePath:"/fulfillment/issues",componentPath:"fulfillment/OrderIssues",load:()=>import("../views/fulfillment/OrderIssues.vue")},
{routePath:"/fulfillment/expenses",componentPath:"fulfillment/TransportExpenses",load:()=>import("../views/fulfillment/TransportExpenses.vue")},
{routePath:"/trading/settlements",componentPath:"trading/Settlements",load:()=>import("../views/trading/Settlements.vue")},
{routePath:"/fulfillment/returns",componentPath:"fulfillment/ReturnWarnings",load:()=>import("../views/fulfillment/ReturnWarnings.vue")},
{routePath:"/fulfillment/risks",componentPath:"fulfillment/FulfillmentRisks",load:()=>import("../views/fulfillment/FulfillmentRisks.vue")},
{routePath:"/trading/orders",componentPath:"trading/RentalOrders",load:()=>import("../views/trading/RentalOrders.vue")},
{routePath:"/trading/payments",componentPath:"trading/Payments",load:()=>import("../views/trading/Payments.vue")},
{routePath:"/trading/refunds",componentPath:"trading/Refunds",load:()=>import("../views/trading/Refunds.vue")},
{routePath:"/trading/merchants",componentPath:"trading/Merchants",load:()=>import("../views/trading/Merchants.vue")},
{routePath:"/trading/transport",componentPath:"trading/Transport",load:()=>import("../views/trading/Transport.vue")},

{routePath:"/props/reviews",componentPath:"props/PropReviews",load:()=>import("../views/props/PropReviews.vue")},
{routePath:"/props/assets",componentPath:"props/PropAssets",load:()=>import("../views/props/PropAssets.vue")},
{routePath:"/props/qr-exceptions",componentPath:"props/QrExceptions",load:()=>import("../views/props/QrExceptions.vue")},

  {
    routePath: "/factory/invitations",
    componentPath: "factory/FactoryInvitations",
    load: () => import("../views/factory/FactoryInvitations.vue"),
  },
  {
    routePath: "/factory/onboarding",
    componentPath: "factory/FactoryOnboarding",
    load: () => import("../views/factory/FactoryOnboarding.vue"),
  },
  {
    routePath: "/factory/changes",
    componentPath: "factory/FactoryChanges",
    load: () => import("../views/factory/FactoryChanges.vue"),
  },
  {
    routePath: "/factory/profiles",
    componentPath: "factory/FactoryProfiles",
    load: () => import("../views/factory/FactoryProfiles.vue"),
  },

  {
    routePath: "/realname/verifications",
    componentPath: "realname/RealnameList",
    load: () => import("../views/realname/RealnameList.vue"),
  },
  {
    routePath: "/student/verifications",
    componentPath: "student/StudentList",
    load: () => import("../views/student/StudentList.vue"),
  },
  {
    routePath: "/system/menus",
    componentPath: "system/MenuReadOnly",
    load: () => import("../views/system/MenuReadOnly.vue"),
  },
] as const;
export function registeredPage(route: string | null, component: string | null) {
  return pageRegistry.find(
    (page) => page.routePath === route && page.componentPath === component,
  );
}
