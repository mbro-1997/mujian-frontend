const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "../admin-web/src");
const webRequire = createRequire(path.resolve(root, "../package.json"));
const ts = webRequire("typescript");
const contract = require("../admin-web/src/api/contract.json");
function fixture(options = {}) {
  const route = {query: {}, path: "/", ...options.route};
  const props = options.props || {};
  const watchers = [];
  const pending = [],
    modules = new Map(),
    navigations = [],
    events = {},
    mounted = [],
    unmounted = [],
    guards = [];
  const stored = new Map();
  let now = 100000,
    visibility = "visible";
  const vue = {
    nextTick: () => Promise.resolve(),
    ref: (value) => ({ value }),
    computed: (getter) => ({
      get value() {
        return getter();
      },
    }),
    watch: (sources, fn) => watchers.push({sources, fn}),
    onMounted: (fn) => mounted.push(fn),
    onUnmounted: (fn) => unmounted.push(fn),
  };
  const router = {
    currentRoute: { value: { path: "/system/menus" } },
    beforeEach: (fn) => guards.push(fn),
    replace: async (value) => navigations.push(value),
    push: async (value) => navigations.push(value),
  };
  function load(name, exportsList) {
    const file = path.resolve(root, name);
    if (modules.has(file)) return modules.get(file).exports;
    if (file.endsWith(".json"))
      return JSON.parse(fs.readFileSync(file, "utf8"));
    const module = { exports: {} };
    modules.set(file, module);
    let source = fs.readFileSync(file, "utf8");
    if (file.endsWith(".vue"))
      source =
        source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] +
        "\nexport { " +
        exportsList.join(",") +
        " };";
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    vm.runInNewContext(
      code,
      {
        module,
        exports: module.exports,
        AbortSignal,
        URLSearchParams,
        crypto: require("node:crypto").webcrypto,
        defineProps: () => props,
        setTimeout, clearTimeout,
        Date: { now: () => now },
        sessionStorage: {
          getItem: (key) => stored.get(key) ?? null,
          setItem: (key, value) => stored.set(key, value),
          removeItem: (key) => stored.delete(key),
        },
        localStorage: { setItem() {} },
        window: {
          addEventListener: (name, fn) => {
            events["window:" + name] = fn;
          },
        },
        document: {
          querySelector: () => null,
          get visibilityState() {
            return visibility;
          },
          addEventListener: (name, fn) => {
            events[name] = fn;
          },
        },
        fetch: (url, options) =>
          new Promise((resolve, reject) =>
            pending.push({ url, options, resolve, reject })
          ),
        require(name) {
          if (name === "vue") return vue;
          if (options.mocks?.[name]) return options.mocks[name];
          if (name === "element-plus") return {ElMessageBox: {confirm: async () => {}}};
          if (/^element-plus\/es\/components\/[a-z-]+\/style\/css$/.test(name)) return {};
          if (name === "vue-router")
            return {
              useRoute: () => route,
              useRouter: () => router,
              createWebHistory: () => ({}),
              createRouter: () => router,
            };
          if (name.endsWith("/router"))
            return {
              router,
              safeReturn: (p) => (typeof p === "string" ? p : "/"),
            };
          if (name.startsWith(".")) {
            let target = path.resolve(path.dirname(file), name);
            if (!path.extname(target)) target += ".ts";
            return load(target);
          }
          return webRequire(name);
        },
      },
      { filename: file }
    );
    return module.exports;
  }
  function reply(request, status = 200, reason) {
    const content =
      contract.paths[request.url][request.options.method.toLowerCase()]
        .responses[String(status)].content["application/json"];
    const example = content.example || content.examples[reason].value;
    request.resolve({
      status,
      ok: status === 200,
      json: async () => JSON.parse(JSON.stringify(example)),
    });
  }
  return {
    load,
    route, props, watchers,
    pending,
    reply,
    navigations,
    events,
    mounted,
    unmounted,
    guards,
    stored,
    advance: (ms) => {
      now += ms;
    },
    hide: () => {
      visibility = "hidden";
    },
    show: () => {
      visibility = "visible";
    },
  };
}
module.exports = { fixture };
