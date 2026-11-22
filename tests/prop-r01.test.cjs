const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const { runForm } = require("./support/prop-form-runner.cjs");
const Ajv = require("../admin-web/node_modules/ajv/dist/2020").default;
const contract = require("../admin-web/src/api/d2c.contract.json");
const ajv = new Ajv({ strict: false, validateFormats: false });
ajv.addSchema({ ...contract, $id: "C" });
const id = "123456789abc4def8abc123456789abc";
const fields = {
  propName: "回填道具",
  typeCode: "stage_structure",
  styleCodes: ["modern"],
  sizeDesc: "一米",
  lengthCm: "100.00",
  widthCm: "50.00",
  heightCm: "30.00",
  materialDesc: "木质",
  fireResistantCode: "no",
  weightKg: "1.00",
  transportSuggestion: "专车",
  dailyRentPriceFen: 10000,
  depositAmountFen: 0,
  remark: null,
  images: [
    {
      locator: {
        sourceType: "sku_audit",
        sourceId: id,
        section: "proposed",
        index: 0,
      },
      preview: { url: "https://fixture.invalid/private" },
    },
  ],
  typeLabel: "只读类型",
  styleLabels: ["只读风格"],
  fireResistantLabel: "只读阻燃",
  futureDisplayField: "不能进入写模型",
};
const options = {
  types: [{ code: "stage_structure", label: "结构", enabled: true }],
  styles: [{ code: "modern", label: "现代", enabled: true }],
  fireResistance: [{ code: "no", label: "否", enabled: true }],
};
function valid(name, v) {
  const validate = ajv.compile({ $ref: "C#/components/schemas/" + name });
  assert.equal(validate(v), true, JSON.stringify(validate.errors));
}
for (const assetType of ["A_ASSET", "B_CONSUMABLE"])
  for (const auditStatus of ["rejected", "cancelled"])
    test(`C-R01 form ${assetType} ${auditStatus}: actual read→submit retains images and excludes display fields`, async () => {
      const r = await runForm({
        sku: { id, version: 0, assetType, fields },
        review: { id, proposed: fields, initialQuantity: 3, auditStatus },
        options,
        uploadId: id,
        addImage: true,
      });
      assert.equal(r.sent.operation, "resubmit_sku");
      valid("ResubmitSku", r.sent.body);
      assert.equal(r.sent.body.fields.images.length, 2);
      assert.equal(r.sent.body.fields.images[0].kind, "existing");
      assert.equal(r.sent.body.fields.images[1].kind, "upload");
      assert.deepEqual(
        r.uploads.map((x) => x.purpose),
        ["prop_image"],
      );
      assert.equal(r.displayFields.typeLabel, "只读类型");
      assert.equal(r.sent.body.fields.futureDisplayField, undefined);
      assert.deepEqual(
        Object.keys(r.sent.body.fields).sort(),
        contract.components.schemas.SkuInput.required.slice().sort(),
      );
    });
test("C-R01 new form uses same explicit write projection", async () => {
  const r = await runForm({
    fields: {
      ...fields,
      images: [{ kind: "upload", uploadId: id, preview: { url: "display" } }],
    },
    assetType: "B_CONSUMABLE",
    options,
    uploadId: id,
  });
  valid("CreateSku", r.sent.body);
  assert.equal(r.sent.operation, "create_sku");
  assert.equal(r.sent.body.fields.images[0].preview, undefined);
});
test("C-R01 immediate edit remains exactly three writable fields plus version", async () => {
  const r = await runForm({
    sku: { id, version: 4, assetType: "A_ASSET", fields, canEditOptions: true },
    options,
    mode: "edit",
  });
  assert.equal(r.sent.operation, "edit_sku_options");
  assert.deepEqual(Object.keys(r.sent.body).sort(), [
    "expectedSkuVersion",
    "styleCodes",
    "transportSuggestion",
    "typeCode",
  ]);
});
