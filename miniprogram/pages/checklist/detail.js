const detail = require("../../services/planning-detail-page")("checklists");
const ui = require("../../services/planning-page");
const session = require("../../session/storage");

require("../../session/page")({
  ...detail,
  data: { ...detail.data, swipeId: "" },
  revealRow(e) {
    this.setData({ swipeId: e.detail.opened ? e.currentTarget.dataset.id : "" });
  },
  async removeRow(e) {
    const id = e.currentTarget.dataset.id;
    const row = this.data.items.find(item => item.id === id);
    if (!row || id !== this.data.swipeId || this.data.busy || !this.data.detail?.actions.canEdit) return;
    this.setData({ swipeId: "" });
    const owner = session.capture();
    const confirmed = await ui.confirm("移除这件道具？", "保存清单后，「" + row.display.name + "」将从本清单移除。", { confirmText: "移除", confirmColor: "#be3634" });
    if (!confirmed || !session.isCurrent(owner) || this.data.busy || !this.data.detail?.actions.canEdit) return;
    const index = this.data.items.findIndex(item => item.id === id);
    if (index >= 0) this.removeItemAt(index);
  },
  onHide() {
    this.setData({ swipeId: "" });
    detail.onHide.call(this);
  },
  onSessionReset() {
    this.setData({ swipeId: "" });
    detail.onSessionReset.call(this);
  },
});
