const {
  getOrderStatusText,
  getOrderStatusClass,
  getPropStatusText,
  getPropStatusClass,
} = require("../constants/status");
const { request } = require("./http");
const { getSelectedRole } = require("./user.service");
const { normalizeProp } = require("./prop.service");

function normalizeOrderItem(item) {
  const prop = normalizeProp(item);
  return {
    ...prop,
    statusText: item.statusText || getPropStatusText(item.status),
    statusClass: getPropStatusClass(item.status),
    outboundScanned: !!item.outboundScanned,
    returnScanned: !!item.returnScanned,
  };
}

function normalizeDispute(item = {}) {
  return {
    id: item.id,
    orderId: item.orderId,
    orderNo: item.orderNo || item.orderId,
    title: item.title || "订单仲裁",
    content: item.content || "",
    applicant: item.applicant || "",
    applicantRole: item.applicantRole || "",
    applicantRoleText: item.applicantRoleText || "",
    applyStage: item.applyStage || "",
    applyStageText: item.applyStageText || "",
    claimAmount: Number(item.claimAmount || 0),
    depositAmount: Number(item.depositAmount || 0),
    evidenceUrls: item.evidenceUrls || "",
    evidenceImages: item.evidenceImages || [],
    status: item.status || "pending",
    statusText: item.statusText || (item.status === "resolved" ? "已同意" : item.status === "closed" ? "已拒绝" : "待仲裁"),
    createdAt: item.createdAt || "",
    resolvedAt: item.resolvedAt || "",
    resolution: item.resolution || "",
    resolutionType: item.resolutionType || "",
    resolutionTypeText: item.resolutionTypeText || "",
    refundStatus: item.refundStatus || "none",
  };
}

function normalizeOrder(item) {
  const props = (item.props || []).map(normalizeOrderItem);
  return {
    id: item.id,
    orderNo: item.orderNo,
    projectId: Number(item.projectId),
    supplierUserId: item.supplierUserId || null,
    supplierName: item.supplierName || (item.supplierUserId ? `工厂 ${item.supplierUserId}` : ""),
    paymentId: item.paymentId || null,
    paymentNo: item.paymentNo || "",
    sourceProjectName: item.sourceProjectName || "",
    status: item.status,
    statusText: item.statusText || getOrderStatusText(item.status),
    statusClass: getOrderStatusClass(item.status),
    payStatus: item.payStatus,
    rentalDays: Number(item.rentalDays || 1),
    rentalStartDate: item.rentalStartDate || "",
    rentalEndDate: item.rentalEndDate || "",
    contactAddress: item.contactAddress || "",
    useScene: item.useScene || "",
    specialRemark: item.specialRemark || "",
    cancelReason: item.cancelReason || "",
    demanderName: item.demanderName || "",
    demanderPhone: item.demanderPhone || "",
    demanderIdentity: item.demanderIdentity || "",
    demanderCreditScore: item.demanderCreditScore || "",
    price: Number(item.price || 0),
    deposit: Number(item.deposit || 0),
    date: item.date || "",
    propIds: (item.propIds || []).map((id) => Number(id)),
    props,
    propCount: Number(item.propCount || props.length),
    outboundScannedCount: Number(item.outboundScannedCount || 0),
    returnScannedCount: Number(item.returnScannedCount || 0),
    canFactoryConfirm: !!item.canFactoryConfirm,
    canFactoryReject: !!item.canFactoryReject,
    canScanOutbound: !!item.canScanOutbound,
    canScanReturn: !!item.canScanReturn,
    canReview: !!item.canReview,
    canApplyDispute: !!item.canApplyDispute,
    disputeCount: Number(item.disputeCount || 0),
    disputes: (item.disputes || []).map(normalizeDispute),
    demanderReviewed: !!item.demanderReviewed,
    supplierReviewed: !!item.supplierReviewed,
    confirmDeadlineAt: item.confirmDeadlineAt || null,
    createdAt: item.createdAt || null,
    paidAt: item.paidAt || null,
    confirmedAt: item.confirmedAt || null,
    pickedUpAt: item.pickedUpAt || null,
    returnedAt: item.returnedAt || null,
    reviewedAt: item.reviewedAt || null,
  };
}

