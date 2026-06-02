const { API_BASE_URL } = require("../config/env");
const { KEYS, getItem } = require("../store/local-db");

const IMAGE_BIZ_TYPES = new Set(["prop", "factory-license", "dispute", "order-evidence", "avatar"]);

function toAbsoluteFileUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const origin = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
}

function isPersistedImageUrl(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url) || /^\/api\/files\/images\//i.test(url) || /^\/uploads\//i.test(url);
}

function isLocalTempPath(url) {
  if (!url) return false;
  return /^(wxfile|file|blob):\/\//i.test(url)
    || /^https?:\/\/tmp\//i.test(url)
    || /^\/tmp\//i.test(url)
    || /tempfilepath/i.test(url);
}

async function uploadImage(filePath, bizType) {
  if (!filePath) {
    throw new Error("请选择图片");
  }
  if (!IMAGE_BIZ_TYPES.has(bizType)) {
    throw new Error("图片业务类型不合法");
  }
  if (isPersistedImageUrl(filePath) && !isLocalTempPath(filePath)) {
    return filePath;
  }
  return new Promise((resolve, reject) => {
    const token = getItem(KEYS.AUTH_TOKEN, "");
    wx.uploadFile({
      url: `${API_BASE_URL}/files/images`,
      filePath,
      name: "file",
      formData: { bizType },
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(res) {
        let payload = {};
        try {
          payload = JSON.parse(res.data || "{}");
        } catch (err) {
          reject(new Error("上传响应解析失败"));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && payload.code === 0) {
          resolve(toAbsoluteFileUrl(payload.data && payload.data.url));
          return;
        }
        reject(new Error(payload.message || `上传失败(${res.statusCode})`));
      },
      fail(err) {
        reject(new Error(err.errMsg || "图片上传失败"));
      },
    });
  });
}

module.exports = {
  uploadImage,
  toAbsoluteFileUrl,
  isPersistedImageUrl,
  isLocalTempPath,
};
