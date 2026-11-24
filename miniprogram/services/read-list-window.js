// Re-read the pages already visible without publishing a partial list during return.
module.exports = async function readListWindow(first, last, read, current, keyOf = row => row.id) {
  const items = [], seen = new Set();
  let total = '0', page = first, exhausted = false;
  for (let n = first; n <= last; n++) {
    const result = await read(n);
    if (!current()) return null;
    page = n;
    total = result.total;
    const before = items.length;
    for (const row of result.items) {
      const key = keyOf(row);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(row);
    }
    exhausted = items.length === before || (first === 1 && items.length >= Number(total));
    if (exhausted) break;
  }
  return { items, page, total, exhausted };
};
