const { ValidationError } = require("./form-error");
// One journal per editable detail. The page never needs to diff its full draft.
const MAX = 2147483647;
const keyOf = row => row.id || 'new:' + row.display.skuId;
const infoOf = (name, description) => ({name: name.trim(), description: (description || '').trim() || null});
const valuesOf = (row, sortOrder) => ({quantity: Number(row.quantity), remark: (row.remark || '').trim() || null, sortOrder});

function baseline(detail, rows) {
  let info = infoOf(detail.name, detail.description);
  const originals = new Map(), pending = new Map();
  // Nominal position slots stay attached to positions on move, not to item IDs.
  const slots = rows.map((row, i) => {
    const slot = row.sortOrder ?? i;
    originals.set(keyOf(row), valuesOf(row, slot));
    return slot;
  });
  function orderOf(row) {
    const key = keyOf(row);
    return pending.get(key)?.sortOrder ?? originals.get(key)?.sortOrder;
  }
  function edit(row, order = orderOf(row)) {
    const key = keyOf(row), old = originals.get(key), v = valuesOf(row, order);
    if (old && old.quantity === v.quantity && old.remark === v.remark && old.sortOrder === order) pending.delete(key);
    else pending.set(key, row.id ? {action:'updateItem', itemId:row.id, ...v} : {action:'addItem', skuId:row.display.skuId, ...v});
  }
  return {
    get dirty() { return pending.size > 0; },
    edit,
    add(row) {
      const order = (slots[slots.length - 1] ?? -1) + 1;
      slots.push(order);
      edit(row, order);
    },
    remove(row, index) {
      slots.splice(index, 1);
      if (row.id) pending.set(keyOf(row), {action:'removeItem', itemId:row.id});
      else pending.delete(keyOf(row));
    },
    move(orderedRows, from, to) {
      let i = Math.min(from, to);
      // Equal sort slots are ordered by ID on the server. Propagate only as far
      // as the move changes a row's effective order, including a tied neighbour.
      for (; i < orderedRows.length; i++) {
        const row = orderedRows[i], prev = orderedRows[i - 1];
        let order = slots[i];
        if (prev) order = Math.max(order, orderOf(prev) + (!row.id || !prev.id || row.id <= prev.id ? 1 : 0));
        if (order === orderOf(row) && i > Math.max(from, to)) break;
        edit(row, order);
      }
    },
    editInfo(name, description) {
      const next = infoOf(name, description);
      if (next.name === info.name && next.description === info.description) pending.delete('info');
      else pending.set('info', {action:'updateSchemeInfo', ...next});
    },
    actions() {
      const result = Array.from(pending.values());
      for (const a of result) {
        if (a.action === 'updateSchemeInfo' && !a.name) throw new ValidationError('请填写方案名称。');
        if ('quantity' in a && (!Number.isSafeInteger(a.quantity) || a.quantity < 1 || a.quantity > MAX)) throw new ValidationError('数量须为有效正整数');
        if (a.sortOrder > MAX) throw new Error('道具顺序超出范围，请重新读取方案。');
      }
      return result;
    },
    commit() {
      for (const [key, a] of pending) {
        if (a.action === 'removeItem') originals.delete(key);
        else if (a.action === 'updateSchemeInfo') info = a;
        else originals.set(key, valuesOf(a, a.sortOrder));
      }
      pending.clear();
    },
  };
}
module.exports = { baseline };
