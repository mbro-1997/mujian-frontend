const account = require("../services/account");
const session = require("./storage");
let foreground = false;
let state = null;
function report() {
  const owner = session.capture();
  if (!state || !session.isCurrent(state.owner)) {
    state = { owner, lastAttempt: -Infinity, inFlight: null };
  }
  const current = state;
  if (
    !foreground ||
    !owner.token ||
    current.inFlight ||
    Date.now() - current.lastAttempt < 60000
  )
    return;
  current.lastAttempt = Date.now();
  // 每代会话有独立预算；旧请求finally不能释放新会话正在执行的请求。
  current.inFlight = account
    .context(true)
    .catch(() => {})
    .finally(() => {
      if (state === current) current.inFlight = null;
    });
  return current.inFlight;
}
function show() {
  foreground = true;
  return report();
}
function hide() {
  foreground = false;
}
function interaction(event) {
  if (event && ["tap", "input", "change", "touchstart"].includes(event.type))
    return report();
}
module.exports = { report, show, hide, interaction };
