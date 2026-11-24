const uploadBatch = require("./upload-batch");
const http = require("./http"),
  session = require("../session/storage"),
  shared = require("./verification");
const query = (q) =>
  Object.entries(q)
    .filter(([, v]) => v !== "" && v !== null && v !== undefined)
    .flatMap(([k, v]) =>
      (Array.isArray(v) ? v : [v]).map(
        (x) => encodeURIComponent(k) + "=" + encodeURIComponent(x),
      ),
    )
    .join("&");
const request = async (path, method = "GET", body, key) => {
  const changesBrowse =
    method === "POST" &&
    /^(me|admin)\/(factory-props|prop-instances|prop-reviews)(\/|$)/.test(path);
  try {
    const result = await http.request(
      "/api/" + path,
      method,
      false,
      body,
      key ? { "Idempotency-Key": key } : {},
    );
    if (changesBrowse) require("./prop-browser-store").invalidate();
    return result;
  } catch (error) {
    if (changesBrowse && error.outcome !== "business-rejection")
      require("./prop-browser-store").invalidate();
    throw error;
  }
};
const money = (n) => (n / 100).toFixed(2);
const names = {
  draft: "待完善",
  online: "已上架",
  offline: "已下架",
  disabled: "已停用",
  pending: "待审核",
  approved: "已通过",
  rejected: "未通过",
  cancelled: "已撤回",
  pending_label: "待贴标",
  idle: "空闲",
  locked: "已锁定",
  renting: "租赁中",
  repairing: "维修中",
  lost: "已丢失",
  scrapped: "已报废",
  retired: "已退库",
  increase: "增加",
  decrease: "减少",
  repair: "维修",
  abnormal_decrease: "异常扣减",
  create: "新增上架",
  up: "上架",
  down: "下架",
};
function card(raw) {
  const p = raw.prop || raw;
  return {
    ...p,
    factory: { id: p.factory.id, name: p.factory.name },
    id: p.skuId,
    name: p.propName,
    styles: p.styles.map((s) => s.label),
    category: p.type.label,
    price: money(p.dailyRentPriceFen),
    availability: raw.availability || null,
  };
}
async function user() {
  const c = await require("./account").context();
  return c.userId;
}
function slotKey(uid, slot) {
  return "mj.prop.command." + uid + "." + slot;
}
async function command(slot, operation, path, body) {
  const owner = session.capture(),
    uid = await user();
  session.assertCurrent(owner);
  const storage = slotKey(uid, slot);
  let pending = wx.getStorageSync(storage);
  if (pending) {
    let found;
    try {
      found = await request(
        "me/prop-operations/by-request/" +
          pending.key +
          "?operation=" +
          pending.operation,
      );
    } catch (e) {
      if (e.reason !== "RESOURCE_NOT_FOUND") throw e;
    }
    session.assertCurrent(owner);
    if (found) {
      require("./prop-browser-store").invalidate();
      wx.removeStorageSync(storage);
      return found;
    }
    if (
      JSON.stringify(body) !== JSON.stringify(pending.body) ||
      path !== pending.path
    )
      throw new Error("原操作结果尚未确定，请先恢复原操作，勿修改后再次提交。");
  } else {
    pending = { operation, path, body, key: await shared.id() };
    session.assertCurrent(owner);
    wx.setStorageSync(storage, pending);
  }
  try {
    const result = await request(
      pending.path,
      "POST",
      pending.body,
      pending.key,
    );
    session.assertCurrent(owner);
    wx.removeStorageSync(storage);
    return result;
  } catch (e) {
    if (
      session.isCurrent(owner) &&
      e.outcome === "business-rejection" &&
      e.reason !== "IDEMPOTENCY_KEY_REUSED"
    )
      wx.removeStorageSync(storage);
    throw e;
  }
}
async function resume(slot) {
  const uid = await user(),
    p = wx.getStorageSync(slotKey(uid, slot));
  return p ? command(slot, p.operation, p.path, p.body) : null;
}
async function materialize(images) {
  const owner = session.capture(),
    out = images.map((x) => ({ ...x }));
  const jobs = [];
  out.forEach((image, index) => {
    if (!image.localPath) return;
    jobs.push(async () => {
      const uploadId = await shared.upload("prop", image.localPath, "prop_image");
      session.assertCurrent(owner);
      out[index] = { kind: "upload", uploadId };
    });
  });
  await uploadBatch(jobs);
  return out;
}
async function preview(locator) {
  const image = await request("me/prop-materials/view", "POST", locator);
  wx.previewImage({ urls: [image.url] });
}
module.exports = {
  request,
  query,
  money,
  names,
  card,
  command,
  resume,
  materialize,
  preview,
};
