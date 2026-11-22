// Native checkbox event arrays must not be passed directly into setData.
// Rebuild an ordinary page-owned array from the current available choices.
module.exports = function checkboxSelection(options, values, key = "id") {
  const allowed = new Set(options.map((option) => option[key]));
  const picked = new Set(Array.isArray(values) ? values : []);
  const ids = Array.from(allowed).filter((id) => picked.has(id));
  return {
    ids,
    allSelected: allowed.size > 0 && ids.length === allowed.size,
  };
};
