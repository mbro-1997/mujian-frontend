const api = require("./planning");
// 当前清单每次进入都核验，不使用道具三分钟缓存。
async function read(startDate, endDate) {
  const context = await api.get("/api/me/planning-context"),
    current = context.currentChecklist;
  if (
    !current ||
    current.status !== "selecting" ||
    current.startDate !== startDate ||
    current.endDate !== endDate
  )
    return { current: null, quantities: {} };
  const detail = await api.get("/api/me/checklists/" + current.id),
    quantities = {};
  for (const group of detail.groups)
    for (const item of group.items)
      quantities[item.display.skuId] = item.quantity;
  return { current: detail, quantities };
}
module.exports = { read };
