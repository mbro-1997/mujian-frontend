const compressFrom = 1024 * 1024;
const maxBytes = 5 * 1024 * 1024;
const maxPixels = 20_000_000;

/** 按浏览器解码后的方向等比缩放，与小程序使用相同长边、质量和上传上限。 */
export async function prepareUploadImage(file: File): Promise<File> {
  if (!["image/png", "image/jpeg"].includes(file.type)) throw Error("请选择 JPEG 或 PNG 图片");
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url;
    await image.decode();
    const width = image.naturalWidth, height = image.naturalHeight;
    if (file.size < compressFrom) {
      if (width * height > maxPixels) throw Error("图片超过 2000 万像素，请重新选择");
      return file;
    }
    for (const [target, quality] of [[2048, 0.75], [1280, 0.60]]) {
      const scale = Math.min(1, target / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw Error("无法处理图片，请重新选择");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size > 0 && blob.size <= maxBytes) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {type: blob.type});
      }
    }
    throw Error("图片压缩后仍超过 5 MiB，请重新选择");
  } finally {
    URL.revokeObjectURL(url);
  }
}
