const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { createRequire } = require("node:module"),
  web = createRequire(path.resolve(__dirname, "../admin-web/package.json"));
const Ajv = web("ajv/dist/2020.js"),
  contract = require("../admin-web/src/api/d2b.contract.json"),
  mini = require("../miniprogram/services/factory-contract");
const evidence = process.env.MJ_EVIDENCE_DIR;
const records = evidence
  ? fs
      .readFileSync(path.join(evidence, "d2-http.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse)
  : [];
const ajv = new Ajv({ strict: false });
ajv.addFormat("date-time", (s) => !Number.isNaN(Date.parse(s)));
ajv.addFormat("uri", (s) => /^https?:\/\//.test(s));
let count = 0;
const hits = new Set();
for (const [route, ops] of Object.entries(contract.paths))
  for (const [method, op] of Object.entries(ops)) {
    if (process.env.MJ_INCREMENTAL && !records.some(r=>r.method===method.toUpperCase() && new RegExp("^"+route.replace(/\{[^}]+\}/g,"[^/]+")+"$").test(r.path.split("?")[0]))) continue;
    test(
      method.toUpperCase() +
        " " +
        route +
        " actual HTTP envelope and mini parser",
      () => {
        assert.ok(evidence, "MJ_EVIDENCE_DIR required: no skipped evidence");
        const pattern = new RegExp(
          "^" + route.replace(/\{[^}]+\}/g, "[^/]+") + "$",
        );
        const matching = records.filter(
          (r) =>
            r.method === method.toUpperCase() &&
            pattern.test(r.path.split("?")[0]) &&
            Object.keys(contract.paths)
              .sort((a, b) => Number(a.includes("{")) - Number(b.includes("{")))
              .find((p) =>
                new RegExp("^" + p.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(
                  r.path.split("?")[0],
                ),
              ) === route,
        );
        assert.ok(matching.length, "operation has not been executed");
        for (const r of matching) {
          const response = op.responses[String(r.status)];
          assert.ok(response, "undeclared status " + r.status);
          const validate = ajv.compile({
            ...response.content["application/json"].schema,
            components: contract.components,
          });
          assert.ok(
            validate(r.body),
            JSON.stringify({ status: r.status, errors: validate.errors }),
          );
          if (
            r.status === 200 &&
            route.startsWith("/api/me/") &&
            route !== "/api/me/factory-materials"
          )
            mini.assertResponse(r.path, r.method, r.body.data);
          if (!route.startsWith("/api/admin/")) {
            assert.ok(require("../miniprogram/services/response-contract").accepts(r.path, r.method, r.status, r.body), "mini operation envelope must match");
          }
          count++;
          hits.add(method + " " + route);
        }
      },
    );
  }
test.after(() => {
  if (evidence)
    fs.writeFileSync(
      path.join(evidence, "client-schema-validation.json"),
      JSON.stringify(
        {
          responseCount: count,
          operationCount: hits.size,
          required: process.env.MJ_INCREMENTAL ? "only operations reached by incremental scenarios" : 37,
          boundary:
            "Actual isolated HTTP responses; AJV admin and mini success parser; fixture WeChat/COS, real MySQL/Redis",
        },
        null,
        2,
      ),
    );
});

test('approved operation-specific error mappings stay registered in all copies',()=>{
 const source=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../开发交接/D2-准入与道具可租/契约/C-D2-B工厂准入与资料管理.openapi.json')));
 assert.deepEqual(contract,{components:source.components,paths:source.paths});
 assert.deepEqual(require('../../mujian-backend/src/main/resources/contracts/d2b.openapi.json'),source);
 const expected=[['/api/me/factory-invitations/claim',409,'STATE_CONFLICT','INVITATION_HAS_APPLICATION'],['/api/admin/factory-invitations/{id}/revoke',409,'STATE_CONFLICT','VERSION_CONFLICT']];
 for(const route of ['/api/me/factory-onboarding','/api/me/factory-profile-changes'])for(const [status,code,reason]of [[409,'STATE_CONFLICT','FACTORY_ALREADY_REVIEWED'],[404,'NOT_FOUND','RESOURCE_NOT_FOUND'],[503,'SERVICE_UNAVAILABLE','OBJECT_STORAGE_UNAVAILABLE']])expected.push([route,status,code,reason]);
 for(const[route,status,code,reasonCode]of expected){
  const body={code,reasonCode,data:null,message:'契约归属检查',traceId:'00000000000040008000000000000001'};
  assert.ok(ajv.compile({...contract.paths[route].post.responses[String(status)].content['application/json'].schema,components:contract.components})(body),route+' '+reasonCode);
  if(process.env.MJ_INCREMENTAL)assert.ok(records.some(r=>r.method==='POST' && new RegExp('^'+route.replace(/\{[^}]+\}/g,'[^/]+')+'$').test(r.path)&&r.status===status&&r.body.reasonCode===reasonCode),'missing actual incremental response '+route+' '+reasonCode);
 }
});
