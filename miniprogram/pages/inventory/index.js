const { listPendingFillProps, completePendingFill } = require("../../services/prop.service");
const {
  PROP_STYLE_OPTIONS,
  PROP_TYPE_OPTIONS,
  FIRE_RESISTANT_OPTIONS,
} = require("../../constants/prop-options");
const { getSelectedRole } = require("../../services/user.service");

const PLACEHOLDER = "---请选择---";
const SMART_FIELD_ALIASES = {
  name: ["道具名称", "名称"],
  style: ["风格"],
  type: ["类型"],
  size: ["尺寸", "尺寸描述"],
  lengthCm: ["长", "长度"],
  widthCm: ["宽", "宽度"],
  heightCm: ["高", "高度"],
  material: ["材质"],
  fireResistantOption: ["是否阻燃", "阻燃"],
  weight: ["重量"],
  transportSuggestion: ["运输建议"],
  price: ["租金", "日租"],
  deposit: ["押金"],
};
const SMART_KEY_TO_FIELD = Object.keys(SMART_FIELD_ALIASES).reduce((result, field) => {
  SMART_FIELD_ALIASES[field].forEach((key) => {
    result[key] = field;
  });
  return result;
}, {});
const SMART_NUMBER_FIELDS = new Set(["lengthCm", "widthCm", "heightCm", "weight", "price", "deposit"]);

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
    routePropId: null,
    routeQrCodeId: "",
    source: "",
    isQrLockedMode: false,
    smartText: "",
    selectedPendingProp: null,
    styleOptions: [PLACEHOLDER, ...PROP_STYLE_OPTIONS],
    typeOptions: [PLACEHOLDER, ...PROP_TYPE_OPTIONS],
    fireResistantOptions: [PLACEHOLDER, ...FIRE_RESISTANT_OPTIONS],
    styleIndex: 0,
    typeIndex: 0,
    fireResistantIndex: 0,
    formData: createEmptyFormData(),
  },

  onLoad(options = {}) {
    this.setData({
      routePropId: options.propId ? Number(options.propId) : null,
      routeQrCodeId: options.qrCodeId || "",
      source: options.source || "",
      isQrLockedMode: !!(options.propId && options.qrCodeId),
    });
  },

  async onShow() {
    await this.loadPendingProps();
  },

  async loadPendingProps() {
    try {
      const pendingProps = await listPendingFillProps();
      const visiblePendingProps = this.data.isQrLockedMode
        ? pendingProps.filter((item) => item.id === this.data.routePropId)
        : pendingProps;
      this.setData({ pendingProps: visiblePendingProps });
      this.preselectRouteProp(visiblePendingProps);
    } catch (err) {
      wx.showToast({ title: err.message || "加载待扫码道具失败", icon: "none" });
    }
  },

  preselectRouteProp(pendingProps) {
    if (!this.data.routePropId || this.data.selectedPendingProp) {
      return;
    }
    const selectedPendingProp = pendingProps.find((item) => item.id === this.data.routePropId);
    if (!selectedPendingProp) {
      wx.showToast({ title: "该二维码不可录入或已被处理", icon: "none" });
      return;
    }
    this.setData({
      selectedPendingProp,
      styleIndex: 0,
      typeIndex: 0,
      fireResistantIndex: 0,
      formData: createEmptyFormData(selectedPendingProp),
    });
  },

  choosePendingProp(e) {
    if (this.data.isQrLockedMode) {
      wx.showToast({ title: "扫码录入只能填写当前二维码对应道具", icon: "none" });
      return;
    }
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
    if (this.data.isQrLockedMode) {
      wx.navigateBack({ fail: () => wx.reLaunch({ url: "/pages/publish/index" }) });
      return;
    }
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

  updateSmartText(e) {
    this.setData({ smartText: e.detail.value || "" });
  },

  importSmartText() {
    const text = (this.data.smartText || "").trim();
    if (!text) {
      wx.showToast({ title: "请先粘贴道具信息", icon: "none" });
      return;
    }

    const nextForm = { ...this.data.formData };
    text
      .replace(/；/g, "\n")
      .split(/[\n;]/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const match = pair.match(/^([^:：]+)[:：](.+)$/);
        if (!match) return;
        const field = SMART_KEY_TO_FIELD[match[1].trim()];
        const value = match[2].trim();
        if (field && value) {
          nextForm[field] = this.normalizeSmartValue(field, value);
        }
      });

    this.setData({
      formData: nextForm,
      styleIndex: this.resolveOptionIndex(this.data.styleOptions, nextForm.style),
      typeIndex: this.resolveOptionIndex(this.data.typeOptions, nextForm.type),
      fireResistantIndex: this.resolveOptionIndex(this.data.fireResistantOptions, nextForm.fireResistantOption),
    });
    wx.showToast({ title: "已智能导入", icon: "success" });
  },

  normalizeSmartValue(field, value) {
    const cleaned = String(value || "").trim();
    if (SMART_NUMBER_FIELDS.has(field)) {
      const matched = cleaned.match(/\d+(\.\d+)?/);
      return matched ? matched[0] : "";
    }
    return cleaned;
  },

  resolveOptionIndex(options, value) {
    if (!value) return 0;
    const index = options.findIndex((item) => item === value);
    return index >= 0 ? index : 0;
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
        qrCodeId: this.data.routeQrCodeId,
      });

      this.showSubmitSuccessAndReturn();
    } catch (err) {
      wx.showToast({ title: err.message || "提交失败", icon: "none" });
    }
  },

  showSubmitSuccessAndReturn() {
    wx.showModal({
      title: "提交成功，待审核",
      content: "道具资料已提交给管理员审核，审核通过后会自动上架展示。",
      showCancel: false,
      confirmText: "返回发布",
      success: () => this.returnToPublishPage(),
    });
  },

  returnToPublishPage() {
    if (this.data.source === "admin_publish" || getSelectedRole() === "admin") {
      wx.redirectTo({ url: "/pages/admin/factory-publish" });
      return;
    }
    wx.switchTab({ url: "/pages/publish/index" });
  },
});
