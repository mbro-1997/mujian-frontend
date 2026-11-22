const contract = require("./factory-contract-data");
const validate = require("./schema").valid;
const valid = (schema, value) =>
  validate(schema, value, contract.components.schemas);
const match = require("./contract-route")(contract.paths);
function assertResponse(path, method, data) {
  const reply = match(path)?.[method.toLowerCase()];
  const schema =
    reply &&
    contract.components.schemas[reply.$ref.split("/").pop()].properties.data;
  if (!schema || !valid(schema, data))
    throw Object.assign(
      new Error("服务响应不符合工厂接口约定，操作结果尚未确认。"),
      { reason: "UNKNOWN_RESPONSE" },
    );
  return data;
}
module.exports = { assertResponse, valid };
