require("../../navigation/root")(2, {
  ...require("../../services/planning-list-page")("checklists"),
  openHistory() {
    wx.navigateTo({ url: "/pages/checklist/history" });
  },
});
