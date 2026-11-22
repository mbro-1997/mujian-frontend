const http = require("./http"),
  session = require("../session/storage");
const actions = {
  new: [null, "SELECT_IDENTITY"],
  demander_bound: ["demander", "ENTER_DEMANDER_HOME"],
  factory_invite_locked: [null, "COMPLETE_FACTORY_PROFILE"],
  factory_pending: [null, "WAIT_FACTORY_REVIEW"],
  factory_rejected: [null, "REVISE_FACTORY_APPLICATION"],
  factory_bound: ["supplier", "ENTER_FACTORY_HOME"],
};
async function context(interactive = false) {
  const owner = session.capture();
  const c = await http.request("/api/me/context", "GET", interactive);
  session.assertCurrent(owner);
  const match = c && actions[c.registrationStage];
  if (
    !c ||
    Object.keys(c).length !== 7 ||
    !match ||
    c.roleCode !== match[0] ||
    !["active", "disabled"].includes(c.userStatus) ||
    c.accessMode !== (c.userStatus === "disabled" ? "restricted" : "normal") ||
    c.nextAction !==
      (c.userStatus === "disabled" ? "ENTER_RESTRICTED_HOME" : match[1]) ||
    !/^([0-9a-f]{12})4[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(c.userId)
  ) {
    throw new Error("账号上下文无法识别，请联系平台。");
  }
  const previous = getApp().globalData.context;
  if(previous && ["userId","roleCode","registrationStage","accessMode"].some(k=>previous[k]!==c[k])) session.replace(owner.token);
  getApp().globalData.context = c;
  return c;
}
async function logout() {
  const owner = session.capture();
  try {
    await http.request("/api/auth/logout", "POST");
    session.assertCurrent(owner);
    session.clear(owner, "已退出登录");
  } catch (error) {
    session.clear(owner, error.message + " 本地已退出，服务器注销尚未确认。");
    throw error;
  }
}
module.exports = { context, logout };
