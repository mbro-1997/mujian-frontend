// 已保存的合法旧入口转到相应道具，并在道具页打开同一选择器。
require("../../session/page")({
  onLoad({ skuId }) {
    wx.redirectTo({ url: "/pages/props/product?id=" + encodeURIComponent(skuId) + "&picker=scheme" });
  },
});
