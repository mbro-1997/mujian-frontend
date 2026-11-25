const successToast = require("../../services/success-toast");
const { minuteFields } = require("../../services/display-time");
const api = require("../../services/props");
require("../../session/page")({
  data: {
    id: "",
    type: "",
    record: null,
    message: "",
    busy: false,
    dialog: false,
    reason: "",
    expanded: false,
  },
  onLoad(q) {
    this.setData({ id: q.id || "", type: q.type || "" });
  },
  onShow() {
    return this.load();
  },
  async load() {
    this.setData({ busy: true });
    try {
      const r = await api.request(
        "me/prop-reviews/" + this.data.type + "/" + this.data.id,
      );
      this.setData({
        record: minuteFields(r, ["submittedAt", "currentUpdatedAt", "reviewedAt"]),
        beforeSkuState: api.names[r.beforeSkuStatus] || "—",
        targetSkuState: api.names[r.targetSkuStatus] || "—",
        currentSkuState: api.names[r.currentSkuStatus],
        state: api.names[r.auditStatus],
        action: api.names[r.actionType || r.adjustmentType],
        message: "",
        canResubmit:
          r.sourceType === "sku_audit" &&
          r.actionType === "create" &&
          ["rejected", "cancelled"].includes(r.auditStatus),
        items: (r.items || []).map((i) => ({
          ...minuteFields(i, ["currentStatusChangedAt"]),
          before: api.names[i.beforeStatus],
          target: api.names[i.targetStatus],
          current: api.names[i.currentStatus],
        })),
      });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  toggle() {
    this.setData({ expanded: !this.data.expanded });
  },
  cancel() {
    this.setData({ dialog: true, reason: "" });
  },
  close() {
    if (!this.data.busy) this.setData({ dialog: false });
  },
  input(e) {
    this.setData({ reason: e.detail.value });
  },
  resubmit() {
    wx.navigateTo({
      url:
        "/pages/props/form?mode=" + (this.data.record.actionType === "update" ? "update" : "resubmit") + "&id=" +
        this.data.record.skuId +
        "&previous=" +
        this.data.id,
    });
  },
  async confirm() {
    if (this.data.busy || !this.data.reason.trim()) return;
    this.setData({ busy: true });
    try {
      await api.command(
        "cancel-" + this.data.id,
        "cancel_application",
        "me/prop-reviews/" + this.data.type + "/" + this.data.id + "/cancel",
        {
          expectedVersion: this.data.record.version,
          reason: this.data.reason.trim(),
        },
      );
      this.setData({ dialog: false });
      successToast("申请已撤回");
      await this.load();
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
});
