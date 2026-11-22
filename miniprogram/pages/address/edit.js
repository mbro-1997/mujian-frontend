const api = require("../../services/planning"),
  ui = require("../../services/planning-page");
require("../../session/page")({
  data: {
    id: "",
    receiverName: "",
    phone: "",
    regionText: "",
    regionValue: [],
    detailAddress: "",
    isDefault: false,
    version: 0,
    busy: false,
    dirty: false,
    canRestoreDraft: false,
    message: "",
  },
  async onLoad(q) {
    if (!q.id) return;
    this.setData({ id: q.id });
    await ui.run(this, async () => {
      this.setAddress(await api.get("/api/me/addresses/" + q.id));
    });
  },
  setAddress(fields) {
    const parts = (fields.regionText || "").trim().split(/\s+/);
    this.setData({ ...fields, regionValue: parts.length === 3 ? parts : [] });
  },
  async refresh() {
    if (!this.data.id) return;
    if (!(await ui.prepareDraftRefresh(this, "重新读取地址？",
        "本次输入会保留，读取新版本后可手动恢复。",
        ["receiverName", "phone", "regionText", "detailAddress", "isDefault"]))) return;
    await ui.run(this, async () => {
      this.setAddress(await api.get("/api/me/addresses/" + this.data.id));
      ui.dirty(this, false);
    });
  },
  restoreDraft() {
    const draft = ui.takeDraft(this);
    if (draft) {
      this.setAddress(draft);
      ui.dirty(this);
    }
  },
  onPrivateAccessLost() {
    this.setData({ receiverName: "", phone: "", regionText: "", regionValue: [], detailAddress: "", isDefault: false, version: 0 });
    ui.clearDraft(this);
    ui.dirty(this, false);
  },
  onSessionReset() {
    this.onPrivateAccessLost();
  },
  input(e) {
    if (this.data.busy) return;
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
    ui.dirty(this);
  },
  region(e) {
    if (this.data.busy) return;
    this.setData({ regionValue: e.detail.value, regionText: e.detail.value.join(" ") });
    ui.dirty(this);
  },
  toggle(e) {
    if (this.data.busy) return;
    this.setData({ isDefault: e.detail.value });
    ui.dirty(this);
  },
  save() {
    return ui.run(this, async () => {
      const d = this.data,
        body = {
          receiverName: d.receiverName.trim(),
          phone: d.phone.trim(),
          regionText: d.regionText.trim(),
          detailAddress: d.detailAddress.trim(),
          isDefault: d.isDefault,
        };
      if (
        !body.receiverName ||
        !body.regionText ||
        !body.detailAddress ||
        !/^1[3-9]\d{9}$/.test(body.phone)
      )
        throw new Error("请填写完整地址及有效大陆手机号");
      if (d.id) body.expectedVersion = d.version;
      await api.command(
        "address-save:" + (d.id || "new"),
        "/api/me/addresses" + (d.id ? "/" + d.id + "/update" : ""),
        body,
      );
      ui.dirty(this, false);
      wx.navigateBack();
    });
  },
  recover() {
    return ui.run(this, async () => {
      const receipt = await api.recover(
        "address-save:" + (this.data.id || "new"),
      );
      if (receipt) {
        ui.dirty(this, false);
        wx.navigateBack();
      }
    });
  },
});
