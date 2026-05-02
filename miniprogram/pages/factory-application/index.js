const { submitFactoryApplication } = require("../../services/user.service");

Page({
  data: {
    form: {
      factoryName: "",
      unifiedSocialCreditCode: "",
      businessLicenseUrl: "",
      contactName: "",
      contactPhone: "",
      factoryAddress: "",
      mainBusiness: "",
      remark: "",
    },
    loading: false,
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value,
    });
  },

  chooseLicense() {
    wx.chooseImage({
      count: 1,
      success: (res) => {
        const url = res.tempFilePaths && res.tempFilePaths[0] ? res.tempFilePaths[0] : "/images/default-goods-image.png";
        this.setData({ "form.businessLicenseUrl": url });
      },
    });
  },

  async submit() {
    if (this.data.loading) return;
    const { form } = this.data;
    const requiredFields = [
      ["factoryName", "请填写工厂名称"],
      ["unifiedSocialCreditCode", "请填写统一社会信用代码"],
      ["businessLicenseUrl", "请上传营业执照"],
      ["contactName", "请填写联系人姓名"],
      ["contactPhone", "请填写联系人手机号"],
      ["factoryAddress", "请填写工厂地址"],
    ];

    const missing = requiredFields.find(([field]) => !form[field]);
    if (missing) {
      wx.showToast({ title: missing[1], icon: "none" });
      return;
    }

    this.setData({ loading: true });
    try {
      await submitFactoryApplication(form);
      wx.reLaunch({ url: "/pages/factory-audit-status/index" });
    } catch (err) {
      wx.showToast({ title: err.message || "提交申请失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },
});
