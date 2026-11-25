const api = require("../../services/props");
const session = require("../../session/storage");

Component({
  properties: {
    locator: Object,
    qrId: String,
    localPath: String,
    revision: Number,
    fallback: { type: String, value: "查看图片" },
    mode: { type: String, value: "aspectFill" },
  },
  data: { source: "", loading: false },
  observers: {
    "locator, qrId, localPath, revision": function () {
      if (this.attachedToPage) this.load();
    },
  },
  lifetimes: {
    attached() {
      this.attachedToPage = true;
      this.unsubscribe = session.subscribe(() => {
        this.sequence++;
        this.setData({ source: "", loading: false });
      });
      this.load();
    },
    detached() {
      this.attachedToPage = false;
      this.sequence++;
      this.unsubscribe?.();
    },
  },
  methods: {
    async load() {
      const sequence = this.sequence = (this.sequence || 0) + 1;
      const { localPath, locator, qrId } = this.data;
      this.setData({ source: localPath || "", loading: !localPath && !!(locator || qrId) });
      if (localPath || !(locator || qrId)) return;
      try {
        const source = await (qrId ? api.qrImageFile(qrId) : api.photoFile(locator));
        if (sequence === this.sequence) this.setData({ source });
      } catch {
        // 加载失败时保留占位，用户仍可查看原图或刷新标签。
      } finally {
        if (sequence === this.sequence) this.setData({ loading: false });
      }
    },
    failed() {
      this.setData({ source: "", loading: false });
    },
  },
});
