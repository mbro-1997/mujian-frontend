const successToast = require("../../services/success-toast");
const { request } = require("../../services/http");
const ui = require("../../services/trading-page");
require("../../session/page")({
  data: {
    id: "",
    type: "",
    entry: null,
    review: null,
    rating: 5,
    stars: [1, 2, 3, 4, 5],
    orderCaption: "",
    reviewerRole: "",
    tagsOpen: false,
    selected: [],
    content: "",
    busy: false,
    message: "",
  },
  onLoad(q) {
    const stack = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    const parent = stack[stack.length - 2];
    const expected = q.type === "custom_order"
      ? ["pages/custom/detail", "pages/factory/custom-detail"]
      : ["pages/orders/detail", "pages/factory/order"];
    const order = parent?.data.detail;
    const sameOrder = expected.includes(parent?.route) && order?.id === q.id;
    this.setData({ id: q.id || "", type: q.type || "",
      orderCaption: sameOrder ? [order.factoryName, order.orderNo || order.number].filter(Boolean).join(" · ") : "" });

  },
  onShow() {
    ui.show(this);
    return this.load();
  },
  onHide() {
    ui.hide(this);
  },
  onUnload() {
    ui.hide(this);
  },
  load() {
    return ui.run(this, async (current) => {
      const { type, id } = this.data;
      this.setData({ captionError: "" });
      let reviewId = id;
      if (type) {
        const entry = await request(
          "/api/me/review-orders/" + id + "/eligibility?businessType=" + type,
        );
        if (!current()) return;
        if (this.data.review && (!entry.reviewId || entry.reviewId !== this.data.review.id)) {
          this.onAccessLost();
        }
        this.setData({
          entry,
          reviewerRole: getApp().globalData.context?.roleCode || "",
          choices: entry.tags.map((name) => ({
            name,
            selected: this.data.selected.includes(name),
          })),
        });
        reviewId = entry.reviewId;
        if (entry.canReview && !this.data.orderCaption) {
          try {
            const sources = await request("/api/me/service-sources?sourceType=" + encodeURIComponent(type) + "&sourceId=" + encodeURIComponent(id));
            if (!current()) return;
            const source = sources.items.find(row => row.source.sourceId === id && row.source.sourceType === type);
            if (source) this.setData({ orderCaption: source.title });
          } catch (error) {
            if (!current()) return;
            this.setData({ captionError: error.message });
          }
        }
      }
      if (reviewId) {
        const review = await request("/api/me/order-reviews/" + reviewId);
        if (current()) this.setData({ review });
      }
    });
  },
  onAccessLost() {
    this.setData({ review: null, entry: null, orderCaption: "", captionError: "", reviewerRole: "", choices: [], selected: [], rating: 5, content: '' });
  },
  rate(e) {
    if (this.data.busy || !this.data.entry?.canReview) return;
    const rating = Number(e.currentTarget.dataset.rating);
    if (this.data.stars.includes(rating)) this.setData({ rating });
  },
  edit(e) {
    this.setData({ content: e.detail.value });
  },
  toggleTags() { this.setData({ tagsOpen: !this.data.tagsOpen }); },
  tag(e) {
    if (this.data.busy) return;
    const name = e.currentTarget.dataset.name;
    const choices = this.data.choices.map((x) =>
      x.name === name ? { ...x, selected: !x.selected } : x,
    );
    this.setData({
      choices,
      selected: choices.filter((x) => x.selected).map((x) => x.name),
    });
  },
  submit() {
    return ui.act(this, async (current) => {
      const review = await request("/api/me/order-reviews", "POST", true, {
        businessType: this.data.type,
        businessOrderId: this.data.id,
        rating: this.data.rating,
        tags: this.data.selected,
        content: this.data.content.trim() || null,
      });
      if (current()) {
        this.setData({ review });
        successToast("评价已提交");
      }
    });
  },
});
