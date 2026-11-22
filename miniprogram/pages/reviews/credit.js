Page({
  data: { section: "center" },
  show(e) {
    this.setData({ section: e.currentTarget.dataset.section });
  },
});
