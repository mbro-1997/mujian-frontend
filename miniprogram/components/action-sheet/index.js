Component({
  properties: { title: String, busy: Boolean },
  methods: {
    close() {
      if (!this.data.busy) this.triggerEvent("dismiss");
    },
    blockScroll() {},
  },
});