function normalizePayResult(item = {}) {
  return {
    orderId: item.orderId || null,
    orderIds: (item.orderIds || []).map((id) => Number(id)),
    orders: (item.orders || []).map(normalizeOrder),
    splitOrderCount: Number(item.splitOrderCount || (item.orders || []).length || 0),
    projectName: item.projectName || "",
    paymentId: item.paymentId || null,
    paymentNo: item.paymentNo || "",
    merchantOutTradeNo: item.merchantOutTradeNo || "",
    prepayId: item.prepayId || "",
    transactionId: item.transactionId || "",
    payStatus: item.payStatus || "",
    mock: !!item.mock,
  };
}

async function listOrders(role) {
  const currentRole = role || getSelectedRole();
  const query = role ? `?role=${encodeURIComponent(currentRole)}` : "";
  const data = await request({ url: `/orders${query}` });
  return (data || []).map(normalizeOrder);
}

async function getOrderById(id) {
  const data = await request({ url: `/orders/${id}` });
  return normalizeOrder(data);
}

async function createOrderFromProject(projectId, payload = {}) {
  const data = await request({
    url: "/orders/checkout",
    method: "POST",
    data: {
      projectId: Number(projectId),
      rentalDays: Number(payload.rentalDays || 1),
      rentalStartDate: payload.rentalStartDate || "",
      rentalEndDate: payload.rentalEndDate || "",
      contactAddress: payload.contactAddress || "",
      useScene: payload.useScene || "",
      specialRemark: payload.specialRemark || "",
    },
  });
  return normalizePayResult(data);
}

async function confirmOrderByFactory(orderId) {
  const data = await request({
    url: `/factory/orders/${orderId}/confirm`,
    method: "POST",
  });
  return normalizeOrder(data);
}

async function rejectOrderByFactory(orderId, rejectReason) {
  const data = await request({
    url: `/factory/orders/${orderId}/reject`,
    method: "POST",
    data: { rejectReason },
  });
  return normalizeOrder(data);
}

async function scanOutboundProp(orderId, propId) {
  const data = await request({
    url: `/factory/orders/${orderId}/outbound-scan`,
    method: "POST",
    data: { propId: Number(propId) },
  });
  return normalizeOrder(data);
}

async function scanReturnProp(orderId, propId) {
  const data = await request({
    url: `/factory/orders/${orderId}/return-scan`,
    method: "POST",
    data: { propId: Number(propId) },
  });
  return normalizeOrder(data);
}

async function scanOutboundQrCode(orderId, qrCodeId) {
  const data = await request({
    url: `/factory/orders/${orderId}/outbound-scan`,
    method: "POST",
    data: { qrCodeId },
  });
  return normalizeOrder(data);
}

async function scanReturnQrCode(orderId, qrCodeId) {
  const data = await request({
    url: `/factory/orders/${orderId}/return-scan`,
    method: "POST",
    data: { qrCodeId },
  });
  return normalizeOrder(data);
}

async function submitOrderReview(orderId, reviewPayload) {
  const data = await request({
    url: `/orders/${orderId}/reviews`,
    method: "POST",
    data: {
      score: Number(reviewPayload.score || 5),
      propScore: Number(reviewPayload.propScore || reviewPayload.score || 5),
      counterpartyScore: Number(reviewPayload.counterpartyScore || reviewPayload.score || 5),
      content: reviewPayload.content || "",
      reviewerRole: reviewPayload.reviewerRole || getSelectedRole(),
    },
  });
  return normalizeOrder(data);
}

async function submitOrderDispute(orderId, disputePayload) {
  const data = await request({
    url: `/orders/${orderId}/disputes`,
    method: "POST",
    data: {
      reason: disputePayload.reason || "",
      claimAmount: Number(disputePayload.claimAmount || 0),
      evidenceUrls: disputePayload.evidenceUrls || "",
    },
  });
  return normalizeOrder(data);
}

async function listMyDisputes() {
  const data = await request({ url: "/orders/disputes" });
  return (data || []).map(normalizeDispute);
}

async function expireTimedOutOrders() {
  return null;
}

async function markOrderPaid(orderId) {
  return getOrderById(orderId);
}

module.exports = {
  listOrders,
  getOrderById,
  markOrderPaid,
  createOrderFromProject,
  confirmOrderByFactory,
  rejectOrderByFactory,
  scanOutboundProp,
  scanReturnProp,
  scanOutboundQrCode,
  scanReturnQrCode,
  submitOrderReview,
  submitOrderDispute,
  listMyDisputes,
  expireTimedOutOrders,
  normalizeOrder,
  normalizePayResult,
  normalizeDispute,
};
