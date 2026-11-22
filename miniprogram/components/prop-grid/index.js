Component({
  properties: {
    items: { type: Array, value: [] },
    state: { type: String, value: "loading" },
    example: { type: Boolean, value: false },
  },
  methods: {
    ignoreJoin() {},
    open(e) {
      if (!this.data.example)
        this.triggerEvent("open", { id: e.currentTarget.dataset.id });
    },
    join(e) {
      if (this.data.example) return;
      const id = e.currentTarget.dataset.id;
      const item = this.data.items.find(row => row.id === id);
      if (item) this.triggerEvent(item.availability ? "open" : "joinscheme", { id });
    },
    inaccessible(e) {
      this.triggerEvent("inaccessible", e.detail);
    },
  },
});
