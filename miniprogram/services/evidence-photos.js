const api = require("./trading");

module.exports = function evidencePhotos(orderPath, rows) {
  return Promise.all(rows.map(async row => {
    try {
      const { url } = await api.post(orderPath + "/evidence/" + row.id + "/view");
      return { ...row, url };
    } catch (error) {
      if ([401, 403, 404].includes(error.status)) throw error;
      return { ...row, url: "" };
    }
  }));
};
