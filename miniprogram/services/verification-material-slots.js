// Preserve the meaning of each visible slot before building an upload command.
module.exports = function orderedMaterials(domain, photos) {
  const maximum = domain === "student" ? 3 : domain === "realname" ? 2 : 0;
  if (!maximum || !Array.isArray(photos) || !photos[0] || !photos[1] || photos.length > maximum)
    throw new Error(domain === "student" ? "请补齐学生证封面和信息页照片；补充页不能替代必填材料" : "请补齐身份证正面和反面照片");
  return domain === "student" && photos[2] ? [photos[0], photos[1], photos[2]] : [photos[0], photos[1]];
};
