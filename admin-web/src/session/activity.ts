import { loadIdentity, me, explain } from "./state";
import { capture, isCurrent } from "./boundary";
import { isStale } from "../api/http";
import { router, safeReturn } from "../router";
let state = { owner: capture(), lastReport: -Infinity, inFlight: false };
export function installActivityReporting() {
  const report = (event: Event) => {
    if (!isCurrent(state.owner))
      state = { owner: capture(), lastReport: -Infinity, inFlight: false };
    const current = state;
    if (
      !event.isTrusted ||
      !me.value ||
      document.visibilityState !== "visible" ||
      current.inFlight ||
      Date.now() - current.lastReport < 60000
    )
      return;
    current.lastReport = Date.now();
    current.inFlight = true;
    void loadIdentity(true)
      .catch((e) => {
        if (!isCurrent(current.owner) || isStale(e)) return;
        explain(e);
        if (!me.value)
          void router.replace({
            path: "/login",
            query: { return: safeReturn(router.currentRoute.value.path) },
          });
      })
      .finally(() => {
        if (state === current) current.inFlight = false;
      });
  };
  for (const type of [
    "keydown",
    "pointerdown",
    "touchstart",
    "visibilitychange",
  ])
    document.addEventListener(type, report, { passive: true });
}
