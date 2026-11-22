import { capture, isCurrent } from "../session/boundary";
import { isStale } from "../api/http";
import { createRouter, createWebHistory } from "vue-router";
import { pageRegistry } from "./registry";
import { navigationGroups } from "../layouts/navigation";
import { menus, me, loadIdentity, explain } from "../session/state";
export const safeReturn = (path: unknown) =>
  typeof path === "string" &&
  (["/", ...pageRegistry.map((page) => page.routePath)] as string[]).includes(
    path
  )
    ? path
    : "/";
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: () => import("../views/auth/LoginView.vue") },
    {
      path: "/",
      component: () => import("../layouts/AdminLayout.vue"),
      children: [
        { path: "", component: () => import("../views/home/HomeView.vue") },
        ...pageRegistry.map((page) => ({
          path: page.routePath.slice(1),
          component: page.load,
        })),
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
router.beforeEach(async (to) => {
  if (to.path === "/login") return true;
  const owner = capture();
  try {
    await loadIdentity(document.visibilityState === "visible");
  } catch (e) {
    if (!isCurrent(owner) || isStale(e)) return false;
    const err = explain(e);
    if (
      [
        "LOGIN_REQUIRED",
        "CLIENT_TYPE_MISMATCH",
        "ACCOUNT_ACTION_RESTRICTED",
      ].includes(err.reason)
    )
      return { path: "/login", query: { return: safeReturn(to.path) } };
    return true;
  }
  if (!isCurrent(owner)) return false;
  if (!me.value) return "/login";
  if (to.path === "/" && to.query.view !== "account") {
    const groups = navigationGroups(menus.value, me.value.permissions);
    if (groups.some(g => g.items.some(item => item.routePath === "/workbench/dashboard")))
      return "/workbench/dashboard";
  }
  return true;
});
