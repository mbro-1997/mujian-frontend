const { PROP_STATUS, getPropStatusText, getPropStatusClass } = require("../constants/status");
const { request } = require("./http");

function normalizeProp(item) {
  if (!item) return null;
  const images = Array.isArray(item.images) && item.images.length
    ? item.images
    : String(item.imageUrl || item.image || "/images/stage-prop-real.jpg")
      .split(/[,;\n]/)
      .map((url) => url.trim())
      .filter(Boolean);
  return {
    id: Number(item.id),
    name: item.name || "",
    image: images[0] || "/images/stage-prop-real.jpg",
    imageUrl: images[0] || "/images/stage-prop-real.jpg",
    images,
    style: item.style || "通用",
    type: item.type || "道具",
    size: item.size || "",
    lengthCm: item.lengthCm || null,
    widthCm: item.widthCm || null,
    heightCm: item.heightCm || null,
    material: item.material || "",
    price: Number(item.price || 0),
    deposit: Number(item.deposit || 0),
    fireResistantOption: item.fireResistantOption || "",
    weight: item.weight || "",
    transportSuggestion: item.transportSuggestion || "",
    vehicle: item.transportSuggestion || "",
    status: item.status || PROP_STATUS.IDLE,
    statusText: item.statusText || getPropStatusText(item.status),
    statusClass: item.auditStatus === "pending"
      ? "status-pending"
      : item.auditStatus === "rejected"
        ? "status-renting"
        : getPropStatusClass(item.status || PROP_STATUS.IDLE),
    auditStatus: item.auditStatus || "",
    auditStatusText: item.auditStatusText || "",
    qrCodeId: item.qrCodeId || "",
    qrCodeUrl: item.qrCodeUrl || "",
    fillStatus: item.fillStatus || "filled",
    supplierUserId: item.supplierUserId || null,
    quantity: Number(item.quantity || 1),
    assetTotalStock: Number(item.assetTotalStock || item.totalStock || 0),
    totalStock: Number(item.totalStock || 0),
    availableStock: Number(item.availableStock || 0),
    lockedStock: Number(item.lockedStock || 0),
    rentedStock: Number(item.rentedStock || 0),
    repairingStock: Number(item.repairingStock || 0),
    lostStock: Number(item.lostStock || 0),
    scrappedStock: Number(item.scrappedStock || 0),
    canRent: !!item.canRent,
    supplierName: item.supplierName || (item.supplierUserId ? `工厂 ${item.supplierUserId}` : "未绑定工厂"),
  };
}

function normalizePropInstance(item = {}) {
  return {
    id: Number(item.id),
    propId: Number(item.propId),
    instanceNo: item.instanceNo || "",
    qrCodeId: item.qrCodeId || "",
    instanceStatus: item.instanceStatus || "",
    instanceStatusText: item.instanceStatusText || item.instanceStatus || "",
    currentOrderId: item.currentOrderId || null,
    currentOrderNo: item.currentOrderNo || "",
    statusRemark: item.statusRemark || "",
    statusChangedAt: item.statusChangedAt || "",
    statusChangedBy: item.statusChangedBy || null,
    canMarkRepairing: !!item.canMarkRepairing,
    canMarkLost: !!item.canMarkLost,
    canMarkScrapped: !!item.canMarkScrapped,
    canRestoreIdle: !!item.canRestoreIdle,
    canScrapFromRepairing: !!item.canScrapFromRepairing,
  };
}

function normalizePropInstanceStatusLog(item = {}) {
  return {
    id: Number(item.id),
    propInstanceId: Number(item.propInstanceId),
    propId: Number(item.propId),
    instanceNo: item.instanceNo || "",
    qrCodeId: item.qrCodeId || "",
    fromStatus: item.fromStatus || "",
    fromStatusText: item.fromStatusText || item.fromStatus || "",
    toStatus: item.toStatus || "",
    toStatusText: item.toStatusText || item.toStatus || "",
    reason: item.reason || "",
    operatorUserId: item.operatorUserId || null,
    operatorRole: item.operatorRole || "",
    relatedOrderId: item.relatedOrderId || null,
    createdAt: item.createdAt || "",
  };
}

