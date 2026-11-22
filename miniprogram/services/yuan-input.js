module.exports = function yuanToFen(text, required = false) {
  if (text === "" || text == null) {
    if (required) throw new Error("请填写金额");
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(String(text)))
    throw new Error("请填写非负金额，最多两位小数");
  const [yuan, cent = ""] = String(text).split("."),
    value = Number(yuan) * 100 + Number(cent.padEnd(2, "0"));
  if (value > 2147483647) throw new Error("金额超出范围");
  return value;
};
