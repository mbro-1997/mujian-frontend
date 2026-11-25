const DAY = 86400000;
const HOUR = 3600000;
const OPEN_DAYS = 14, CLOSE_DAYS = 2, CLOSE_HOUR = 11, MAX_RENTAL_DAYS = 120;
const iso = date => date.toISOString().slice(0, 10);

function valid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && iso(date) === value;
}

function startWindow(now = Date.now()) {
  const local = now + 8 * HOUR;
  const midnight = Math.floor(local / DAY) * DAY;
  const beforeCutoff = local < midnight + CLOSE_HOUR * HOUR;
  const earliestDays = CLOSE_DAYS + (beforeCutoff ? 0 : 1);
  const after = days => iso(new Date(midnight + days * DAY));
  return {
    earliestDays, latestDays: OPEN_DAYS, earliest: after(earliestDays), latest: after(OPEN_DAYS),
    nextChange: midnight + (beforeCutoff ? CLOSE_HOUR * HOUR : DAY) - 8 * HOUR,
  };
}
function earliestStart(now) { return startWindow(now).earliest; }
function days(start, end) { return valid(start) && valid(end) ? (Date.parse(end) - Date.parse(start)) / DAY + 1 : 0; }
function validStart(start, window) { return valid(start) && start >= window.earliest && start <= window.latest; }
function startHint(window) { return `开始日期限${window.earliestDays}–${window.latestDays}天后`; }
function allowed(start, end, window = startWindow()) {
  const duration = days(start, end);
  return validStart(start, window) && duration >= 1 && duration <= MAX_RENTAL_DAYS;
}
function month(value, offset) {
  const d = new Date(value + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + offset);
  return iso(d).slice(0, 7);
}
function cells(value, start, end, window = startWindow()) {
  const first = new Date(value + "-01T00:00:00Z"), offset = (first.getUTCDay() + 6) % 7;
  const choosingReturn = Boolean(start && !end);
  const lastDay = choosingReturn ? iso(new Date(Date.parse(start) + (MAX_RENTAL_DAYS - 1) * DAY)) : window.latest;
  return Array.from({length: 42}, (_, i) => {
    const d = new Date(first.getTime() + (i - offset) * DAY), date = iso(d);
    let reason = "";
    if (date < window.earliest || (!choosingReturn && date > lastDay)) reason = startHint(window);
    else if (date > lastDay) reason = "租期最长 120 天";
    else if (date.slice(0, 7) !== value) reason = "请切换到对应月份选择";
    const pickup = date === start, dropoff = date === end;
    const inRange = Boolean(start && end && date > start && date < end);
    const state = reason ? "不可选，" + reason : (pickup && dropoff ? "取货和归还" : pickup ? "取货" : dropoff ? "归还" : inRange ? "租期内" : "");
    return { date, day: d.getUTCDate(), disabled: Boolean(reason), reason, start: pickup, end: dropoff, inRange,
      accessibleLabel: date.slice(0, 4) + "年" + label(date) + (state ? "，" + state : "") };
  });
}
function label(value) {
  if (!valid(value)) return "请选择";
  const d = new Date(value + "T00:00:00Z");
  return `${d.getUTCMonth()+1}月${d.getUTCDate()}日 周${"日一二三四五六"[d.getUTCDay()]}`;
}
module.exports = { valid, earliestStart, startWindow, startHint, validStart, days, allowed, month, cells, label };
