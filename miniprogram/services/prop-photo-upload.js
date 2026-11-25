const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;

function fileSize(path) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().stat({
      path,
      success: ({ stats }) => resolve(stats.size),
      fail: reject,
    });
  });
}

function imageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src, success: resolve, fail: reject });
  });
}

function compress(src, info, target, quality) {
  // 微信读取 EXIF 旋转后压缩，按实际展示方向约束长边，保留原比例。
  const sideways = /^(left|right)(-mirrored)?$/.test(info.orientation || "");
  const width = sideways ? info.height : info.width;
  const height = sideways ? info.width : info.height;
  const limit = Math.min(target, Math.max(width, height));
  const dimension = width >= height ? { compressedWidth: limit } : { compressedHeight: limit };
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src,
      quality,
      ...dimension,
      success: ({ tempFilePath }) => resolve(tempFilePath),
      fail: reject,
    });
  });
}

/** 保留符合上传限制的原图，只压缩超限的本地道具照片。 */
async function preparePropPhoto(path, position) {
  const label = "第 " + position + " 张图片";
  let bytes, info;
  try {
    [bytes, info] = await Promise.all([fileSize(path), imageInfo(path)]);
  } catch {
    throw Error(label + "无法读取，请重新选择");
  }
  if (bytes <= MAX_BYTES && info.width * info.height <= MAX_PIXELS) return path;

  for (const [target, quality] of [[2048, 75], [1280, 60]]) {
    try {
      const candidate = await compress(path, info, target, quality);
      const [size, result] = await Promise.all([fileSize(candidate), imageInfo(candidate)]);
      if (size > 0 && size <= MAX_BYTES && result.width * result.height <= MAX_PIXELS)
        return candidate;
    } catch {
      // 部分客户端或图片格式无法压缩，提示用户重选。
      break;
    }
  }
  throw Error(label + "压缩后仍不符合限制，请选择不超过 5 MiB、2000 万像素的照片");
}

module.exports = { preparePropPhoto };
