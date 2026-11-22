const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { createRequire } = require("node:module");
const requireWeb = createRequire(
  path.resolve(__dirname, "../admin-web/package.json"),
);
const ts = requireWeb("typescript");
const evidence = process.env.MJ_EVIDENCE_DIR;
if (!evidence)
  throw Error(
    "MJ_EVIDENCE_DIR is required: use R01 real HTTP evidence, not invented error bodies",
  );
const samples = JSON.parse(
  fs.readFileSync(path.join(evidence, "c-r01-new-error-samples.json"), "utf8"),
);
assert.equal(samples.length, 11);
let current;
const admin = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      path.resolve(__dirname, "../admin-web/src/api/http.ts"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText,
  {
    exports: admin,
    AbortSignal,
    fetch: async () => ({
      status: current.status,
      ok: false,
      json: async () => current.body,
    }),
    require(name) {
      if (name === "../session/boundary")
        return {
          capture: () => 1,
          assertCurrent() {},
          isCurrent: () => true,
          onSessionChange() {},
          canReadIdentity: () => true,
          StaleSessionError: class extends Error {},
        };
      if (name.endsWith(".json"))
        return require(path.resolve(__dirname, "../admin-web/src/api", name));
      return requireWeb(name);
    },
  },
);
const mini = { exports: {} };
vm.runInNewContext(
  fs.readFileSync(
    path.resolve(__dirname, "../miniprogram/services/http.js"),
    "utf8",
  ),
  {
    module: mini,
    wx: {
      request(o) {
        o.success({ statusCode: current.status, data: current.body });
      },
    },
    require(name) {
      if (name === "../config/environment")
        return { baseUrl: "http://fixture.invalid" };
      if (name === "../session/storage")
        return {
          capture: () => ({}),
          isCurrent: () => true,
          clear() {
            throw Error("Business failure must not clear session");
          },
          StaleSessionError: class extends Error {},
        };
      return require(path.resolve(__dirname, "../miniprogram/services", name));
    },
  },
);
for (const sample of samples)
  test(`C-R01 real error ${sample.operationId}/${sample.body.reasonCode}: schema, message and failure outcome`, async () => {
    current = sample;
    const adminRoute = sample.path.startsWith("/api/admin/");
    const invoke = () =>
      adminRoute
        ? admin.api(sample.path, "POST", {})
        : mini.exports.request(sample.path, "POST", false, {});
    await assert.rejects(invoke(), (e) => {
      assert.equal(e.reason, sample.body.reasonCode);
      assert.equal(e.traceId, sample.body.traceId);
      assert.equal(
        e.outcome,
        sample.status < 500 ? "business-rejection" : "unknown",
      );
      assert.ok(
        adminRoute ? admin.errorText[e.reason] : e.message.includes("追踪号"),
      );
      return true;
    });
    // Shared response gate must still reject non-null error data after the .6 additions.
    current = {
      ...sample,
      body: { ...sample.body, data: { unexpected: true } },
    };
    await assert.rejects(
      invoke(),
      (e) => e.reason === "UNKNOWN_RESPONSE" && e.outcome === "unknown",
    );
  });
