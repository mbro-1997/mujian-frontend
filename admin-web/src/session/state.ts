import {
  capture,
  assertCurrent,
  isCurrent,
  beginSessionChange,
  acceptLogin,
  onSessionChange,
} from "./boundary";
import { ref } from "vue";
import { api, ApiError, errorText, refreshCsrf, isStale } from "../api/http";
export type Menu = {
  id: string;
  parentId: string | null;
  menuName: string;
  menuType: string;
  permissionCode: string | null;
  routePath: string | null;
  componentPath: string | null;
  enabled: boolean;
  visible: boolean;
  sortNo: number;
  children: Menu[];
};
export type Me = {
  userId: string;
  username: string;
  nickname: string;
  permissions: string[];
  roles: { roleCode: string; roleName: string }[];
};
export const me = ref<Me | null>(null);
export const menus = ref<Menu[]>([]);
export const notice = ref("");
export const menuSearch = ref(sessionStorage.getItem("mj.menuSearch") ?? "");
export const lastUsername = ref(
  sessionStorage.getItem("mj.lastUsername") ?? ""
);
export const authBusy = ref(false);
onSessionChange(() => {
  me.value = null;
  menus.value = [];
  notice.value = "";
});
export async function loadIdentity(interactive = false) {
  const owner = capture();
  const [identity, navigation] = await Promise.all([
    api<Me>("/api/admin/me", "GET", undefined, interactive),
    api<Menu[]>("/api/admin/menus"),
  ]);
  assertCurrent(owner);
  me.value = identity;
  menus.value = navigation;
  // 后台身份刷新不能覆盖页面请求刚产生的无权/故障提示。
}
export function explain(e: unknown) {
  if (isStale(e)) return new ApiError("SESSION_CHANGED");
  const error = e instanceof ApiError ? e : new ApiError("UNKNOWN_RESPONSE");
  const message =
    (errorText[error.reason] ?? error.reason) +
    (error.traceId ? ` 追踪号：${error.traceId}` : "");
  if (
    [
      "LOGIN_REQUIRED",
      "CLIENT_TYPE_MISMATCH",
      "ACCOUNT_ACTION_RESTRICTED",
    ].includes(error.reason)
  )
    beginSessionChange();
  notice.value = message;
  if (error.reason === "PERMISSION_DENIED" || !me.value) menus.value = [];
  if (error.reason === "CSRF_INVALID") void refreshCsrf().catch(() => {});
  return error;
}
export async function login(username: string, password: string,captchaId:string,captchaAnswer:string) {
  if (authBusy.value) throw new ApiError("AUTH_IN_PROGRESS");
  const owner = beginSessionChange();
  authBusy.value = true;
  try {
    await refreshCsrf();
    await api("/api/admin/auth/login", "POST", { username, password,captchaId,captchaAnswer });
    assertCurrent(owner);
    acceptLogin(owner);
    await refreshCsrf();
    await loadIdentity();
    assertCurrent(owner);
    return owner;
  } catch (e) {
    if (isStale(e)) throw e;
    if (e instanceof ApiError && e.reason === "NETWORK_UNKNOWN") {
      // 登录网络结果未知时只查询一次确认，不重放密码命令。
      acceptLogin(owner);
      try {
        await loadIdentity();
        await refreshCsrf();
        assertCurrent(owner);
        return owner;
      } catch (probeError) {
        if (isStale(probeError)) throw probeError;
      }
      beginSessionChange();
    }
    const error =
      e instanceof ApiError && !isCurrent(e.owner)
        ? new ApiError(e.reason, e.traceId)
        : e;
    explain(error);
    throw error;
  } finally {
    authBusy.value = false;
  }
}
export async function logout() {
  if (authBusy.value) return null;
  // 立即结束旧读取代次；此后只有当前退出命令能改变退出提示。
  const owner = beginSessionChange();
  authBusy.value = true;
  try {
    await refreshCsrf();
    await api("/api/admin/auth/logout", "POST");
  } catch (e) {
    if (!isCurrent(owner) || isStale(e)) return null;
    explain(e);
    notice.value += " 本地界面已退出；若服务不可达，服务器注销尚未确认。";
    return capture();
  } finally {
    authBusy.value = false;
  }
  return isCurrent(owner) ? owner : null;
}
