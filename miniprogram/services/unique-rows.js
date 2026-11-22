// 只返回本批新增记录，保留服务端顺序。
module.exports = function uniqueRows(incoming, previous) {
  const seen = new Set(previous.map(row => row.id));
  return incoming.filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
};
