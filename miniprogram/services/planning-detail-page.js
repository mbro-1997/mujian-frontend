const schemeEdits = require("./scheme-edits");
const api = require("./planning"),
  ui = require("./planning-page");
module.exports = function (kind) {
  const plan = kind === "schemes";
  return {
    data: {
      id: "",
      detail: null,
      items: [],
      busy: false,
      message: "",
      dirty: false,
      canRestoreDraft: false,
      hidePrice: false,
      shareReady: false,
      shareToken: "",
      exportingId: "",
      name: "",
      description: "",
      conflict: false,
    },
    onLoad(q) {
      this.setData({ id: q.id, hidePrice: plan && api.priceModes.get(q.id) === true });
      if (plan) wx.hideShareMenu?.();
    },
    onShow() {
      ui.pdfShown(this);
      if (!this.data.dirty) return this.load();
    },
    async load() {
      if (this.data.busy) return;
      const round = (this.round = (this.round || 0) + 1);
      await ui.run(this, async () => {
        const detail = await api.get("/api/me/" + kind + "/" + this.data.id);
        if (round !== this.round) return;
        if (detail.actions && detail.actions.canEdit === false) ui.clearDraft(this);
        const { items, groups, ...summary } = detail;
        const formatted = api.summary(summary),
          rows = (items || groups.flatMap((group) => group.items)).map(
            api.display,
          );
        this.setData({
          detail: formatted,
          name: detail.name,
          description: detail.description || "",
          reason: detail.submission
            ? api.reasons[detail.submission.reasonCode] || (detail.currentCheckoutBatchId?"已有付款处理中，请查看原付款":"可继续配送报价，提交后才占用库存")
            : "",
          rentEstimate: api.money(detail.rentEstimateFen || 0),
          conflict: false,
          shareReady: false,
        });
        if (plan) this.savedScheme = schemeEdits.baseline(detail, rows);
        ui.replaceItems(this, rows);
        ui.dirty(this, false);
      });
    },
    async refresh() {
      if (!(await ui.prepareDraftRefresh(this, "重新读取当前内容？",
          "未保存的输入会保留在本页，核对新版本后再决定修改。",
          ["name", "description", "items"]))) return;
      if (plan && this.savedDraft) this.savedDraft.schemeBaseline = this.savedScheme;
      await this.load();
    },
    restoreDraft() {
      const baseline = this.savedDraft?.schemeBaseline;
      const draft = ui.takeDraft(this);
      if (!draft) return;
      if (plan && baseline) this.savedScheme = baseline;
      this.setData({
        name: draft.name,
        description: draft.description,
      });
      ui.replaceItems(this, draft.items);
      ui.dirty(this);
    },
    editStatus() {
      const changed = !plan || this.savedScheme.dirty;
      if (this.data.dirty !== changed) ui.dirty(this, changed);
    },
    field(e) {
      if (this.data.busy) return;
      this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
      if (plan) this.savedScheme.editInfo(this.data.name, this.data.description);
      this.editStatus();
    },
    itemField(e) {
      if (this.data.busy) return;
      const index = Number(e.currentTarget.dataset.index),
        field = e.currentTarget.dataset.field;
      this.setData({ ["items[" + index + "]." + field]: e.detail.value });
      if (plan) this.savedScheme.edit(this.data.items[index]);
      this.editStatus();
    },
    step(e) {
      if (this.data.busy) return;
      const index = Number(e.currentTarget.dataset.index),
        next =
          Number(this.data.items[index].quantity) +
          Number(e.currentTarget.dataset.delta);
      if (next < 1 || next > 2147483647) return;
      this.setData({ ["items[" + index + "].quantity"]: next });
      if (plan) this.savedScheme.edit(this.data.items[index]);
      this.editStatus();
    },
    remove(e) {
      if (this.data.busy) return;
      const index = Number(e.currentTarget.dataset.index);
      if (plan) this.savedScheme.remove(this.data.items[index], index);
      this.setData({ items: this.data.items.filter((_, i) => i !== index) });
      this.editStatus();
    },
    move(e) {
      if (this.data.busy) return;
      const index = Number(e.currentTarget.dataset.index),
        to = index + Number(e.currentTarget.dataset.delta);
      if (to < 0 || to >= this.data.items.length) return;
      const items = this.data.items.slice();
      [items[index], items[to]] = [items[to], items[index]];
      if (plan) this.savedScheme.move(items, index, to);
      this.setData({ items });
      this.editStatus();
    },
    async save() {
      let saved = false;
      await ui.run(this, async () => {
        let body;
        if (plan) {
          if (!this.savedScheme || !this.data.detail.actions.canEdit) throw new Error("当前方案不可编辑。");
          body = { actions: this.savedScheme.actions() };
          if (!body.actions.length) { ui.dirty(this, false); return; }
        } else {
          const items = this.data.items.map(item => {
            const quantity = Number(item.quantity);
            if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647)
              throw new Error("数量须为有效正整数");
            return { itemId: item.id, quantity, remark: (item.remark || "").trim() || null };
          });
          body = { expectedVersion: this.data.detail.version, items };
        }
        await api.command(
          "save:" + this.data.id,
          "/api/me/" + kind + "/" + this.data.id + (plan ? "/update" : "/save"),
          body,
        );
        if (plan) this.savedScheme.commit();
        ui.dirty(this, false);
        saved = true;
      });
      if (saved) await this.load();
    },
    async recover() {
      let recovered = false;
      await ui.run(this, async () => {
        const receipt = await api.recoverNext(
          "/api/me/" + kind + "/" + this.data.id,
        );
        if (!receipt) throw new Error("没有待确认的原操作，请核对后操作。");
        recovered = true;
        ui.dirty(this, false);
      });
      if (recovered) await this.load();
    },
    async archive() {
      if (this.data.dirty) {
        this.setData({ message: "请先保存修改，再归档。" });
        return;
      }
      if (
        !(await ui.confirm(
          "确认归档方案？",
          "归档后不可恢复编辑，仍可查看、分享和导出PDF。",
        ))
      )
        return;
      const receipt = await ui.run(this, () =>
        api.command(
          "archive:" + this.data.id,
          "/api/me/schemes/" + this.data.id + "/archive",
          { expectedVersion: this.data.detail.version },
        ),
      );
      if (receipt) await this.load();
    },
    togglePrice() {
      if (this.data.busy) return;
      const hidden = !this.data.hidePrice;
      api.priceModes.set(this.data.id, hidden);
      this.setData({ hidePrice: hidden, shareReady: false });
    },
    async share() {
      const round = this.round;
      if (this.data.dirty) {
        this.setData({ message: "请先保存内容，再生成分享。" });
        return;
      }
      await ui.run(this, async () => {
        const slot = "share:" + this.data.id;
        const pending = api.pending.get(slot);
        if (pending && pending.body.hidePrice !== this.data.hidePrice)
          throw new Error("上次签发尚未确认，请恢复原价格设置后重试。");
        const body = pending?.body || { expectedVersion: this.data.detail.version, hidePrice: this.data.hidePrice };
        const result = await api.command(slot, "/api/me/schemes/" + this.data.id + "/share", body);
        if (round !== this.round || !this.data.detail) return;
        this.setData({
          "detail.version": Math.max(this.data.detail.version, result.receipt.resourceVersion), shareToken: result.share.token,
          shareReady: true,
        });
      });
    },
    closeShare() { this.setData({ shareReady: false, shareToken: "" }); },
    onShareAppMessage() {
      if (this.data.shareReady && this.data.shareToken)
        return { title: this.data.detail.name, path: "/pages/plan/share?token=" + this.data.shareToken };
      return { title: "幕间", path: "/pages/home/index" };
    },
    copyShareLink() {
      if (!this.data.shareReady || !this.data.shareToken) return;
      const baseUrl = require("../config/environment").baseUrl;
      if (!/^https?:\/\//.test(baseUrl)) {
        wx.showToast({title: "分享地址未配置", icon: "none"});
        return;
      }
      wx.setClipboardData({
        data: baseUrl.replace(/\/$/, "") + "/share/scheme.html?token=" + encodeURIComponent(this.data.shareToken),
        fail: () => wx.showToast({title: "复制失败，请重试", icon: "none"}),
      });
    },
    export() {
      if (this.data.dirty) {
        this.setData({ message: "请先保存内容，再导出。" });
        return;
      }
      return ui.exportPdf(
        this,
        this.data.id,
        this.data.hidePrice,
      );
    },
    async activate() {
      if (this.data.dirty) {
        this.setData({ message: "请先保存修改，再切换清单。" });
        return;
      }
      if (
        !(await ui.confirm(
          "切换为当前清单？",
          "原当前清单会自动挂起，租期和道具不变。",
        ))
      )
        return;
      const receipt = await ui.run(this, () =>
        api.command(
          "activate:" + this.data.id,
          "/api/me/checklists/" + this.data.id + "/activate",
          { expectedVersion: this.data.detail.version },
        ),
      );
      if (receipt) await this.load();
    },
    select() {
      if (this.data.dirty) {
        this.setData({ message: "请先保存当前调整，再继续选品。" });
        return;
      }
      if (plan) wx.switchTab({ url: "/pages/home/index" });
      else
        wx.navigateTo({
          url:
            "/pages/props/browse?startDate=" +
            this.data.detail.startDate +
            "&endDate=" +
            this.data.detail.endDate,
        });
    },
    createChecklist() {
      if (this.data.dirty) {
        this.setData({ message: "请先保存方案。" });
        return;
      }
      wx.navigateTo({
        url:
          "/pages/props/dates?schemeId=" +
          this.data.id +
          "&expectedVersion=" +
          this.data.detail.version,
      });
    },
    submit() {
      if(this.data.dirty){this.setData({message:"请先保存清单修改，再进入配送结算。"});return;}
      if(this.data.detail.currentCheckoutBatchId){wx.navigateTo({url:"/pages/payment/index?id="+this.data.detail.currentCheckoutBatchId});return;}
      if(!this.data.detail.submission.canSubmit){this.setData({message:this.data.reason||"当前清单暂不能提交，请核对状态。"});return;}
      wx.navigateTo({url:"/pages/checkout/index?id="+this.data.id});
    },
    inaccessible(e) {
      this.onPrivateAccessLost();
      this.setData({ message: e.detail.message });
    },
    onHide() {
      this.round = (this.round || 0) + 1;
      this.closeShare();
      ui.pdfHidden(this);
    },
    onUnload() {
      ui.pdfHidden(this);
      this.round = (this.round || 0) + 1;
    },
    onPrivateAccessLost() {
      this.round = (this.round || 0) + 1;
      ui.clearDraft(this);
      ui.dirty(this, false);
      this.setData({ detail: null, items: [], name: "", description: "", shareReady: false, shareToken: "", exportingId: "", reason: "", rentEstimate: "" });
      this.pdfOperation = null;
      this.savedScheme = null;
    },
    onSessionReset() {
      this.onPrivateAccessLost();
      ui.pdfHidden(this);
    },
  };
};
