const session = require("../../session/storage");
const { confirm } = require("../../services/planning-page");

Component({
  properties: {
    identity: { type: null, value: null },
    disabled: Boolean,
    label: { type: String, value: "移除图片" },
    note: { type: String, value: "移除后可以重新添加。" },
  },
  lifetimes: {
    detached() { this.detachedFromForm = true; },
  },
  methods: {
    async ask() {
      if (this.asking || this.data.disabled) return;
      const owner = session.capture(), identity = JSON.stringify(this.data.identity);
      this.asking = true;
      try {
        const ok = await confirm(this.data.label + "？", this.data.note, { confirmText: "移除" });
        if (ok && !this.detachedFromForm && !this.data.disabled &&
            JSON.stringify(this.data.identity) === identity && session.isCurrent(owner))
          this.triggerEvent("remove");
      } finally {
        this.asking = false;
      }
    },
  },
});
