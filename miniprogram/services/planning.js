const http = require("./http"),
  session = require("../session/storage"),
  images = require("./public-images");
const revision = { value: 0, addresses: 0 };
function changed(path) {
  revision.value++;
  if (/^\/api\/me\/addresses(?:\/|$)/.test(path)) revision.addresses++;
}
const priceModes = new Map();
const pending = new Map(),
  localFiles = new Map();
let pdfFileSequence = 0;
const labels = {
  editing: "编辑中",
  archived: "已归档",
  selecting: "选品中",
  suspended: "已挂起",
  checkout_processing: "支付处理中",
  converted_to_order: "已转订单",
};
const reasons = {
  TRADING_NOT_ENABLED: "交易入口尚未开放",
  CHECKLIST_NOT_CURRENT: "请先切换为当前清单",
  CHECKLIST_EMPTY: "请先选择道具",
  RENTAL_WINDOW_NOT_OPEN: "尚未进入租期前14天下单窗口，可继续选品",
  RENTAL_WINDOW_CLOSED: "已超过使用日前2天11:00的下单截止",
  CHECKLIST_ITEMS_UNAVAILABLE: "部分道具不可租，请调整数量或移除",
};
function money(value) {
  return (Number(value) / 100).toFixed(2);
}
function get(path, anonymous = false) {
  return http.request(path, "GET", !anonymous, undefined, {}, { anonymous });
}
function summary(row) {
  return {
    ...row,
    description: row.description || "",
    updatedDate: (row.updatedAt || " ").slice(0, 10),
    statusLabel: labels[row.status],
    daily: money(row.estimatedDailyRentFen),
    deposit: money(row.estimatedDepositFen),
  };
}
function display(item) {
  return {
    ...item,
    remark: item.remark || "",
    stylesText: (item.display.styleLabels || []).join(" / "),
    display: { ...item.display, image: images.accept(item.display.image) },
    rent: item.display.prices
      ? money(item.display.prices.dailyRentPriceFen)
      : "",
    deposit: item.display.prices
      ? money(item.display.prices.depositAmountFen)
      : "",
  };
}
async function uuid() {
  return new Promise((resolve, reject) =>
    wx.getRandomValues({
      length: 16,
      success: (r) => {
        const b = new Uint8Array(r.randomValues);
        b[6] = (b[6] & 15) | 64;
        b[8] = (b[8] & 63) | 128;
        const h = Array.from(b, (v) => v.toString(16).padStart(2, "0")).join(
          "",
        );
        resolve(
          h.slice(0, 8) +
            "-" +
            h.slice(8, 12) +
            "-" +
            h.slice(12, 16) +
            "-" +
            h.slice(16, 20) +
            "-" +
            h.slice(20),
        );
      },
      fail: () => reject(new Error("安全请求编号暂不可用，请重试")),
    }),
  );
}
// 相同未确认意图保留原键；内容变化时先恢复，禁止静默换键重写。
async function command(slot, path, body) {
  const owner = session.capture(),
    fingerprint = JSON.stringify({ path, body });
  let intent = pending.get(slot);
  if (intent && intent.fingerprint !== fingerprint)
    throw new Error("上次操作结果尚未确认，请先查询原操作后再更改内容。");
  if (!intent) {
    intent = { requestId: await uuid(), fingerprint, path, body };
    session.assertCurrent(owner);
    pending.set(slot, intent);
  }
  try {
    const result = await http.request(
      path,
      "POST",
      false,
      body,
      { "Idempotency-Key": intent.requestId },
    );
    session.assertCurrent(owner);
    if (pending.get(slot) === intent) pending.delete(slot);
    changed(path);
    return result;
  } catch (error) {
    if (!session.isCurrent(owner)) throw error;
    if (error.outcome === "unknown" || !error.outcome) {
      // A share receipt alone cannot restore its link. Replay the identical POST.
      if (path.endsWith("/share")) throw error;
      try {
        const receipt = await get(
          "/api/me/planning-operations/by-request/" + intent.requestId,
        );
        session.assertCurrent(owner);
        if (pending.get(slot) === intent) pending.delete(slot);
        changed(path);
        return receipt;
      } catch (recovery) {
        if (recovery.reason !== "RESOURCE_NOT_FOUND") error.recovery = recovery;
      }
    } else if (pending.get(slot) === intent) pending.delete(slot);
    throw error;
  }
}
async function recover(slot) {
  const owner = session.capture(),
    intent = pending.get(slot);
  if (!intent) return null;
  if (intent.path.endsWith("/exports")) { pending.delete(slot); return null; }
  if (intent.path.endsWith("/share")) throw new Error("请再次点击分享以恢复本次链接。");
  const receipt = await get(
    "/api/me/planning-operations/by-request/" + intent.requestId,
  );
  session.assertCurrent(owner);
  if (pending.get(slot) === intent) pending.delete(slot);
  changed(intent.path);
  return receipt;
}
// 恢复锚点跨页面保留在公共服务，按本人资源定位原操作。
async function recoverNext(pathPrefix, skuId) {
  for (const [slot, intent] of pending)
    if (
      intent.path.startsWith(pathPrefix) &&
      (!skuId || intent.body.skuId === skuId)
    )
      return recover(slot);
  return null;
}
function exportPdf(id, hidePrice) {
  return http.request("/api/me/schemes/" + id + "/exports", "POST", false,
    { hidePrice }, {}, { pdf: true });
}
// 打开操作的归属由公共页面流程提供；写文件完成后必须再次核验。
async function openPdf(result, operation) {
  if (!operation.isCurrent()) return;
  const filePath = wx.env.USER_DATA_PATH + "/scheme-" + result.exportId +
    "-" + Date.now() + "-" + (++pdfFileSequence) + ".pdf";
  localFiles.set(filePath, {pageKey: operation.pageKey, opened: false});
  try {
    await new Promise((resolve, reject) =>
      wx.getFileSystemManager().writeFile({
        filePath,
        data: result.buffer,
        success: resolve,
        fail: reject,
      }),
    );
    if (!operation.isCurrent()) {
      removePdfFile(filePath);
      return;
    }
    // 从此刻开始文档已交给原生预览；onHide不再撤销正常预览，onShow负责清理。
    localFiles.set(filePath, {pageKey: operation.pageKey, opened: true});
    await new Promise((resolve, reject) =>
      wx.openDocument({
        filePath,
        fileType: "pdf",
        showMenu: true,
        success: resolve,
        fail: reject,
      }),
    );
  } catch (error) {
    removePdfFile(filePath);
    throw error;
  }
}
// 每个操作有独立文件名，旧回调只删除自己所属文件。
function removePdfFile(filePath) {
  try { wx.getFileSystemManager().unlink({filePath}); } catch (_) {}
  localFiles.delete(filePath);
}
function cleanupPdf(pageKey) {
  for (const [filePath, file] of localFiles)
    if (!pageKey || (file.pageKey === pageKey && file.opened)) removePdfFile(filePath);
}
function clear() {
  priceModes.clear();
  pending.clear();
  revision.value++;
  revision.addresses++;
  cleanupPdf();
}
session.subscribe(clear);
function denied(error) {
  return [401, 403, 404].includes(error.status);
}
function extract(result) {
  return (result.items || (result.groups || []).flatMap((g) => g.items))
    .map((i) => i.display.image)
    .filter(Boolean);
}
module.exports = {
  uuid,
  get,
  command: require("./original-command")(command, (slot, path, body = {}) =>
    ({ slot, fingerprint: JSON.stringify([path, body]) })),
  recover,
  recoverNext,
  exportPdf,
  priceModes,
  openPdf,
  cleanupPdf,
  summary,
  display,
  money,
  revision,
  labels,
  reasons,
  denied,
  extract,
  pending,
};
