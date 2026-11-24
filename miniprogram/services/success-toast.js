// 微信原生反馈浮层，显示期间页面仍可操作。跨页操作在导航成功后提示。
module.exports = function successToast(title) {
  wx.showToast({ title, icon: "success", duration: 1600, mask: false });
};
