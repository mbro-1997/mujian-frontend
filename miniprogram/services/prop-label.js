// 输出像素独立于手机屏宽，长 SKU 和 SN 完整换行，便于打印后核对。
const WIDTH = 1200;
const INK = "#111827";
function lines(ctx, text, width) {
  const result = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = "";
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > width) {
        result.push(line);
        line = "";
      }
      line += char;
    }
    result.push(line);
  }
  return result;
}

function labelData(qr, sku) {
  if (!sku || !qr?.skuCode || !["SN", "SKU"].includes(qr.targetType) ||
      (qr.targetType === "SN" && !qr.snCode)) return null;
  const fields = sku.fields || {};
  return {
    name: fields.propName || qr.propName || "—",
    material: fields.materialDesc || "—",
    code: qr.skuCode,
    serial: qr.targetType === "SN" ? qr.snCode : "",
    factory: sku.factoryName || "—",
    remark: fields.remark || "",
  };
}

function draw(canvas, code, data) {
  const ctx = canvas.getContext("2d");
  const left = 408, right = WIDTH - 60;
  const rows = [
    ["", data.name, 44], ["材质", data.material, 32], ["SKU", data.code, 32],
    ...(data.serial ? [["序列号", data.serial, 32]] : []),
    ["工厂", data.factory, 32], ["备注", data.remark, 32],
  ];
  let y = 48;
  const layout = rows.map(([label, value, size]) => {
    const font = (label ? "500 " : "bold ") + size + "px sans-serif";
    ctx.font = font;
    const x = left + (label ? 130 : 0);
    const wrapped = lines(ctx, value, right - x);
    const top = y;
    y += wrapped.length * (size + 10) + 8;
    return { label, value, font, x, wrapped, top, size };
  });
  canvas.width = WIDTH;
  canvas.height = Math.max(468, y + 40);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, canvas.height);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(12, 12, WIDTH - 24, canvas.height - 24);
  ctx.setLineDash([]);
  const cy = (canvas.height - 350) / 2;
  // 原图整体绘制，保留小程序码的边缘和空白区。
  const scale = 278 / Math.max(code.width, code.height);
  const w = code.width * scale, h = code.height * scale;
  ctx.drawImage(code, 207 - w / 2, cy + (278 - h) / 2, w, h);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(123, cy + 323, 27, Math.PI / 2, 3 * Math.PI / 2);
  ctx.arc(291, cy + 323, 27, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffe035";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(data.serial ? "A类 / SN" : "B类 / SKU", 207, cy + 323);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = INK;
  for (const {label, value, font, x, wrapped, top, size} of layout) {
    ctx.font = font;
    if (label) ctx.fillText(label + "：", left, top);
    wrapped.forEach((line, i) => ctx.fillText(line, x, top + i * (size + 10)));
    if (label === "备注" && !value) ctx.fillRect(x, top + size - 3, 260, 2);
  }
}

async function render(page, path, data) {
  const canvas = await new Promise((resolve, reject) =>
    page.createSelectorQuery().select("#label-canvas").node(res => res?.node
      ? resolve(res.node) : reject(Error("无法绘制标签，请重新打开页面"))).exec());
  const image = canvas.createImage();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(Error("标签原码读取失败，请刷新后重试"));
    image.src = path;
  });
  draw(canvas, image, data);
  return new Promise((resolve, reject) => wx.canvasToTempFilePath({
    canvas, width: canvas.width, height: canvas.height, destWidth: canvas.width,
    destHeight: canvas.height, fileType: "png",
    success: res => resolve(res.tempFilePath),
    fail: () => reject(Error("标签图片生成失败，请重试")),
  }, page));
}
async function saveToAlbum(filePath, current) {
  const settings = await new Promise((resolve, reject) => wx.getSetting({
    success: resolve, fail: () => reject(Error("无法读取相册权限，请重试")),
  }));
  if (!current()) return;
  if (settings.authSetting?.["scope.writePhotosAlbum"] === false) throw Error("请在微信设置中开启相册权限");
  await new Promise((resolve, reject) => wx.saveImageToPhotosAlbum({
    filePath, success: resolve,
    fail: e => reject(Error(/auth|permission|privacy|denied|deny|授权|隐私|拒绝/i.test(e.errMsg || "")
      ? "未保存图片，请检查相册权限" : "未能保存图片，请稍后重试")),
  }));
}
module.exports = { labelData, draw, render, saveToAlbum };
