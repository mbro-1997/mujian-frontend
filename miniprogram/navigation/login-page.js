const routes = require("../constants/routes");
const loginTarget = require("./login-target");

// Keep only the allowlisted intent of this login attempt, never old private page data.
module.exports = {
  data: { loginVisible: false, loginReturnPath: "/pages/home/index" },
  openLogin(target) {
    this.setData({ loginReturnPath: routes.safeReturn(target), loginVisible: true });
  },
  closeLogin() {
    this.setData({ loginVisible: false });
  },
  async loginSucceeded(e) {
    const requested = routes.safeReturn(e.detail.returnPath);
    const target = loginTarget.select(e.detail.context, requested);
    this.setData({ loginVisible: false });
    if (!target) {
      wx.navigateTo({ url: "/pages/account/index?resume=1&return=" + encodeURIComponent(requested) });
      return;
    }
    const [path, search = ""] = target.split("?");
    const current = "/" + this.route;
    const homeSearch = current === "/pages/home/index" &&
      path === "/pages/props/browse" && e.detail.context.roleCode === "demander";
    if (path === current || homeSearch) {
      const query = {};
      for (const pair of search.split("&").filter(Boolean)) {
        const at = pair.indexOf("=");
        query[pair.slice(0, at)] = decodeURIComponent(pair.slice(at + 1).replace(/\+/g, " "));
      }
      // Re-enter only after role selection; session invalidation has already cleared private data.
      await this.onLoad(query);
      return this.onShow();
    }
    loginTarget.open(target);
  },
};
