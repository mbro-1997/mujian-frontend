Component({
  properties: { enabled: Boolean, opened: Boolean, busy: Boolean, label: String },
  data: { dragging: false, offset: 0 },
  methods: {
    start(e) {
      this.ignoreTapUntil = 0;
      if (!this.data.enabled || this.data.busy || e.touches.length !== 1) return;
      const { clientX, clientY } = e.touches[0];
      this.gesture = { x: clientX, y: clientY, width: wx.getWindowInfo().windowWidth * 0.22 };
    },
    move(e) {
      const g = this.gesture;
      if (!g || !e.touches.length) return;
      const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
      if (!this.data.dragging) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
        this.ignoreTapUntil = Infinity;
        if (Math.abs(dy) >= Math.abs(dx)) { this.gesture = null; return; }
      }
      const origin = this.data.opened ? -g.width : 0;
      this.setData({ dragging: true, offset: Math.max(-g.width, Math.min(0, origin + dx)) });
    },
    end() {
      if (this.gesture && this.data.dragging) {
        const opened = -this.data.offset >= this.gesture.width / 2;
        this.triggerEvent("reveal", { opened });
      }
      this.cancel();
    },
    cancel() {
      this.gesture = null;
      if (this.ignoreTapUntil) this.ignoreTapUntil = Date.now() + 200;
      if (this.data.dragging) this.setData({ dragging: false, offset: 0 });
    },
    tap() {
      if (Date.now() < this.ignoreTapUntil || this.data.busy) return;
      if (this.data.opened) this.triggerEvent("reveal", { opened: false });
      else this.triggerEvent("activate");
    },
    remove() {
      if (this.data.enabled && this.data.opened && !this.data.busy) this.triggerEvent("remove");
    },
  },
});
