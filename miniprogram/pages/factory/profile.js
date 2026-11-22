const api = require("../../services/factory");
require("../../session/page")({
  data: { profile: null, fields: null, message: "", busy: false, casesOpen: false, creditSummary: "", categorySummary: "", caseSummary: "" },
  onShow() {
    this.load();
  },
  async load() {
    this.setData({ busy: true });
    try {
      const p = await api.request("factory-profile");
      const f=p.materials,code=f.unifiedSocialCreditCode||"";
      this.setData({ profile:p,fields:f,message:"",creditSummary:code.length>6?code.slice(0,4)+"**********"+code.slice(-2):code,categorySummary:(f.specialtyCategoryNames||[]).join("、")||"未填写",caseSummary:(f.cases||[]).map(c=>c.title||c.description||"图片案例").join("、")||"未填写" });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  toggleCases() { this.setData({casesOpen:!this.data.casesOpen}); },
  async photos() {
    try {
      const photos=this.data.fields?this.data.fields.factoryPhotos:[];
      if(!photos.length)return;
      const urls=await Promise.all(photos.map(locator=>api.request("factory-materials/view","POST",locator).then(r=>r.url)));
      wx.previewImage({urls});
    } catch(e) { this.setData({message:e.message}); }
  },
  edit() {
    if(!this.data.profile||!this.data.profile.canEdit)return;
    wx.navigateTo({ url: "/pages/factory/form?mode=change" });
  },
  status() {
    wx.navigateTo({ url: "/pages/factory/status?mode=change" });
  },
  phone() {
    wx.navigateTo({ url: "/pages/factory/phone" });
  },
  async preview(e) {
    try {
      const url = (
        await api.request(
          "factory-materials/view",
          "POST",
          e.currentTarget.dataset.locator,
        )
      ).url;
      wx.previewImage({ urls: [url] });
    } catch (e) {
      this.setData({ message: e.message });
    }
  },
});
