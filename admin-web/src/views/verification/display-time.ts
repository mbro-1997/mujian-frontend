// Presentation only: keep the original instant in the API model and all eligibility decisions server-side.
export function displayTime(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "时间暂不可用";
  const beijing = new Date(parsed.getTime() + 8 * 3600000);
  const pad = (v: number, n = 2) => String(v).padStart(n, "0");
  return `${beijing.getUTCFullYear()}年${pad(beijing.getUTCMonth()+1)}月${pad(beijing.getUTCDate())}日 ${pad(beijing.getUTCHours())}:${pad(beijing.getUTCMinutes())}:${pad(beijing.getUTCSeconds())}.${pad(beijing.getUTCMilliseconds(),3)}（北京时间）`;
}

