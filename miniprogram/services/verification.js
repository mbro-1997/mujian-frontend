const { UploadError } = require("./form-error");
const http = require("./http"),
  session = require("../session/storage"),
  env = require("../config/environment");
function id() {
  return new Promise((resolve, reject) =>
    wx.getRandomValues({
      length: 16,
      success: (r) => {
        const b = new Uint8Array(r.randomValues);
        b[6] = (b[6] & 15) | 64;
        b[8] = (b[8] & 63) | 128;
        resolve(Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""));
      },
      fail: () => reject(new Error("无法生成提交编号，请重试")),
    }),
  );
}
function upload(domain, path, version, side) {
  const formData = ["factory", "prop"].includes(domain) ? { purpose: version } : {
    consentAccepted: "true", consentVersion: version, ...(side ? { side } : {}),
  };
  return uploadPrivate("/api/me/" + domain + "-materials", path, formData, "uploadId");
}
function uploadOrder(root, node, path) {
  return uploadPrivate(root + "/evidence/uploads", path, { node }, "receiptId");
}
function uploadPrivate(endpoint, path, formData, field, requestId) {
  const owner = session.capture();
  return new Promise((resolve, reject) => {
    if (!env.baseUrl) return reject(new UploadError("尚未配置上传服务地址"));
    wx.uploadFile({
      url: env.baseUrl + endpoint,
      filePath: path,
      name: "file",
      header: { Authorization: "Bearer " + owner.token, ...(requestId ? {"Idempotency-Key": requestId} : {}) },
      formData,
      timeout: 20000,
      success: (r) => {
        if (!session.isCurrent(owner))
          return reject(new session.StaleSessionError());
        try {
          const n = JSON.parse(r.data);
          if (r.statusCode !== 200 || n.code !== "OK") {
            let message = "材料上传失败，请检查文件后重试";
            if (n.reasonCode === "OBJECT_STORAGE_UNAVAILABLE") {
              message = "文件存储暂不可用，请稍后重试";
            } else if (endpoint === "/api/me/prop-materials" &&
                (r.statusCode === 413 || n.reasonCode === "MATERIAL_TOO_LARGE")) {
              message = "道具照片须不超过 5 MiB、2000 万像素，请压缩或重新选择";
            }
            return reject(new UploadError(message, r.statusCode, n.reasonCode, n.traceId));
          }
          if (!n.data || !/^[0-9a-f]{32}$/.test(n.data[field]) ||
              (requestId && !require("./response-contract").accepts(endpoint, "POST", 200, n))) {
            return reject(new UploadError("上传结果未确认，请重试", r.statusCode, null, n.traceId));
          }
          resolve(requestId ? n.data : n.data[field]);
        } catch {
          reject(new UploadError("上传结果未确认，请重试", r.statusCode));
        }
      },
      fail: () =>
        reject(
          session.isCurrent(owner)
            ? new UploadError("上传结果未确认，请稍后重试")
            : new session.StaleSessionError(),
        ),
    });
  });
}
const path = (d) => "/api/me/" + d + "-verifications";
function pendingKey(d, user) {
  return "mj.pending." + user + "." + d;
}
module.exports = {
  id,
  upload,
  uploadOrder,
  uploadPrivate,
  current: (d) => http.request(path(d) + "/current"),
  submit: (d, b, key) =>
    http.request(path(d), "POST", false, b, { "Idempotency-Key": key }),
  recover: (d, key) => http.request(path(d) + "/by-request/" + key),
  remember: (d, u, key) => wx.setStorageSync(pendingKey(d, u), key),
  pending: (d, u) => wx.getStorageSync(pendingKey(d, u)) || "",
  forget: (d, u) => wx.removeStorageSync(pendingKey(d, u)),
};
