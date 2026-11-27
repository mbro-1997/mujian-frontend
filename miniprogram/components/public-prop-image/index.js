const store = require("../../services/prop-browser-store"),
  session = require("../../session/storage");
Component({
  properties: {
    image: { type: Object, value: null },
    resourceType: { type: String, value: "" },
    resourceId: { type: String, value: "" },
    resourceVersion: { type: String, value: "" },
    skuId: { type: String, value: "" },
    startDate: { type: String, value: "" },
    endDate: { type: String, value: "" },
    lazy: { type: Boolean, value: true },
    active: { type: Boolean, value: false },
    mode: { type: String, value: "aspectFill" },
  },
  data: { src: "", error: false },
  observers: {
    "image,active,skuId,resourceType,resourceId,resourceVersion": function () {
      if (this.readyToLoad) this.sync();
    },
  },
  lifetimes: {
    attached() {
      this.stop = session.subscribe(() => {
        this.round = (this.round || 0) + 1;
        this.setData({ src: "", error: false });
      });
    },
    ready() {
      this.readyToLoad = true;
      if (this.data.lazy) {
        this.observer = this.createIntersectionObserver({ nativeMode: true });
        this.observer
          .relativeToViewport({
            top: store.config.imageMargin,
            bottom: store.config.imageMargin,
          })
          .observe(".image-slot", (entry) => {
            if (this.readyToLoad && !this.near && entry.intersectionRatio > 0) {
              this.near = true;
              this.observer.disconnect();
              this.sync();
            }
          });
      } else this.sync();
    },
    detached() {
      this.readyToLoad = false;
      this.round = (this.round || 0) + 1;
      if (this.observer) this.observer.disconnect();
      if (this.stop) this.stop();
    },
  },
  methods: {
    // 属性刷新不清空已经显示的同对象图片；未进入区域不设置src。
    sync() {
      const key = [
        this.data.skuId,
        this.data.resourceType,
        this.data.resourceId,
        this.data.resourceVersion,
        this.data.image && this.data.image.cacheKey,
      ].join(":");
      if (key !== this.imageKey) {
        this.imageKey = key;
        this.retried = false;
        this.loading = false;
        this.round = (this.round || 0) + 1;
        this.setData({ src: "", error: false });
      }
      if (!this.data.image) {
        this.setData({ src: "", error: true });
        return;
      }
      if (this.data.src || this.loading || !(this.near || this.data.active))
        return;
      return this.load(false);
    },
    async load(failed) {
      const round = (this.round = (this.round || 0) + 1),
        owner = session.capture();
      this.loading = true;
      try {
        const resource = this.data.resourceType,
          id = this.data.resourceId;
        const planning = require("../../services/planning");
        const resourcePath =
          resource === "share"
            ? "/api/public/scheme-shares/" + id
            : resource === "order"
              ? "/api/me/rental-orders/" + id
              : resource === "factory-order"
                ? "/api/me/factory-orders/" + id
                : resource === "scheme"
              ? "/api/me/schemes/" + id
              : "/api/me/checklists/" + id;
        const image = await store.images.ensure(
          this.data.image,
          this.data.skuId,
          () =>
            resource
              ? planning.get(resourcePath, resource === "share")
              : store.detail(
                  this.data.skuId,
                  {
                    startDate: this.data.startDate,
                    endDate: this.data.endDate,
                  },
                  true,
                ),
          failed,
          resource
            ? {
                scope: resource + ":" + id + ":" + this.data.resourceVersion,
                extract: resource === "order" || resource === "factory-order"
                  ? (result) => result.items.map(item => item.image).filter(Boolean)
                  : planning.extract,
                current: () => round === this.round,
              }
            : {},
        );
        if (
          !this.readyToLoad ||
          round !== this.round ||
          !session.isCurrent(owner)
        )
          return;
        const src = image && (resource ? image.url : store.images.publicPropContentUrl(this.data.skuId, image));
        this.setData({ src: src || "", error: !image });
      } catch (error) {
        if (round === this.round && session.isCurrent(owner)) {
          this.setData({ error: true });
          if (store.denied(error)) {
            this.setData({ src: "" });
            this.triggerEvent("inaccessible", { message: error.message });
          }
        }
      } finally {
        if (round === this.round) this.loading = false;
      }
    },
    async failed() {
      if (this.retried) {
        this.setData({ src: "", error: true });
        return;
      }
      this.retried = true;
      const round = this.round;
      // 同源图片地址稳定，先移除失败节点，再挂载一次以触发实际重试。
      await new Promise(resolve => this.setData({ src: "" }, resolve));
      if (this.readyToLoad && this.round === round) return this.load(true);
    },
    preview() {
      this.triggerEvent("preview");
    },
  },
});
