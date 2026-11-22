const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(pageName, context = {}, realHttp = false) {
  const base = path.resolve(__dirname, "../../miniprogram"),
    modules = new Map(),
    pending = [],
    uploads = [],
    storage = new Map([["mj.session", "owner-A"]]),
    nav = [],
    pageStack = [],
    wire = [];
  let options,
    componentOptions,
    clockNow = null;
  class TestDate extends Date {
    constructor(...args) {
      super(
        ...(args.length ? args : [clockNow === null ? Date.now() : clockNow]),
      );
    }
    static now() {
      return clockNow === null ? Date.now() : clockNow;
    }
  }
  const app = { globalData: { context: null } };
  const wx = {
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    getRandomValues: (o) =>
      o.success({ randomValues: new Uint8Array(16).fill(6).buffer }),
    uploadFile: (o) => uploads.push(o),
    request: (o) => wire.push(o),
    navigateBack: () => nav.push("back"),
    switchTab: (o) => nav.push(o.url),
    showToast() {},
    redirectTo: (o) => nav.push(o.url),
    navigateTo: (o) => nav.push(o.url),
    showModal: (o) => o.success({ confirm: true }),
  };
  function load(file) {
    file = path.resolve(base, file);
    if (modules.has(file)) return modules.get(file).exports;
    if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file));
    const module = { exports: {} };
    modules.set(file, module);
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {
      module,
      wx,
      getApp: () => app,
      getCurrentPages: () => pageStack,
      Page: (o) => (options = o),
      Component: (o) => (componentOptions = o),
      Date: TestDate,
      Uint8Array,
      ArrayBuffer,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      require: (n) => {
        const target = path.resolve(
          path.dirname(file),
          n + (n.endsWith(".json") ? "" : ".js"),
        );
        if (target.endsWith("/services/http.js") && !realHttp)
          return {
            request: (...args) =>
              new Promise((resolve, reject) =>
                pending.push({ args, resolve, reject }),
              ),
          };
        if (target.endsWith("/services/factory-contract.js"))
          return { assertResponse: (_p, _m, v) => v };
        if (target.endsWith("/config/environment.js"))
          return { baseUrl: "https://fixture.invalid" };
        if (target.endsWith("/session/activity.js"))
          return { interaction() {}, report() {} };
        if (target.endsWith("/services/account.js"))
          return {
            context: async () => ({
              userId: "user-A",
              accessMode: "normal",
              ...context,
            }),
          };
        return load(target);
      },
    });
    return module.exports;
  }
  const session = load("session/storage.js"),
    api = load("services/props.js");
  if (pageName) load("pages/" + pageName + ".js");
  const page = options && {
    ...options,
    data: structuredClone(options.data),
    setData(v) {
      for (const [key, value] of Object.entries(v)) {
        const parts = key.replace(/\[(\d+)\]/g, ".$1").split(".");
        let target = this.data;
        for (const part of parts.slice(0, -1)) target = target[part];
        target[parts.at(-1)] = value;
      }
    },
  };
  return {
    api,
    session,
    pending,
    uploads,
    storage,
    wx,
    page,
    nav,
    pageStack,
    wire,
    load,
    app,
    setNow(value) {
      clockNow = value;
    },
    get component() {
      return componentOptions;
    },
  };
}
module.exports = { fixture };
