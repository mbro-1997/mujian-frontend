const contract = require("./response-contract-data");
const { valid } = require("./schema");
const match = require("./contract-route")(contract.paths);
function accepts(path, method, status, body) {
  const route = match(path);
  const schema =
    route?.[method.toLowerCase()]?.[String(status)];
  return !!schema && valid(schema, body, contract.components.schemas);
}
function failure(path, method, status, body) {
  const trusted = status >= 400 && accepts(path, method, status, body);
  const reason = trusted ? body.reasonCode : "UNKNOWN_RESPONSE";
  return {
    reason,
    status,
    traceId: trusted ? body.traceId : "",
    outcome:
      trusted && status < 500
        ? ["LOGIN_REQUIRED", "CLIENT_TYPE_MISMATCH"].includes(reason)
          ? "session-expired"
          : "business-rejection"
        : "unknown",
  };
}
module.exports = { accepts, failure };
