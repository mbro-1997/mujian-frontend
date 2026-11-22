// Presentation only: keep the original instant in the API model and all eligibility decisions server-side.
function displayTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "时间暂不可用";
  const beijing = new Date(parsed.getTime() + 8 * 3600000);
  const pad = (v, n = 2) => String(v).padStart(n, "0");
  return `${beijing.getUTCFullYear()}年${pad(beijing.getUTCMonth()+1)}月${pad(beijing.getUTCDate())}日 ${pad(beijing.getUTCHours())}:${pad(beijing.getUTCMinutes())}:${pad(beijing.getUTCSeconds())}.${pad(beijing.getUTCMilliseconds(),3)}（北京时间）`;
}
// 列表与普通提交记录按分钟显示；保留原始时间用于业务校验。
function displayMinute(value) {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "时间暂不可用";
  return new Date(time + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ");
}
function minuteFields(record, names) {
  if (!record) return record;
  const result = { ...record };
  for (const name of names) result[name + "Text"] = displayMinute(record[name]);
  return result;
}
module.exports = {displayTime, displayMinute, minuteFields};
