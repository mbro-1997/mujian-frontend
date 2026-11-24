module.exports = [
  { title: "订单与履约", items: [
    { key: "orders", icon: "list", label: "租赁订单", url: "/pages/factory/orders" },
    { key: "custom", icon: "ruler", label: "定制需求与订单", url: "/pages/factory/custom" },
    { key: "extension", icon: "clock", label: "延期申请", url: "/pages/factory/extensions" },
    { key: "claims", icon: "scale", label: "索赔与仲裁", url: "/pages/factory/disputes" },
  ] },
  { title: "道具与库存", items: [
    { key: "reviews", icon: "shield", label: "道具与库存申请", url: "/pages/props/reviews" },
    { key: "ledger", icon: "box", label: "库存流水", url: "/pages/inventory/select" },
  ] },
  { title: "资金与服务", items: [
    { key: "finance", icon: "ticket", label: "资金结算", url: "/pages/factory/settlements" },
    { key: "merchant", icon: "wallet", label: "收款账户", url: "/pages/factory/merchant" },
    { key: "ratings", icon: "review", label: "评价管理", url: "/pages/factory/ratings" },
    { key: "support", icon: "chat", label: "平台客服", url: "/pages/service/index" },
  ] },
  { title: "资料与账号", items: [
    { key: "profile", icon: "folder", label: "工厂资料", url: "/pages/factory/profile" },
    { key: "phone", icon: "phone", label: "联系电话", url: "/pages/factory/phone" },
    { key: "account", icon: "id", label: "账号管理", url: "/pages/account/index?return=/pages/mine/index" },
    { key: "rules", icon: "rules", label: "平台规则", url: "/pages/factory/rules?readOnly=1" },
  ] },
];
