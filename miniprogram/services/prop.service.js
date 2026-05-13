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
    supplierName: item.supplierName || (item.supplierUserId ? `工厂 ${item.supplierUserId}` : "未绑定工厂"),
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

module.exports = {
  listProps,
  listWarehouseProps,
  listPendingFillProps,
  getPropById,
  getWarehousePropById,
  createProp,
  completePendingFill,
  updatePropStatus,
  normalizeProp,
};
