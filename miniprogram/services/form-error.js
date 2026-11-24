// 上传失败由触发操作的页面显示轻提示；完整追踪号保留在错误对象中。
class UploadError extends Error {
  constructor(message, status, reason, traceId) {
    super(message + (traceId ? "（追踪号 " + traceId.slice(0, 8) + "）" : ""));
    Object.assign(this, { status, reason, traceId });
  }
}
class ValidationError extends Error {}
function hint(title) {
  wx.showToast({ title, icon: "none", mask: false, duration: 2200 });
}
function showFormError(page, error) {
  if (error instanceof ValidationError) hint(error.message);
  else page.setData({ message: error.message });
}
module.exports = { ValidationError, UploadError, hint, showFormError };
