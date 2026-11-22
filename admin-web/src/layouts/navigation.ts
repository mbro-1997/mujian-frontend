import { registeredPage } from "../router/registry";
import type { Menu } from "../session/state";

// 分组只决定展示位置。入口必须先由服务端授权且已注册。
const sections: [string, string[]][] = [
  ["工作台", ["/workbench/dashboard", "/workbench/cases"]],
  [
    "账号与资质",
    [
      "/realname/verifications",
      "/factory/invitations",
      "/factory/onboarding",
      "/factory/changes",
      "/student/verifications",
      "/accounts/users",
      "/factory/profiles",
    ],
  ],
  ["道具与库存", ["/props/reviews", "/props/assets", "/props/qr-exceptions"]],
  [
    "订单与履约",
    [
      "/trading/orders",
      "/fulfillment/issues",
      "/fulfillment/risks",
      "/fulfillment/returns",
      "/fulfillment/expenses",
      "/fulfillment/extensions",
    ],
  ],
  ["索赔与仲裁", ["/fulfillment/claims", "/fulfillment/arbitrations"]],
  [
    "资金与结算",
    [
      "/trading/refunds",
      "/fulfillment/receivables",
      "/trading/settlements",
      "/trading/merchants",
      "/trading/payments",
    ],
  ],
  ["客服与定制", ["/custom/extensions", "/custom/after-sales"]],
  [
    "规则与运营",
    [
      "/trading/transport",
      "/system/rules",
      "/operations/templates",
      "/operations/activities",
      "/operations/rewards",
      "/operations/facts",
      "/operations/coupon-issue",
      "/operations/batches",
      "/operations/coupons",
    ],
  ],
  [
    "系统管理",
    [
      "/system/accounts",
      "/system/role-grants",
      "/system/menus",
      "/system/audits",
    ],
  ],
];
export function navigationGroups(tree: Menu[], permissions: string[]) {
  const visible = new Map<string, Menu>();
  function visit(nodes: Menu[]) {
    for (const node of nodes) {
      if (!node.enabled || !node.visible) continue;
      if (
        node.routePath &&
        registeredPage(node.routePath, node.componentPath) &&
        (!node.permissionCode || permissions.includes(node.permissionCode))
      )
        visible.set(node.routePath, node);
      visit(node.children);
    }
  }
  visit(tree);
  const groups = sections.map(([name, paths]) => ({
    name,
    items: paths.flatMap((path) => {
      const node = visible.get(path);
      visible.delete(path);
      return node ? [node] : [];
    }),
  }));
  if (visible.size)
    groups.push({ name: "其他业务", items: [...visible.values()] });
  return groups.filter((group) => group.items.length);
}
