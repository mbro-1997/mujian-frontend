const { request } = require("./http");

function getAdminOverview() {
  return request({ url: "/admin/overview" });
}

function getFactoryAudits() {
  return request({ url: "/admin/factory-audits" });
}

function getFactoryAuditHistory() {
  return request({ url: "/admin/factory-audits/history" });
}

function getFactoryAuditDetail(id) {
  return request({ url: `/admin/factory-audits/${id}` });
}

function reviewFactoryAudit(id, approved, remark = "") {
  return request({
    url: `/admin/factory-audits/${id}/review`,
    method: "POST",
    data: { approved, remark },
  });
}

function getFactoryInviteCodes() {
  return request({ url: "/admin/factory-invite-codes" });
}

function createFactoryInviteCode(data = {}) {
  return request({
    url: "/admin/factory-invite-codes",
    method: "POST",
    data,
  });
}

function revokeFactoryInviteCode(id) {
  return request({
    url: `/admin/factory-invite-codes/${id}/revoke`,
    method: "POST",
  });
}

function getPropAudits() {
  return request({ url: "/admin/prop-audits" });
}

function getPropAuditHistory() {
  return request({ url: "/admin/prop-audits/history" });
}

function getPropAuditDetail(id) {
  return request({ url: `/admin/prop-audits/${id}` });
}

function reviewPropAudit(id, approved, remark = "") {
  return request({
    url: `/admin/prop-audits/${id}/review`,
    method: "POST",
    data: { approved, remark },
  });
}

function getDisputes() {
  return request({ url: "/admin/disputes" });
}

function getDisputeDetail(id) {
  return request({ url: `/admin/disputes/${id}` });
}

function decideDispute(id, adminActionType, reason, decisionAmount = 0) {
  return request({
    url: `/admin/disputes/${id}/decision`,
    method: "POST",
    data: { adminActionType, reason, decisionAmount },
  });
}

function getReviews() {
  return request({ url: "/admin/reviews" });
}

function hideReview(id) {
  return request({
    url: `/admin/reviews/${id}/hide`,
    method: "POST",
  });
}

function deleteReview(id) {
  return request({
    url: `/admin/reviews/${id}`,
    method: "DELETE",
  });
}

function getUserStats() {
  return request({ url: "/admin/users" });
}

function generatePropQrCode() {
  return request({
    url: "/admin/props/qr-code",
    method: "POST",
  });
}

function getPendingFillProps() {
  return request({ url: "/admin/props/pending-fill" });
}

function getAdminQrProps() {
  return request({ url: "/admin/props/qr-codes" });
}

function revokePropQrCode(propId) {
  return request({
    url: `/admin/props/qr-codes/${propId}/revoke`,
    method: "POST",
  });
}

function bindUserRole(id, role) {
  return request({
    url: `/admin/users/${id}/roles`,
    method: "POST",
    data: { role },
  });
}

function unbindUserRole(id, role) {
  return request({
    url: `/admin/users/${id}/roles/${role}`,
    method: "DELETE",
  });
}

module.exports = {
  getAdminOverview,
  getFactoryAudits,
  getFactoryAuditHistory,
  getFactoryAuditDetail,
  reviewFactoryAudit,
  getFactoryInviteCodes,
  createFactoryInviteCode,
  revokeFactoryInviteCode,
  getPropAudits,
  getPropAuditHistory,
  getPropAuditDetail,
  reviewPropAudit,
  getDisputes,
  getDisputeDetail,
  decideDispute,
  getReviews,
  hideReview,
  deleteReview,
  getUserStats,
  generatePropQrCode,
  getPendingFillProps,
  getAdminQrProps,
  revokePropQrCode,
  bindUserRole,
  unbindUserRole,
};
