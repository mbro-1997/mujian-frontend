Component({
  options: { multipleSlots: true },
  properties: {
    filters: Array, values: Object, keyword: String, placeholder: String, disabled: Boolean, stacked: Boolean, quiet: Boolean, fieldMode: Boolean, resettable: Boolean, inlineReset: Boolean,
    trailingSelector: Boolean,
    maxlength: { type: Number, value: 128 },
  },
  data: { labels: [], open: -1, above: false, panelHeight: 0 },
  observers: {
    "filters,values"(filters, values) {
      if (!filters || !values) return;
      this.setData({ labels: filters.map(group => group.display || group.options.find(option =>
        option.code === values[group.key])?.label || group.title) });
    },
  },
  pageLifetimes: { hide() { this.close(); } },
  methods: {
    toggle(e) {
      const i = Number(e.currentTarget.dataset.index);
      if (this.data.disabled || !this.data.filters[i]?.options.length) return;
      if (this.data.open === i) return this.close();
      const visit = this.menuVisit = {};
      this.createSelectorQuery().select(".selectors").boundingClientRect(rect => {
        if (visit !== this.menuVisit || !rect || this.data.disabled || !this.data.filters[i]?.options.length) return;
        const height = wx.getWindowInfo().windowHeight;
        const desired = Math.min(this.data.filters[i].options.length * 44 + 10, height * 0.42);
        const below = height - rect.bottom - 8, above = rect.top - 8;
        const openAbove = below < desired && above > below;
        this.setData({ open: i, above: openAbove, panelHeight: Math.max(1, Math.min(desired, openAbove ? above : below)) });
      }).exec();
    },
    close() { this.menuVisit = null; if (this.data.open !== -1) this.setData({ open: -1 }); },
    choose(e) {
      const group = this.data.filters[this.data.open];
      const option = group?.options[e.currentTarget.dataset.index];
      if (option?.disabled) return;
      this.close();
      if (option && !this.data.disabled && this.data.values[group.key] !== option.code)
        this.triggerEvent("selectfilter", { field: group.key, value: option.code });
    },
    reset() { if (!this.data.disabled) { this.close(); this.triggerEvent("resetfilters"); } },
    input(e) { this.triggerEvent("keyword", { value: e.detail.value }); },
    search() { this.close(); this.triggerEvent("search"); },
  },
});
