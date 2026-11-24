const session = require("../../session/storage");
const custom = require("../../services/custom");
Component({
  properties: {
    file: { type: Object, value: null },
    sourceId: { type: String, value: "" },
    kind: { type: String, value: "requirements" },
    factory: { type: Boolean, value: false },
    factoryFile: { type: Object, value: null },
    compact: { type: Boolean, value: false },
  },
  data: { src: "", loading: false, message: "" },
  observers: { "file.materialId,sourceId,kind,factory,factoryFile": function () { if (this.alive) this.load(); } },
  lifetimes: {
    attached() {
      this.alive = true;
      this.stop = session.subscribe(() => { this.round++; this.materialKey = ""; this.setData({ src: "", loading: false, message: "" }); });
      this.load();
    },
    detached() { this.alive = false; this.round++; if (this.stop) this.stop(); },
  },
  methods: {
    async load(force = false) {
      const { file, sourceId, kind, factory, factoryFile } = this.data;
      const owner = session.capture();
      const key = JSON.stringify([owner.generation, factory, kind, sourceId, file?.materialId, file?.type,
        factoryFile?.localPath, factoryFile?.locator]);
      if (!force && key === this.materialKey &&
          (this.data.loading || factoryFile?.localPath || (this.data.src && this.expiresAt > Date.now()))) return;
      this.materialKey = key;
      const round = this.round = (this.round || 0) + 1;
      const current = () => this.alive && round === this.round && session.isCurrent(owner);
      this.setData({ src: "", message: "", loading: false });
      if (factoryFile?.localPath) {
        this.setData({ src: factoryFile.localPath });
        return;
      }
      const locator = factoryFile?.locator;
      if (!locator && (!file || file.type !== "image" || !/^[0-9a-f]{32}$/.test(sourceId) || !/^[0-9a-f]{32}$/.test(file.materialId) || !["requirements", "orders"].includes(kind))) return;
      this.setData({ loading: true });
      try {
        const data = locator
          ? await require("../../services/factory").request("factory-materials/view", "POST", locator)
          : await custom.get(custom.root(factory, kind, sourceId) + "/materials/" + file.materialId + "/view");
        if (current()) {
          this.expiresAt = Date.parse(data.expiresAt) || 0;
          this.setData({ src: data.url });
        }
      } catch (e) { if (current()) this.setData({ message: "图片暂不可用，点击重试" }); }
      finally { if (current()) this.setData({ loading: false }); }
    },
    failed() { this.setData({ src: "", message: "图片加载失败，点击重试" }); },
    retry() { if (!this.data.loading) this.load(true); },
  },
});