async function listProps(query = {}) {
  const params = [];
  Object.keys(query).forEach((key) => {
    const value = query[key];
    if (value === undefined || value === null || value === "") return;
    params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  });
  const suffix = params.length ? `?${params.join("&")}` : "";
  const data = await request({ url: `/props${suffix}` });
  return (data || []).map(normalizeProp);
}

async function listWarehouseProps() {
  const data = await request({ url: "/props/warehouse/list" });
  return (data || []).map(normalizeProp);
}

async function listPendingFillProps() {
  const data = await request({ url: "/props/pending-fill/list" });
  return (data || []).map(normalizeProp);
}

async function getPropById(id) {
  const data = await request({ url: `/props/${id}` });
  return normalizeProp(data);
}

async function getWarehousePropById(id) {
  const data = await request({ url: `/props/${id}/warehouse-detail` });
  return normalizeProp(data);
}

async function createProp(payload) {
  const data = await request({
    url: "/props",
    method: "POST",
    data: {
      name: payload.name,
      image: payload.image,
      imageUrl: payload.imageUrl,
      images: payload.images || [],
      style: payload.style,
      type: payload.type,
      size: payload.size,
      lengthCm: payload.lengthCm,
      widthCm: payload.widthCm,
      heightCm: payload.heightCm,
      material: payload.material,
      price: Number(payload.price || 0),
      deposit: Number(payload.deposit || 0),
      fireResistantOption: payload.fireResistantOption,
      weight: payload.weight,
      transportSuggestion: payload.transportSuggestion,
      qrCodeId: payload.qrCodeId || "",
    },
  });
  return normalizeProp(data);
}

async function completePendingFill(id, payload) {
  const data = await request({
    url: `/props/${id}/complete-fill`,
    method: "POST",
    data: {
      name: payload.name,
      image: payload.image,
      imageUrl: payload.imageUrl,
      images: payload.images || [],
      style: payload.style,
      type: payload.type,
      size: payload.size,
      lengthCm: payload.lengthCm,
      widthCm: payload.widthCm,
      heightCm: payload.heightCm,
      material: payload.material,
      price: Number(payload.price || 0),
      deposit: Number(payload.deposit || 0),
      fireResistantOption: payload.fireResistantOption,
      weight: payload.weight,
      transportSuggestion: payload.transportSuggestion,
      qrCodeId: payload.qrCodeId || "",
    },
  });
  return normalizeProp(data);
}

async function updatePropStatus(id, status) {
  const data = await request({
    url: `/props/${id}/status`,
    method: "POST",
    data: { targetStatus: status },
  });
  return normalizeProp(data);
}

async function listPropInstances(propId) {
  const data = await request({ url: `/factory/props/${propId}/instances` });
  return (data || []).map(normalizePropInstance);
}

async function updatePropInstanceStatus(instanceId, targetStatus, reason) {
  const data = await request({
    url: `/factory/prop-instances/${instanceId}/status`,
    method: "POST",
    data: { targetStatus, reason },
  });
  return normalizePropInstance(data);
}

async function listPropInstanceStatusLogs(instanceId) {
  const data = await request({ url: `/factory/prop-instances/${instanceId}/status-logs` });
  return (data || []).map(normalizePropInstanceStatusLog);
}

module.exports = {
  listProps,
  listWarehouseProps,
  listPendingFillProps,
  getPropById,
  getWarehousePropById,
  createProp,
  completePendingFill,
  updatePropStatus,
  listPropInstances,
  updatePropInstanceStatus,
  listPropInstanceStatusLogs,
  normalizeProp,
  normalizePropInstance,
  normalizePropInstanceStatusLog,
};
