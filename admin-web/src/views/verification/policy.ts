export type VerificationDomain = "realname" | "student";
export const filterPolicy = {
  realname: { defaultStatus: "pending", statuses: ["pending", "verified", "rejected"] },
  student: { defaultStatus: "", statuses: ["", "pending", "approved", "rejected", "expired"] },
} as const;
export function listQuery(domain: VerificationDomain, status: string, page: number) {
  if (!(filterPolicy[domain].statuses as readonly string[]).includes(status)) {
    throw new Error("该认证领域不支持此状态");
  }
  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (status) query.set("status", status);
  return query;
}
