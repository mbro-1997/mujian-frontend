const { API_BASE_URL, REQUEST_TIMEOUT } = require("../config/env");
const { KEYS, getItem } = require("../store/local-db");

function request({ url, method = "GET", data, timeout = REQUEST_TIMEOUT }) {
  return new Promise((resolve, reject) => {
    const token = getItem(KEYS.AUTH_TOKEN, "");

    wx.request({
      url: `${API_BASE_URL}${url}`,
      method,
      data,
      timeout,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(res) {
        const payload = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && payload.code === 0) {
          resolve(payload.data);
          return;
        }
        const message = payload.message || `请求失败(${res.statusCode})`;
        const error = new Error(message);
        error.response = res;
        reject(error);
      },
      fail(err) {
        const error = new Error(err.errMsg || "网络请求失败");
        error.cause = err;
        reject(error);
      },
    });
  });
}

module.exports = {
  request,
};
