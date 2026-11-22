// Explicit write projection: read DTOs can grow without leaking display/authority fields.
// Both creation and resubmission use this SkuInput boundary; edit-options stays three-field only.
const fields = [
  "propName",
  "typeCode",
  "sizeDesc",
  "lengthCm",
  "widthCm",
  "heightCm",
  "materialDesc",
  "fireResistantCode",
  "weightKg",
  "packagingFactorBps",
  "transportSuggestion",
  "dailyRentPriceFen",
  "depositAmountFen",
  "remark",
];
function skuInput(source) {
  const out = {};
  for (const key of fields) out[key] = source[key];
  out.styleCodes = [...source.styleCodes];
  // Keep local file selection only until materialize; never send preview metadata.
  out.images = source.images.map((image) =>
    image.localPath
      ? { localPath: image.localPath }
      : image.kind === "existing"
        ? { kind: "existing", locator: { ...image.locator } }
        : { kind: "upload", uploadId: image.uploadId },
  );
  return out;
}
module.exports = { skuInput };
