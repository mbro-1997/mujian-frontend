// 只管理会话归属，不保存Cookie或业务身份。退出失败也不能由旧GET恢复本地登录。
let generation = 0;
let available = sessionStorage.getItem("mj.localLogout") !== "1";
const listeners = new Set<() => void>();
export class StaleSessionError extends Error {
  readonly reason = "SESSION_CHANGED";
  constructor() {
    super("请求所属会话已变化，结果已丢弃。");
  }
}
export const capture = () => generation;
export const isCurrent = (owner: number) => owner === generation;
export const canReadIdentity = () => available;
export function assertCurrent(owner: number) {
  if (!isCurrent(owner)) throw new StaleSessionError();
}
export function changeSession() {
  generation += 1;
  available = false;
  sessionStorage.setItem("mj.localLogout", "1");
  listeners.forEach((listener) => listener());
  return generation;
}
export function beginSessionChange() {
  const owner = changeSession();
  // 同源其他标签页也丢弃旧身份；这里只广播非敏感失效信号。
  try {
    localStorage.setItem("mj.sessionChange", `${Date.now()}:${Math.random()}`);
  } catch {
    /* 浏览器禁用持久存储时仍保证本页隔离。 */
  }
  return owner;
}
export function acceptLogin(owner: number) {
  assertCurrent(owner);
  available = true;
  sessionStorage.removeItem("mj.localLogout");
}
export function onSessionChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key === "mj.sessionChange") changeSession();
  });
