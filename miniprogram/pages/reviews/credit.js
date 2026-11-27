Page({
  data: {
    section: "center",
    events: [
      { name: "正常完成订单", score: "+1" }, { name: "每满 3 单正常履约", score: "+1" },
      { name: "逾期 24 小时内", score: "−1" }, { name: "逾期 24～48 小时", score: "−3" },
      { name: "逾期 48～72 小时", score: "−5" }, { name: "逾期超过 72 小时", score: "−8" },
      { name: "重大损坏／恶意不还（仲裁生效后）", score: "−5／−10" },
    ],
  },
  onLoad({ section }) {
    const titles = { rules: "信用规则", ledger: "信用流水", deposit: "押金说明" };
    if (section === "rules" || section === "ledger" || section === "deposit") {
      this.setData({ section });
      wx.setNavigationBarTitle({ title: titles[section] });
    }
  },
});
