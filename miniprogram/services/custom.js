const { displayTime } = require("./display-time");
const session = require("../session/storage");
const http = require("./http");
const { uuid, money } = require("./planning");
const { uploadPrivate } = require("./verification");
const nav = require("../navigation/state");
const pendingKey = "mj.custom.pending";
const dirty = new Map();
const revisions = new Map();
function pending() {
  return wx.getStorageSync(pendingKey) || {};
}
const cacheKey = "mj.custom.order.draft";
session.subscribe(() => {
  dirty.clear();
  revisions.clear();
  wx.removeStorageSync(cacheKey);
  wx.removeStorageSync(pendingKey);
});
function root(factory, kind, id) {
  return (
    (factory ? "/api/me/factory" : "/api") +
    "/custom-" +
    kind +
    (id ? "/" + id : "")
  );
}
async function apply(path, body) {
  const owner = session.capture(),
    slot = nav.identity() + ":" + path,
    fingerprint = JSON.stringify(body);
  let intent = pending()[slot];
  if (intent && intent.fingerprint !== fingerprint) {
    const receipt = await http
      .request("/api/me/trading-operations/by-request/" + intent.id)
      .catch(() => null);
    session.assertCurrent(owner);
    if (receipt) {
      const all = pending();
      if (all[slot]?.id === intent.id) delete all[slot];
      wx.setStorageSync(pendingKey, all);
      const factory = path.startsWith("/api/me/factory/");
      const kind = path.includes("custom-requirements") ? "requirements" : "orders";
      mark(factory, kind, receipt.resourceId || path);
      if (receipt.orderId) mark(false, "orders", receipt.orderId);
      throw new Error("上次操作已完成，请刷新原记录后继续");
    }
    throw new Error("上次提交结果待核对，请按原内容重试");
  }
  if (!intent) {
    intent = { id: await uuid(), fingerprint };
    session.assertCurrent(owner);
    wx.setStorageSync(pendingKey, { ...pending(), [slot]: intent });
  }
  function forget() {
    const all = pending();
    if (all[slot]?.id === intent.id) {
      delete all[slot];
      wx.setStorageSync(pendingKey, all);
    }
  }
  try {
    const result = await http.request(path, "POST", false, body, {
      "Idempotency-Key": intent.id,
    });
    session.assertCurrent(owner);
    forget();
    return result;
  } catch (error) {
    if (session.isCurrent(owner) && error.outcome === "business-rejection")
      forget();
    throw error;
  }
}
function readDraft(order) {
  const all = wx.getStorageSync(cacheKey) || {};
  return all[nav.identity() + ":" + order] || {};
}
function writeDraft(order, form) {
  const all = wx.getStorageSync(cacheKey) || {},
    key = nav.identity() + ":" + order;
  if (form) all[key] = form;
  else delete all[key];
  wx.setStorageSync(cacheKey, all);
}
function mark(factory, kind, id) {
  const k = nav.identity() + root(factory, kind);
  revisions.set(k, (revisions.get(k) || 0) + 1);
  const changes = dirty.get(k) || new Map();
  changes.set(id, Symbol());
  dirty.set(k, changes);
}
// 快照只用于本次请求，完成时逐条确认仍是同一次变更。
function changed(factory, kind) {
  return new Map(dirty.get(nav.identity() + root(factory, kind)));
}
function acknowledge(factory, kind, snapshot) {
  const current = dirty.get(nav.identity() + root(factory, kind));
  if (!current) return;
  for (const [id, token] of snapshot) {
    if (current.get(id) === token) current.delete(id);
  }
}
async function attach(root, purpose) {
  const owner = session.capture();
  const files = await new Promise((resolve, reject) =>
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["jpg", "jpeg", "png", "pdf"],
      success: (r) => resolve(r.tempFiles),
      fail: reject,
    }),
  );
  const id = await uuid();
  session.assertCurrent(owner);
  return uploadPrivate(
    root + "/materials",
    files[0].path,
    { purpose },
    "materialId",
    id,
    { acceptPdf: true },
  );
}
async function preview(root, file) {
  const owner = session.capture();
  const { url } = await http.request(
    root + "/materials/" + file.materialId + "/view",
  );
  if (file.type === "image") return wx.previewImage({ urls: [url] });
  const response = await new Promise((resolve, reject) =>
    wx.downloadFile({ url, success: resolve, fail: reject }),
  );
  session.assertCurrent(owner);
  if (response.statusCode !== 200)
    throw new Error("附件读取失败，请刷新后重试");
  wx.openDocument({ filePath: response.tempFilePath, fileType: "pdf" });
}
const labels = {
  draft: "草稿",
  submitted: "已提交",
  factory_reviewing: "评估中",
  quoted: "已报价",
  user_revision_requested: "待修订",
  accepted: "已确认",
  converted: "已转单",
  factory_declined: "工厂已婉拒",
  withdrawn: "已撤回",
  pending_payment: "待支付",
  payment_closed: "支付关闭",
  paid_waiting_production: "已付待投产",
  producing: "生产中",
  ready_for_delivery: "待交付",
  delivering: "交付中",
  pending_acceptance: "待验收",
  completed: "已完成",
  user_cancelled: "买家已取消",
  after_sale: "售后中",
  cancelled: "已取消",
  intervention: "平台介入",
  published: "已发布",
  superseded: "历史版本",
  expired: "已过期",
  rejected: "已驳回",
  approved: "已批准",
  delivered: "已交付",
  awaiting_pickup_confirmation: "待买家确认自提",
  exception: "已返工",
  processing: "处理中",
  refund_processing: "退款处理中",
  waiting_factory: "待工厂处理",
  waiting_user: "待买家处理",
  resolved: "已解决",
  closed: "已关闭",
  pending: "待支付",
  paying: "支付处理中",
  success: "支付成功",
  failed: "支付失败",
  partial_received: "部分实收",
};
const states = {
  requirements: ['draft', 'submitted', 'factory_reviewing', 'quoted', 'user_revision_requested', 'accepted', 'converted', 'factory_declined', 'withdrawn'],
  orders: ['pending_payment', 'payment_closed', 'paid_waiting_production', 'producing', 'ready_for_delivery', 'delivering', 'pending_acceptance', 'completed', 'user_cancelled', 'after_sale', 'cancelled', 'intervention'],
};
function display(row) {
  return {
    ...row,
    updatedTime: displayTime(row.updatedAt),
    label: labels[row.state] || row.state,
    amount: row.totalFen === undefined ? "" : money(row.totalFen),
  };
}
module.exports = {
  mark,
  changed,
  acknowledge,
  revision: (factory, kind) => revisions.get(nav.identity() + root(factory, kind)) || 0,
  get: http.request,
  root,
  apply: require("./original-command")(apply, (path, body) =>
    ({ slot: nav.identity() + ":" + path, fingerprint: JSON.stringify(body) })),
  readDraft,
  writeDraft,
  attach,
  preview,
  labels,
  states,
  display,
  money,
};
