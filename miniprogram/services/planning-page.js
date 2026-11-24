const { ValidationError, hint } = require("./form-error");
const api = require("./planning"),
  session = require("../session/storage");
function dirty(page, value = true) {
  if (value && page.data.dirty) return;
  page.setData({ dirty: value });
  if (value && wx.enableAlertBeforeUnload)
    wx.enableAlertBeforeUnload({ message: "还有未保存的修改，确定离开吗？" });
  else if (!value && wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload();
}
// 只保留本页同一账号尚未保存的输入。等待确认期间也可能换号或失权。
async function prepareDraftRefresh(page, title, message, fields) {
  if (page.data.busy) return false;
  if (!page.data.dirty) return true;
  const owner = session.capture(), id = page.data.id;
  if (!(await confirm(title, message)) || !session.isCurrent(owner) ||
      page.data.id !== id || !page.data.dirty || page.data.busy) return false;
  const values = {};
  for (const field of fields) values[field] = page.data[field];
  page.savedDraft = { owner, id, values };
  page.setData({ canRestoreDraft: true });
  return true;
}
function clearDraft(page) {
  page.savedDraft = null;
  page.setData({ canRestoreDraft: false });
}
function takeDraft(page) {
  if (page.data.busy) return null;
  const draft = page.savedDraft;
  clearDraft(page);
  return draft && session.isCurrent(draft.owner) && draft.id === page.data.id ? draft.values : null;
}
async function run(page, action) {
  if (page.data.busy) return;
  const owner = session.capture();
  page.setData({ busy: true, message: "", pdfMessage: false });
  try {
    return await action();
  } catch (error) {
    if (!session.isCurrent(owner)) return;
    if (error instanceof ValidationError) return hint(error.message);
    if (api.denied(error)) {
      if (page.onPrivateAccessLost) page.onPrivateAccessLost();
      else page.setData({
        page: 0, total: "0",
        detail: null,
        items: [],
        name: "",
        description: "",
        receiverName: "",
        phone: "",
        regionText: "",
        detailAddress: "",
        dirty: false,
      });
    }
    page.setData({
      message: error.message,
      conflict: error.reason === "VERSION_CONFLICT",
    });
  } finally {
    page.setData({ busy: false });
  }
}
function confirm(title, content, options = {}) {
  return new Promise((resolve) =>
    wx.showModal({
      ...options,
      title,
      content,
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    }),
  );
}
async function exportPdf(page, id, hidePrice) {
  return run(page, async () => {
    const operation = beginPdf(page);
    page.setData({ exportingId: id, pdfMessage: true });
    try {
      const result = await api.exportPdf(id, hidePrice);
      if (operation.isCurrent()) await api.openPdf(result, operation);
    } finally {
      if (page.pdfOperation === operation) page.setData({ exportingId: "" });
    }
  });
}
// 同一页面的新操作、离页代次和会话共同决定异步结果能否打开文档。
function beginPdf(page) {
  const owner = session.capture(), epoch = page.pdfEpoch || 0;
  const operation = {
    pageKey: page.pdfPageKey || (page.pdfPageKey = {}),
    isCurrent: () => page.pdfOperation === operation &&
      (page.pdfEpoch || 0) === epoch && !page.pdfStopped && session.isCurrent(owner),
  };
  page.pdfOperation = operation;
  return operation;
}
// 返回页面只恢复可操作状态，旧代次不可因此复活；仅清理本页已打开的文件。
function pdfShown(page) {
  page.pdfStopped = false;
  if (page.pdfPageKey) api.cleanupPdf(page.pdfPageKey);
}
// 正常文档预览也会触发onHide，此时不删除正在被原生预览读取的文件。
function pdfHidden(page) {
  page.pdfStopped = true;
  page.pdfEpoch = (page.pdfEpoch || 0) + 1;
}
// 与道具页同样按20项分批提交setData，避免500项详情一次超过小程序包体。
function replaceItems(page, items, field = "items") {
  const previous = page.data[field] || [];
  if (items.length < previous.length) {
    // Shorten the array without briefly rendering an empty list.
    page.setData({ [field]: items.slice(0, 20) });
    appendItems(page, items.slice(20), field);
    return;
  }
  for (let start = 0; start < items.length; start += 20) {
    const update = {};
    items.slice(start, start + 20).forEach((item, offset) => {
      const index = start + offset;
      if (!previous[index] || JSON.stringify(item) !== JSON.stringify(previous[index]))
        update[field + "[" + index + "]"] = item;
    });
    if (Object.keys(update).length) page.setData(update);
  }
}
function appendItems(page, items, field = "items") {
  const base = page.data[field].length;
  for (let start = 0; start < items.length; start += 20) {
    const update = {};
    items.slice(start, start + 20).forEach((item, index) => {
      update[field + "[" + (base + start + index) + "]"] = item;
    });
    page.setData(update);
  }
}
function showList(page, rows, append, field = "items") {
  if (append) appendItems(page, rows.slice(page.data[field].length), field);
  else replaceItems(page, rows, field);
}
module.exports = {
  prepareDraftRefresh,
  clearDraft,
  takeDraft,
  showList,
  dirty,
  run,
  confirm,
  exportPdf,
  beginPdf,
  pdfShown,
  pdfHidden,
  replaceItems,
  appendItems,
};
