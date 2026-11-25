const api = require("../../services/props");
const session = require("../../session/storage");
const label = require("../../services/prop-label");
const { hint } = require("../../services/form-error");

Component({
  properties: { sku: Object, qrId: String, targetId: String },
  data: { file: "", busy: false, retryImage: false, qr: null, notice: "" },
  observers: {
    "qrId, targetId, sku.id, sku.version": function (...values) {
      const stamp = JSON.stringify(values);
      if (stamp !== this.stamp) { this.stamp = stamp; this.reset(); }
    },
  },
  lifetimes: {
    attached() { this.unsubscribe = session.subscribe(() => this.reset()); },
    detached() { this.version++; this.unsubscribe?.(); },
  },
  methods: {
    reset() {
      this.version = (this.version || 0) + 1;
      this.setData({ file: "", busy: false, retryImage: false, qr: null, notice: "" });
    },
    preview() {
      if (this.data.file) wx.previewImage({ urls: [this.data.file] });
    },
    async print(e) {
      const { sku, qrId, targetId, file, retryImage } = this.data;
      if (this.data.busy || !qrId) return;
      const version = this.version, owner = session.capture();
      const current = () => this.version === version && session.isCurrent(owner);
      this.setData({ busy: true, notice: "" });
      try {
        if (retryImage && e?.currentTarget?.dataset.retry) {
          await api.request("me/prop-qr/" + qrId + "/retry-image", "POST");
          if (!current()) return;
        }
        const qr = await api.request("me/prop-qr/" + qrId);
        if (!current()) return;
        const expectedType = sku.assetType === "A_ASSET" ? "SN" : "SKU";
        if (qr.id !== qrId || qr.skuId !== sku.id || qr.targetId !== targetId ||
            qr.targetType !== expectedType || qr.status !== "bound") {
          this.reset();
          hint("标签绑定已变化，请刷新列表");
          return;
        }
        this.setData({ qr, retryImage: qr.canRetryImage && qr.imageStatus === "failed" });
        if (qr.imageStatus !== "ready") {
          this.setData({ file: "", notice: qr.imageStatus === "failed" ? "原码生成失败" : "原码生成中，请稍后再试" });
          return;
        }
        if (file) {
          await label.saveToAlbum(file, current);
          if (current()) wx.showToast({ title: "已保存标签图片" });
          return;
        }
        const data = label.labelData(qr, sku);
        if (!data) throw Error("标签资料不完整，请刷新后重试");
        const source = await api.qrImageFile(qr.id);
        if (!current()) return;
        const path = await label.render(this, source, data);
        if (current()) this.setData({ file: path });
      } catch (e) {
        if (current()) {
          if ([401, 403, 404].includes(e.status)) this.reset();
          hint(e.message);
        }
      } finally {
        if (current()) this.setData({ busy: false });
      }
    },
    async confirm() {
      const { qr, busy } = this.data;
      if (busy || !qr?.canConfirmLabel) return;
      const version = this.version, owner = session.capture();
      this.setData({ busy: true });
      try {
        await api.confirmLabel(qr);
        if (this.version !== version || !session.isCurrent(owner)) return;
        this.setData({ qr: { ...qr, canConfirmLabel: false } });
        wx.showToast({ title: "贴标已确认" });
        this.triggerEvent("confirmed");
      } catch (e) {
        if (this.version === version && session.isCurrent(owner)) hint(e.message);
      } finally {
        if (this.version === version && session.isCurrent(owner)) this.setData({ busy: false });
      }
    },
  },
});
