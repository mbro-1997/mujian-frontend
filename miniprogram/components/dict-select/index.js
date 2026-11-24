// Present the same dropdown for dictionary-backed fields, preserving picker's index-based change event.
Component({
  properties: {
    range: Array, rangeKey: String, value: { type: Number, value: -1 },
    title: String, display: String, disabled: Boolean, quiet: Boolean,
  },
  data: { groups: [], selection: { index: -1 } },
  observers: {
    "range,rangeKey,value,title,display"(range, key, index, title, display) {
      const options = (range || []).map((entry, code) => ({
        code, label: String(key ? entry[key] : entry),
        disabled: entry?.enabled === false,
      }));
      const selected = options[index];
      // An unselected required field may have a native picker index of 0.
      const chosen = selected && (!display || selected.label === display) ? index : -1;
      this.setData({ groups: [{ key: "index", title, display, options }], selection: { index: chosen } });
    },
  },
  methods: {
    select(event) {
      if (!this.data.disabled) this.triggerEvent("change", { value: event.detail.value });
    },
  },
});
