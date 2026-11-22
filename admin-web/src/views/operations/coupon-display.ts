export type Row = Record<string, string | number | string[] | null>;
export const pages = {
  templates: {
    title: "券模板",
    endpoint: "coupon-templates",
    managePermission: "admin:coupon-template:manage",
  },
  activities: {
    title: "领券活动",
    endpoint: "coupon-activities",
    managePermission: "admin:coupon-activity:manage",
  },
  rewards: {
    title: "首次奖励规则",
    endpoint: "coupon-reward-rules",
    managePermission: "admin:coupon-reward:manage",
  },
  facts: { title: "首次奖励记录", endpoint: "coupon-reward-records", managePermission: "" },
  batches: { title: "主动发放历史", endpoint: "coupon-distributions", managePermission: "" },
  coupons: { title: "用户持券", endpoint: "user-coupons", managePermission: "" },
} as const;
export const labels: Record<string, string> = {
  benefit: "优惠 / 门槛",
  id: "编号",
  templateId: "模板版本",
  templateCode: "模板编码",
  templateName: "模板名称",
  templateVersion: "模板版本号",
  status: "状态",
  couponType: "优惠类型",
  faceAmountFen: "面额（分）",
  discountRateBps: "租金减免比例（BP）",
  thresholdRentAmountFen: "最低租金（分）",
  applicableScopeType: "适用范围",
  factoryIds: "适用工厂",
  validityType: "有效期",
  validDays: "有效天数",
  validStartAt: "有效期起",
  validEndAt: "有效期止",
  issuedCount: "已发张数",
  condition: "领取资格",
  startsAt: "活动开始",
  endsAt: "活动结束",
  issuedQuantity: "发放张数",
  reason: "说明",
  eventType: "首次事件",
  ruleVersion: "版本",
  userId: "用户",
  sourceId: "来源",
  ruleId: "规则版本",
  reasonCode: "原因",
  userCouponId: "用户券",
  occurredAt: "发生时间",
  requestId: "操作编号",
  mode: "发放对象",
  targetCount: "人数",
  completedAt: "完成时间",
  createdByAdminUserId: "管理员",
  couponStatus: "券状态",
  issueSourceType: "发放来源",
  issueSourceId: "来源编号",
  validFrom: "生效",
  validUntil: "到期",
  createdAt: "创建时间",
  version: "版本",
};
export const enums: Record<string, Record<string, string>> = {
  mode: { selected_users: "指定租赁方", all_users: "全部有效租赁方" },
  couponStatus: {
    unused: "未使用",
    available: "可使用",
    locked: "已锁定",
    used: "已使用",
    expired: "已过期",
    invalid: "已作废",
    invalidated: "已作废",
  },
  issueSourceType: {
    activity_claim: "活动领取",
    admin_distribution: "后台发放",
    initial_reward: "首次奖励",
    first_reward: "首次奖励",
    case_compensation: "客服补偿",
  },
  couponType: { fixed_amount: "金额券", percentage: "租金减免比例券" },
  applicableScopeType: { all: "全平台", factory: "指定工厂" },
  validityType: { relative_days: "相对天数", fixed_range: "固定时段" },
  condition: {
    all_active: "全部有效租赁方",
    student_verified: "实名且学生认证有效",
  },
  eventType: {
    first_realname_verified: "首次实名",
    first_rental_paid: "首次租赁付款",
    first_rental_review: "首次租赁评价",
  },
  status: {
    draft: "草稿",
    active: "已启用",
    ended: "已结束",
    paused: "已暂停",
    completed: "已完成",
    cancelled: "已取消",
    pending: "待发放",
    granted: "已发放",
    not_eligible: "不发放",
  },
};
export const columns = {
  templates: ["templateName", "benefit", "applicableScopeType", "status"],
  activities: ["templateId", "condition", "startsAt", "endsAt", "issuedQuantity", "status"],
  rewards: ["eventType", "templateId", "ruleVersion", "status"],
  facts: ["userId", "eventType", "sourceId", "status", "reasonCode", "occurredAt"],
  batches: ["id", "templateId", "mode", "targetCount", "issuedQuantity", "completedAt"],
  coupons: ["id", "userId", "templateId", "issueSourceType", "validFrom", "validUntil", "couponStatus"],
};
export function cell(row: Row, key: string) {
  if (key === "benefit") {
    const percentage = row.couponType === "percentage";
    const value = percentage ? row.discountRateBps : row.faceAmountFen;
    const offer =
      value == null
        ? "优惠未提供"
        : percentage
        ? Number(value) / 100 + "% 租金减免"
        : "减 ¥" + Number(value) / 100;
    return (
      offer +
      " · " +
      (row.thresholdRentAmountFen == null ? "门槛未提供" : "满 ¥" + Number(row.thresholdRentAmountFen) / 100)
    );
  }
  return show(key, row[key]);
}
export function show(k: string, v: Row[string]) {
  if (k === "discountRateBps" && typeof v === "number") return v + " BP（租金减免 " + v / 100 + "%）";
  return enums[k]?.[String(v)] ?? (Array.isArray(v) ? v.join("、") : v ?? "—");
}
