const { API_BASE_URL } = require("../config/env");
const { request } = require("./http");

function resolveQrCode(qrCodeId) {
  return request({ url: `/qrcodes/${encodeURIComponent(qrCodeId)}/resolve` });
}

function buildQrImageUrl(qrCodeId) {
  return `${API_BASE_URL}/qrcodes/${encodeURIComponent(qrCodeId)}/image`;
}

module.exports = {
  resolveQrCode,
  buildQrImageUrl,
};
