const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { createRequire } = require("node:module");
const requireWeb = createRequire(
  path.resolve(__dirname, "../admin-web/package.json")
);
const ts = requireWeb("typescript");
const source = fs.readFileSync(
  path.resolve(__dirname, "../admin-web/src/api/http.ts"),
  "utf8"
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
function client(status, body, throws = false) {
  const exports = {};
  const boundary = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.resolve(__dirname, "../admin-web/src/session/boundary.ts"),
        "utf8"
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText,
    {
      exports: boundary,
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    }
  );
  vm.runInNewContext(code, {
    exports,
    require: (name) =>
      name === "../session/boundary"
        ? boundary
        : /^\.\/(?:[a-z0-9]+\.)?contract\.json$/.test(name)
        ? requireWeb("./src/api/" + name.slice(2))
        : requireWeb(name),
    AbortSignal,
    fetch: async () => {
      if (throws) throw Error("offline");
      return { status, ok: status === 200, json: async () => body };
    },
  });
  return exports;
}
const traceId = "7e3ae15f531b4d29b670ec83b4f80004";
for (const [status, code, reason] of [
  [403, "FORBIDDEN", "PERMISSION_DENIED"],
  [401, "UNAUTHORIZED", "CREDENTIALS_INVALID"],
  [503, "SERVICE_UNAVAILABLE", "DATABASE_UNAVAILABLE"],
])
  test(`login ${reason} stays distinct`, async () => {
    const c = client(status, {
      code,
      reasonCode: reason,
      data: null,
      message: "测试",
      traceId,
    });
    await assert.rejects(
      c.api("/api/admin/auth/login", "POST", {}),
      (e) => e.reason === reason
    );
    assert.ok(c.errorText[reason]);
  });
test("expired credential, unknown schema and network failures are not permission errors", async () => {
  const expired = client(401, {
    code: "UNAUTHORIZED",
    reasonCode: "LOGIN_REQUIRED",
    data: null,
    message: "测试",
    traceId,
  });
  await assert.rejects(
    expired.api("/api/admin/me"),
    (e) => e.reason === "LOGIN_REQUIRED"
  );
  await assert.rejects(
    client(200, { unexpected: true }).api("/api/admin/me"),
    (e) => e.reason === "UNKNOWN_RESPONSE"
  );
  await assert.rejects(
    client(503, {}, true).api("/api/admin/me"),
    (e) => e.reason === "NETWORK_UNKNOWN"
  );
});
test("derived runtime schemas are exactly synchronized with formal contract", () => {
  const spec = JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../开发交接/D1-最小框架/契约/C-D1基础接口.openapi.json"
      ),
      "utf8"
    )
  );
  const derived = require("../admin-web/src/api/contract.json");
  assert.deepEqual(derived, { components: spec.components, paths: spec.paths });
});

for(const [status,body,outcome]of [
 [200,{unexpected:true},'unknown'],[400,{reasonCode:'REQUEST_INVALID'},'unknown'],
 [500,{code:'DATA_INTEGRITY_ERROR',reasonCode:'FACTORY_DATA_INCONSISTENT',message:'测试',data:null,traceId},'unknown'],
 [400,{code:'INVALID_ARGUMENT',reasonCode:'REQUEST_INVALID',message:'测试',data:null,traceId},'business-rejection']
])test('B admin response '+status+' '+outcome+' is classified only after operation schema validation',async()=>{
 await assert.rejects(client(status,body).api('/api/admin/factory-invitations','POST',{}),e=>e.outcome===outcome);
});

test("D6 正式管理契约区分售后资金拒绝与未知错误", async () => {
  const path = "/api/admin/custom-after-sales/123456789abc4def8abc123456789abc/resolution";
  for (const [reason, outcome] of [["PERMISSION_DENIED","business-rejection"],["NOT_A_D6_REASON","unknown"]]) {
    const err = {code:"FORBIDDEN",reasonCode:reason,message:"拒绝处理",data:null,traceId};
    await assert.rejects(client(403,err).api(path,"POST",{}),e=>e.outcome===outcome);
  }
});
test("D6 小程序正式契约约束原单退款科目和支付错误", () => {
  const protocol = require("../miniprogram/services/response-contract.js");
  const id = "123456789abc4def8abc123456789abc";
  const err = reason => ({code:"STATE_CONFLICT",reasonCode:reason,message:"当前状态受限",data:null,traceId});
  assert.ok(protocol.accepts("/api/custom-requirements/"+id+"/accept-quote","POST",409,err("REALNAME_REQUIRED")));
  assert.ok(!protocol.accepts("/api/custom-requirements/"+id+"/accept-quote","POST",409,err("NOT_A_D6_REASON")));
  const route="/api/custom-orders/"+id+"/refunds", ok = data=>({code:"OK",message:"成功",data,traceId});
  assert.ok(protocol.accepts(route,"GET",200,ok([])));
  assert.ok(!protocol.accepts(route,"GET",200,ok([{goodsFen:1,freightFen:-1}])));
});

test("D6 正式 63 个操作逐项对应后端资源和两个前端注册表", () => {
  const root = path.resolve(__dirname, "../../..");
  const source = fs.readFileSync(path.join(root, "开发交接/D6-定制闭环/契约/C-D6定制接口.openapi.json"), "utf8");
  assert.equal(fs.readFileSync(path.join(root, "代码/mujian-backend/src/main/resources/contracts/d6.openapi.json"), "utf8"), source);
  const formal = JSON.parse(source);
  assert.equal(formal.info.version, "2026-11-24.1");
  const admin = require("../admin-web/src/api/d6.contract.json");
  const mini = require("../miniprogram/services/response-contract-data.js");
  const ids = new Set();
  for (const [route, ops] of Object.entries(formal.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      assert.ok(!ids.has(op.operationId));
      ids.add(op.operationId);
      if (route.startsWith("/api/admin/")) {
        assert.deepEqual(admin.paths[route][method], op);
      } else {
        const expected = Object.fromEntries(Object.entries(op.responses).map(([status, res]) =>
          [status, JSON.parse(JSON.stringify(res.content["application/json"].schema)
            .replaceAll("#/components/schemas/", "#/components/schemas/d6_"))]));
        assert.deepEqual(mini.paths[route][method], expected);
      }
    }
  }
  for (const [name, schema] of Object.entries(admin.components.schemas)) {
    assert.deepEqual(schema, formal.components.schemas[name]);
  }
  for (const [name, schema] of Object.entries(mini.components.schemas)) {
    if (name.startsWith("d6_")) {
      assert.deepEqual(schema, JSON.parse(JSON.stringify(formal.components.schemas[name.slice(3)])
        .replaceAll("#/components/schemas/", "#/components/schemas/d6_")));
    }
  }
  assert.equal(ids.size,63);
});
