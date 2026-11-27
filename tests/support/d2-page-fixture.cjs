const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "../../miniprogram");
function fixture(domain = "student", statusPage = false) {
  const storage = new Map([["mj.session", "owner-A"]]),
    app = { globalData: { context: null } },
    pending = [],
    uploads = [],
    navigations = [];
  let pageOptions;
  const wx = {
    showToast(options) { wx.lastToast = options; },
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    login: (o) => o.success({ code: "fictional-code" }),
    getFileSystemManager: () => ({
      stat: (o) => o.success({ stats: { size: 1200 } }),
      readFile: (o) => o.success({ data: new Uint8Array([255,216,255,224,0]).buffer }),
    }),
    getImageInfo: (o) => o.success({ width: 120, height: 90, type: "jpeg" }),
    uploadFile: (o) => uploads.push(o),
    getRandomValues: (o) =>
      o.success({ randomValues: new Uint8Array(16).fill(5).buffer }),
    redirectTo: (o) => navigations.push(o.url),
    navigateTo: (o) => navigations.push(o.url),
    switchTab: (o) => navigations.push(o.url),
  };
  const http = {
      request: (...args) =>
        new Promise((resolve, reject) =>
          pending.push({ args, resolve, reject }),
        ),
    },
    modules = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    vm.runInNewContext(
      fs.readFileSync(file, "utf8"),
      {
        module,
        wx,
        getApp: () => app,
        Page: (o) => (pageOptions = o),
        Uint8Array,
        Date,
        require: (n) => {
          const target = path.resolve(path.dirname(file), n + ".js");
          if (target.endsWith("/services/http.js")) return http;
          if (target.endsWith("/session/activity.js"))
            return { report() {}, interaction() {} };
          if (target.endsWith("/services/account.js"))
            return { context: async () => ({ userId: "user-A" }) };
          if (target.endsWith("/config/environment.js"))
            return { baseUrl: "https://fixture.invalid" };
          return load(target);
        },
      },
      { filename: file },
    );
    return module.exports;
  }
  const session = load("session/storage.js"),
    registration = load("services/registration.js"),
    verification = load("services/verification.js");
  load("pages/" + domain + (statusPage ? "/status.js" : "/form.js"));
  const page = {
    ...pageOptions,
    data: { ...pageOptions.data },
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  return {
    wx,
    storage,
    app,
    pending,
    uploads,
    navigations,
    session,
    registration,
    verification,
    page,
  };
}
const tick = () => new Promise((r) => setImmediate(r));
module.exports = { fixture, tick };
