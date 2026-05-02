const { listPendingFillProps, completePendingFill } = require("../../services/prop.service");
const {
  PROP_STYLE_OPTIONS,
  PROP_TYPE_OPTIONS,
  FIRE_RESISTANT_OPTIONS,
} = require("../../constants/prop-options");

const PLACEHOLDER = "---请选择---";

function createEmptyFormData(selectedPendingProp = null) {
  return {
    name: "",
    style: "",
    type: "",
    size: "",
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    material: "",
    fireResistantOption: "",
    weight: "",
    transportSuggestion: "",
    price: "",
    deposit: "",
    images: selectedPendingProp && selectedPendingProp.imageUrl ? [selectedPendingProp.imageUrl] : [],
  };
}

Page({
  data: {
    pendingProps: [],
    selectedPendingProp: null,
    styleOptions: [PLACEHOLDER, ...PROP_STYLE_OPTIONS],
    typeOptions: [PLACEHOLDER, ...PROP_TYPE_OPTIONS],
    fireResistantOptions: [PLACEHOLDER, ...FIRE_RESISTANT_OPTIONS],
    styleIndex: 0,
    typeIndex: 0,
    fireResistantIndex: 0,
    formData: createEmptyFormData(),
  },

  async onShow() {
    await this.loadPendingProps();
  },

  async loadPendingProps() {
    try {
      const pendingProps = await listPendingFillProps();
      this.setData({ pendingProps });
    } catch (err) {
      wx.showToast({ title: err.message || "加载待扫码道具失败", icon: "none" });
    }
  },

  choosePendingProp(e) {
    const propId = Number(e.currentTarget.dataset.id);
    const selectedPendingProp = this.data.pendingProps.find((item) => item.id === propId);
    if (!selectedPendingProp) return;

    this.setData({
      selectedPendingProp,
      styleIndex: 0,
      typeIndex: 0,
      fireResistantIndex: 0,
      formData: createEmptyFormData(selectedPendingProp),
    });
  },

  resetSelection() {
    this.setData({
      selectedPendingProp: null,
      styleIndex: 0,
      typeIndex: 0,
      fireResistantIndex: 0,
      formData: createEmptyFormData(),
    });
  },

  updateFormData(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`formData.${field}`]: e.detail.value });
  },

  onStyleChange(e) {
    const styleIndex = Number(e.detail.value || 0);
    const value = this.data.styleOptions[styleIndex] || PLACEHOLDER;
    this.setData({
      styleIndex,
      "formData.style": value === PLACEHOLDER ? "" : value,
    });
  },

  onTypeChange(e) {
    const typeIndex = Number(e.detail.value || 0);
    const value = this.data.typeOptions[typeIndex] || PLACEHOLDER;
    this.setData({
      typeIndex,
      "formData.type": value === PLACEHOLDER ? "" : value,
    });
  },

  onFireResistantChange(e) {
    const fireResistantIndex = Number(e.detail.value || 0);
    const value = this.data.fireResistantOptions[fireResistantIndex] || PLACEHOLDER;
    this.setData({
      fireResistantIndex,
      "formData.fireResistantOption": value === PLACEHOLDER ? "" : value,
    });
  },

  chooseImage() {
    wx.chooseImage({
      count: Math.max(0, 4 - this.data.formData.images.length),
      sizeType: ["original", "compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const next = [...this.data.formData.images, ...res.tempFilePaths].slice(0, 4);
        this.setData({ "formData.images": next });
      },
    });
  },

  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const next = [...this.data.formData.images];
    next.splice(index, 1);
    this.setData({ "formData.images": next });
  },

  validateForm(formData) {
    const requiredFields = [
      { key: "name", label: "道具名称" },
      { key: "style", label: "风格" },
      { key: "type", label: "类型" },
      { key: "size", label: "尺寸描述" },
      { key: "lengthCm", label: "长度" },
      { key: "widthCm", label: "宽度" },
      { key: "heightCm", label: "高度" },
      { key: "material", label: "材质" },
      { key: "fireResistantOption", label: "是否阻燃" },
      { key: "weight", label: "重量" },
      { key: "transportSuggestion", label: "运输建议" },
      { key: "price", label: "租金" },
      { key: "deposit", label: "押金" },
    ];

    for (const item of requiredFields) {
      const value = formData[item.key];
      if (value === undefined || value === null || String(value).trim() === "") {
        wx.showToast({ title: `请填写${item.label}`, icon: "none" });
        return false;
      }
    }

    if (!formData.images.length) {
      wx.showToast({ title: "请上传道具图片", icon: "none" });
      return false;
    }

    return true;
  },

  async submitInventory() {
    const { formData, selectedPendingProp } = this.data;

    if (!selectedPendingProp) {
      wx.showToast({ title: "请先选择待扫码道具", icon: "none" });
      return;
    }

    if (!this.validateForm(formData)) {
      return;
    }

    try {
      await completePendingFill(selectedPendingProp.id, {
        name: formData.name.trim(),
        style: formData.style,
        type: formData.type,
        size: formData.size.trim(),
        lengthCm: Number(formData.lengthCm),
        widthCm: Number(formData.widthCm),
        heightCm: Number(formData.heightCm),
        material: formData.material.trim(),
        fireResistantOption: formData.fireResistantOption,
        weight: formData.weight.trim(),
        transportSuggestion: formData.transportSuggestion.trim(),
        price: Number(formData.price),
        deposit: Number(formData.deposit),
        imageUrl: formData.images[0] || "/images/stage-prop-real.jpg",
        images: formData.images,
      });

      wx.showToast({ title: "提交成功，待审核", icon: "success" });
      this.resetSelection();
      await this.loadPendingProps();
    } catch (err) {
      wx.showToast({ title: err.message || "提交失败", icon: "none" });
    }
  },
});
