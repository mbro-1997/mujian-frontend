function valid(schema, value, schemas) {
  if (typeof schema === "boolean") return schema;
  if (schema.$ref)
    return valid(schemas[schema.$ref.split("/").pop()], value, schemas);
  if (schema.not && valid(schema.not, value, schemas)) return false;
  if (
    schema.oneOf &&
    schema.oneOf.filter((s) => valid(s, value, schemas)).length !== 1
  )
    return false;
  if (schema.anyOf && !schema.anyOf.some((s) => valid(s, value, schemas)))
    return false;
  if (schema.allOf && !schema.allOf.every((s) => valid(s, value, schemas)))
    return false;
  if (
    schema.if &&
    !valid(
      valid(schema.if, value, schemas) ? schema.then || {} : schema.else || {},
      value,
      schemas,
    )
  )
    return false;
  if (
    Object.prototype.hasOwnProperty.call(schema, "const") &&
    JSON.stringify(value) !== JSON.stringify(schema.const)
  )
    return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  const t = schema.type;
  if (
    (t === "null" && value !== null) ||
    (t === "string" && typeof value !== "string") ||
    (t === "boolean" && typeof value !== "boolean") ||
    (t === "integer" && !Number.isSafeInteger(value)) ||
    (t === "number" && typeof value !== "number") ||
    (t === "object" &&
      (!value || typeof value !== "object" || Array.isArray(value))) ||
    (t === "array" && !Array.isArray(value))
  )
    return false;
  if (typeof value === "string") {
    if (schema.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value)))) return false;
    if (schema.format === "uri" && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s]+$/.test(value)) return false;
    const length = Array.from(value).length;
    if (
      (schema.minLength !== undefined && length < schema.minLength) ||
      (schema.maxLength !== undefined && length > schema.maxLength) ||
      (schema.pattern && !new RegExp(schema.pattern).test(value))
    )
      return false;
  }
  if (
    typeof value === "number" &&
    ((schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum))
  )
    return false;
  if (Array.isArray(value)) {
    if(schema.contains){const count=value.filter(v=>valid(schema.contains,v,schemas)).length;if(count<(schema.minContains===undefined?1:schema.minContains)||count>(schema.maxContains===undefined?Infinity:schema.maxContains))return false;}

    if (
      (schema.minItems !== undefined && value.length < schema.minItems) ||
      (schema.maxItems !== undefined && value.length > schema.maxItems) ||
      (schema.uniqueItems &&
        new Set(value.map((v) => JSON.stringify(v))).size !== value.length)
    )
      return false;
    const tuple = schema.prefixItems || [];
    if (!value.every((v, i) => valid(i < tuple.length ? tuple[i] : schema.items ?? true, v, schemas)))
      return false;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (
      schema.required &&
      schema.required.some(
        (k) => !Object.prototype.hasOwnProperty.call(value, k),
      )
    )
      return false;
    for (const key of Object.keys(value)) {
      if (schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, key)) {
        if (!valid(schema.properties[key], value[key], schemas)) return false;
      } else if (schema.additionalProperties === false) return false;
    }
  }
  return true;
}
module.exports = { valid };
