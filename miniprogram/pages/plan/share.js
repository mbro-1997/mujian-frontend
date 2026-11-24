const api = require("../../services/planning"),
  ui = require("../../services/planning-page");
require("../../session/page")({
  data: {
    token: "",
    detail: null,
    items: [],
    busy: false,
    message: "",
    invalid: false,
  },
  onLoad(q) {
    this.setData({ token: q.token || "" });
  },
  async onShow() {
    const round = (this.round = (this.round || 0) + 1);
    this.setData({
      detail: null,
      items: [],
      busy: !!this.data.token,
      invalid: !this.data.token,
      message: "",
    });
    if (!this.data.token) return;
    try {
      const detail = await api.get(
        "/api/public/scheme-shares/" + this.data.token,
        true,
      );
      if (round !== this.round) return;
      const { items, ...summary } = detail;
      this.setData({
        detail: {
          ...summary,
          description: summary.description || "",
          daily: detail.hidePrice
            ? ""
            : api.money(detail.estimatedDailyRentFen),
        },
      });
      ui.replaceItems(this, items.map(api.display));
    } catch (error) {
      if (round === this.round)
        this.setData({
          detail: null,
          items: [],
          invalid: error.reason === "SHARE_INVALID" || [403, 404].includes(error.status),
          message: error.message,
        });
    } finally {
      if (round === this.round) this.setData({ busy: false });
    }
  },
  home() {
    wx.switchTab({ url: "/pages/home/index" });
  },
  inaccessible(e) {
    this.round = (this.round || 0) + 1;
    this.setData({
      detail: null,
      items: [],
      invalid: true,
      message: e.detail.message,
    });
  },
  onHide() {
    this.round = (this.round || 0) + 1;
    this.setData({ detail: null, items: [] });
  },
  onUnload() {
    this.round = (this.round || 0) + 1;
  },
});
