// 浏览链路统一参数；页面触底距离由app.json窗口配置提供。
module.exports = Object.freeze({
  freshMs: 3 * 60 * 1000,
  pageSize: 20,
  capacity: 120,
  imageCapacity: 300,
  maxCacheBytes: 4 * 1024 * 1024,
  imageMargin: 300,
});
