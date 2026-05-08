const { listWarehouseProps, updatePropStatus } = require("../../services/prop.service");
const { loginAsRole } = require("../../services/user.service");
const { PROP_STATUS } = require("../../constants/status");
const {
  PROP_STYLE_OPTIONS,
  PROP_TYPE_OPTIONS,
} = require("../../constants/prop-options");

const STATUS_TABS = [
  { label: "全部", value: "all" },
  { label: "空闲", value: PROP_STATUS.IDLE },
  { label: "租赁中", value: PROP_STATUS.RENTING },
  { label: "已锁定", value: PROP_STATUS.LOCKED },
  { label: "已下架", value: PROP_STATUS.OFFLINE },
  { label: "审核中", value: "audit_pending" },
];

function buildWarehouseItem(item) {
  const isAuditPending = item.auditStatus === "pending";
  const isLocked = item.status === PROP_STATUS.LOCKED || item.status === PROP_STATUS.RENTING;
  const canToggle = !isAuditPending && !isLocked;
  const actionText = item.status === PROP_STATUS.OFFLINE ? "上架" : "下架";
  return {
    ...item,
    statusText: isAuditPending ? "待审核" : item.statusText,
    canToggle,
    actionText,
    actionDisabledText: isAuditPending ? "审核中" : "不可操作",
  };
}

Page({
  data: {
    fromAdmin: false,
    keyword: "",
    searchKeyword: "",
    activeStatus: "all",
    styleOptions: ["全部风格", ...PROP_STYLE_OPTIONS],
    typeOptions: ["全部类型", ...PROP_TYPE_OPTIONS],
    styleIndex: 0,
    typeIndex: 0,
    selectedStyle: "",
    selectedType: "",
    statusTabs: STATUS_TABS,
    allWarehouseProps: [],
    warehouseProps: [],
  },

  onLoad(options) {
    this.setData({ fromAdmin: options && options.fromAdmin === "1" });
  },

  async onShow() {
    wx.setNavigationBarTitle({ title: "仓库" });
    await this.refreshProps();
  },

  async onUnload() {
    if (this.data.fromAdmin) {
      await loginAsRole("admin").catch(() => null);
    }
  },

  async refreshProps() {
    try {
      const warehouseProps = await listWarehouseProps();
      this.setData({ allWarehouseProps: warehouseProps.map(buildWarehouseItem) }, () => this.applyWarehouseFilters());
    } catch (err) {
      wx.showToast({ title: err.message || "加载仓库失败", icon: "none" });
    }
  },

  applyWarehouseFilters() {
    const keyword = (this.data.searchKeyword || "").trim().toLowerCase();
    const filtered = this.data.allWarehouseProps.filter((item) => {
      const keywordMatched = !keyword
        || String(item.name || "").toLowerCase().includes(keyword)
        || String(item.id || "").includes(keyword)
        || String(item.style || "").toLowerCase().includes(keyword)
        || String(item.type || "").toLowerCase().includes(keyword)
        || String(item.material || "").toLowerCase().includes(keyword)
        || String(item.statusText || "").toLowerCase().includes(keyword);
      const statusMatched = this.matchStatusFilter(item);
      const styleMatched = !this.data.selectedStyle || item.style === this.data.selectedStyle;
      const typeMatched = !this.data.selectedType || item.type === this.data.selectedType;
      return keywordMatched && statusMatched && styleMatched && typeMatched;
    });
    this.setData({ warehouseProps: filtered });
  },

  matchStatusFilter(item) {
    const activeStatus = this.data.activeStatus;
    if (activeStatus === "all") return true;
    if (activeStatus === "audit_pending") return item.auditStatus === "pending";
    if (item.auditStatus === "pending") return false;
    return item.status === activeStatus;
  },

  handleKeywordInput(e) {
    const keyword = e.detail.value || "";
    if (!keyword.trim()) {
      this.setData({ keyword: "", searchKeyword: "" }, () => this.applyWarehouseFilters());
      return;
    }
    this.setData({ keyword });
  },

  submitSearch() {
    this.setData({ searchKeyword: this.data.keyword || "" }, () => this.applyWarehouseFilters());
  },

  clearSearch() {
    this.setData({ keyword: "", searchKeyword: "" }, () => this.applyWarehouseFilters());
  },

  changeStatus(e) {
    this.setData({ activeStatus: e.currentTarget.dataset.status || "all" }, () => this.applyWarehouseFilters());
  },

  changeStyle(e) {
    const styleIndex = Number(e.detail.value || 0);
    const selectedStyle = styleIndex === 0 ? "" : this.data.styleOptions[styleIndex];
    this.setData({ styleIndex, selectedStyle }, () => this.applyWarehouseFilters());
  },

  changeType(e) {
    const typeIndex = Number(e.detail.value || 0);
    const selectedType = typeIndex === 0 ? "" : this.data.typeOptions[typeIndex];
    this.setData({ typeIndex, selectedType }, () => this.applyWarehouseFilters());
  },

  resetFilters() {
    this.setData({
      keyword: "",
      searchKeyword: "",
      activeStatus: "all",
      styleIndex: 0,
      typeIndex: 0,
      selectedStyle: "",
      selectedType: "",
    }, () => this.applyWarehouseFilters());
  },

  async toggleStatus(e) {
    const id = Number(e.currentTarget.dataset.id);
    const current = this.data.allWarehouseProps.find((item) => item.id === id);
    if (!current) return;

    if (!current.canToggle) {
      wx.showToast({ title: current.auditStatus === "pending" ? "待审核道具不可操作" : "当前道具不可操作", icon: "none" });
      return;
    }

    const nextStatus = current.status === PROP_STATUS.OFFLINE ? PROP_STATUS.IDLE : PROP_STATUS.OFFLINE;
    try {
      await updatePropStatus(id, nextStatus);
      await this.refreshProps();
      wx.showToast({ title: "申请已提交，待审核", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "状态更新失败", icon: "none" });
    }
  },

  viewPropDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/prop-detail/index?id=${id}` });
  },
});
