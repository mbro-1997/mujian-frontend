const {
  listOrders,
  confirmOrderByFactory,
  rejectOrderByFactory,
  scanOutboundProp,
  scanReturnProp,
  expireTimedOutOrders,
  submitOrderReview,
} = require("../../services/order.service");
const { loginAsRole } = require("../../services/user.service");
const { ORDER_STATUS } = require("../../constants/status");

const STATUS_TABS = [
  { label: "全部", value: "all" },
  { label: "待确认", value: ORDER_STATUS.PENDING_FACTORY_CONFIRM },
  { label: "租赁中", value: ORDER_STATUS.RENTING },
  { label: "待归还", value: "wait_return" },
  { label: "待评价", value: ORDER_STATUS.WAIT_REVIEW },
  { label: "已完成", value: ORDER_STATUS.COMPLETED },
  { label: "已驳回", value: ORDER_STATUS.CANCELLED_MANUAL },
];

const DATE_RANGE_OPTIONS = [
  { label: "全部时间", value: "all" },
  { label: "今日", value: "today" },
  { label: "近 7 天", value: "7d" },
  { label: "近 30 天", value: "30d" },
];

const SORT_OPTIONS = [
  { label: "最新订单优先", value: "latest" },
  { label: "待处理优先", value: "pending_first" },
];

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function parseOrderDate(order) {
  const value = order.createdAt || order.date;
  if (!value) return null;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (/^\d+$/.test(String(value))) {
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(value).replace(/-/g, "/"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function statusClass(status) {
  if (status === ORDER_STATUS.PENDING_FACTORY_CONFIRM) return "status-pending-confirm";
  if (status === ORDER_STATUS.RENTING || status === ORDER_STATUS.WAIT_PICKUP) return "status-renting";
  if (status === "wait_return" || status === ORDER_STATUS.WAIT_REVIEW) return "status-return";
  if (status === ORDER_STATUS.COMPLETED) return "status-completed";
  if (status === ORDER_STATUS.CANCELLED_MANUAL || status === ORDER_STATUS.CANCELLED_TIMEOUT) return "status-rejected";
  return "status-default";
}

function normalizeListOrder(order) {
  const isReturnStage = order.status === ORDER_STATUS.WAIT_REVIEW
    || (order.status === ORDER_STATUS.RENTING && Number(order.returnScannedCount || 0) > 0);
  return {
    ...order,
    statusClass: statusClass(isReturnStage ? "wait_return" : order.status),
  };
}

Page({
  searchTimer: null,
  skipNextRefresh: false,
  lastScrollTop: 0,

  data: {
    keyword: "",
    activeStatus: "all",
    dateRange: "all",
    sortType: "latest",
    statusTabs: STATUS_TABS,
    dateRangeOptions: DATE_RANGE_OPTIONS,
    sortOptions: SORT_OPTIONS,
    dateRangeIndex: 0,
    sortIndex: 0,
    dateRangeText: DATE_RANGE_OPTIONS[0].label,
    sortText: SORT_OPTIONS[0].label,

    allOrders: [],
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    refreshing: false,
    loadError: false,
    total: 0,

    showScanModal: false,
    scanMode: "outbound",
    currentOrder: null,
    fromAdmin: false,
    showRejectModal: false,
    rejectOrderId: null,
    rejectReason: "",
    showReviewModal: false,
    reviewOrderId: null,
    reviewPropScore: 5,
    reviewCounterpartyScore: 5,
    reviewContent: "",
  },

  onLoad(options) {
    this.setData({ fromAdmin: options && options.fromAdmin === "1" });
  },

  async onShow() {
    if (this.skipNextRefresh) {
      this.skipNextRefresh = false;
      if (this.lastScrollTop) {
        setTimeout(() => wx.pageScrollTo({ scrollTop: this.lastScrollTop, duration: 0 }), 0);
      }
      return;
    }
    await expireTimedOutOrders();
    await this.resetAndLoad();
  },

  onPageScroll(e) {
    this.lastScrollTop = e.scrollTop || 0;
  },

  async onUnload() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    if (this.data.fromAdmin) {
      await loginAsRole("admin").catch(() => null);
    }
  },

  async onPullDownRefresh() {
    this.setData({ refreshing: true });
    await this.resetAndLoad();
    this.setData({ refreshing: false });
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    await this.loadOrdersPage();
  },

  noop() {},

  async resetAndLoad() {
    this.setData({
      list: [],
      page: 1,
      hasMore: true,
      total: 0,
      loadError: false,
    });
    await this.loadOrdersPage(true);
  },

  async loadOrdersPage(resetSource = false) {
    if (this.data.loading || (!this.data.hasMore && !resetSource)) return;

    this.setData({ loading: true, loadError: false });
    try {
      const allOrders = resetSource ? (await listOrders()).map(normalizeListOrder) : this.data.allOrders;
      const filtered = this.filterOrders(allOrders);
      const sorted = this.sortOrders(filtered);
      const start = (this.data.page - 1) * this.data.pageSize;
      const pageList = sorted.slice(start, start + this.data.pageSize);
      const nextList = this.data.page === 1 ? pageList : this.data.list.concat(pageList);

      this.setData({
        allOrders,
        list: nextList,
        total: sorted.length,
        page: this.data.page + 1,
        hasMore: start + pageList.length < sorted.length,
      });
    } catch (err) {
      this.setData({ loadError: true });
      wx.showToast({ title: err.message || "加载订单失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  filterOrders(orders) {
    const keyword = (this.data.keyword || "").trim().toLowerCase();
    const now = new Date();
    return orders.filter((order) => {
      const statusMatched = this.matchStatus(order);
      const keywordMatched = !keyword
        || String(order.id).includes(keyword)
        || String(order.orderNo || "").toLowerCase().includes(keyword)
        || String(order.demanderName || "").toLowerCase().includes(keyword)
        || String(order.demanderPhone || "").toLowerCase().includes(keyword);
      const date = parseOrderDate(order);
      const dateMatched = this.matchDateRange(date, now);
      return statusMatched && keywordMatched && dateMatched;
    });
  },

  matchStatus(order) {
    const active = this.data.activeStatus;
    if (active === "all") return true;
    if (active === "wait_return") {
      const total = Number(order.propCount || 0);
      const outboundCount = Number(order.outboundScannedCount || 0);
      const returnCount = Number(order.returnScannedCount || 0);
      return order.status === ORDER_STATUS.RENTING
        && total > 0
        && outboundCount >= total
        && returnCount < total;
    }
    return order.status === active;
  },

  matchDateRange(date, now) {
    if (this.data.dateRange === "all") return true;
    if (!date) return false;
    if (this.data.dateRange === "today") return isSameDate(date, now);

    const days = this.data.dateRange === "7d" ? 7 : 30;
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    return date >= start && date <= now;
  },

  sortOrders(orders) {
    const pendingWeight = (order) => {
      if (order.canFactoryConfirm || order.canFactoryReject) return 0;
      if (order.canScanOutbound || order.canScanReturn || order.canReview) return 1;
      return 2;
    };

    return orders.slice().sort((a, b) => {
      if (this.data.sortType === "pending_first") {
        const diff = pendingWeight(a) - pendingWeight(b);
        if (diff !== 0) return diff;
      }
      const bDate = parseOrderDate(b);
      const aDate = parseOrderDate(a);
      const bValue = bDate ? bDate.getTime() : Number(b.id) || 0;
      const aValue = aDate ? aDate.getTime() : Number(a.id) || 0;
      return bValue - aValue;
    });
  },

  handleKeywordInput(e) {
    const keyword = e.detail.value || "";
    this.setData({ keyword });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.resetAndLoad(), 300);
  },

  submitSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.resetAndLoad();
  },

  clearSearch() {
    this.setData({ keyword: "" }, () => this.resetAndLoad());
  },

  changeStatus(e) {
    const activeStatus = e.currentTarget.dataset.status || "all";
    if (activeStatus === this.data.activeStatus) return;
    this.setData({ activeStatus }, () => this.resetAndLoad());
  },

  changeDateRange(e) {
    const dateRangeIndex = Number(e.detail.value || 0);
    const selected = DATE_RANGE_OPTIONS[dateRangeIndex] || DATE_RANGE_OPTIONS[0];
    this.setData({
      dateRangeIndex,
      dateRange: selected.value,
      dateRangeText: selected.label,
    }, () => this.resetAndLoad());
  },

  changeSortType(e) {
    const sortIndex = Number(e.detail.value || 0);
    const selected = SORT_OPTIONS[sortIndex] || SORT_OPTIONS[0];
    this.setData({
      sortIndex,
      sortType: selected.value,
      sortText: selected.label,
    }, () => this.resetAndLoad());
  },

  resetFilters() {
    this.setData({
      keyword: "",
      activeStatus: "all",
      dateRange: "all",
      sortType: "latest",
      dateRangeIndex: 0,
      sortIndex: 0,
      dateRangeText: DATE_RANGE_OPTIONS[0].label,
      sortText: SORT_OPTIONS[0].label,
    }, () => this.resetAndLoad());
  },

  reloadCurrent() {
    this.resetAndLoad();
  },

  openOrderDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.skipNextRefresh = true;
    wx.navigateTo({ url: `/pages/order-detail/index?id=${id}` });
  },

  async confirmFactoryOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.showModal({
      title: "确认接单",
      content: `确认接收订单 ${orderId}？确认后将进入待出库流程。`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const updated = await confirmOrderByFactory(orderId);
          wx.showToast({ title: updated && updated.canScanOutbound ? "接单成功" : "订单状态已变化", icon: "success" });
          await this.resetAndLoad();
        } catch (err) {
          wx.showToast({ title: err.message || "接单失败", icon: "none" });
        }
      },
    });
  },

  openRejectOrderModal(e) {
    this.setData({
      showRejectModal: true,
      rejectOrderId: e.currentTarget.dataset.id,
      rejectReason: "",
    });
  },

  closeRejectOrderModal() {
    this.setData({ showRejectModal: false, rejectOrderId: null, rejectReason: "" });
  },

  updateRejectReason(e) {
    this.setData({ rejectReason: e.detail.value || "" });
  },

  async confirmRejectOrder() {
    const reason = (this.data.rejectReason || "").trim();
    if (!reason) {
      wx.showToast({ title: "请填写驳回理由", icon: "none" });
      return;
    }
    try {
      await rejectOrderByFactory(this.data.rejectOrderId, reason);
      this.closeRejectOrderModal();
      await this.resetAndLoad();
      wx.showToast({ title: "已驳回订单", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "驳回失败", icon: "none" });
    }
  },

  openReviewModal(e) {
    const orderId =
      (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
      || (e.target && e.target.dataset && e.target.dataset.id);
    if (!orderId) {
      wx.showToast({ title: "订单不存在", icon: "none" });
      return;
    }
    this.setData({
      showReviewModal: true,
      reviewOrderId: orderId,
      reviewPropScore: 5,
      reviewCounterpartyScore: 5,
      reviewContent: "",
    });
  },

  closeReviewModal() {
    this.setData({ showReviewModal: false, reviewOrderId: null, reviewPropScore: 5, reviewCounterpartyScore: 5, reviewContent: "" });
  },

  updateReviewPropScore(e) {
    this.setData({ reviewPropScore: Number(e.currentTarget.dataset.score || 5) });
  },

  updateReviewCounterpartyScore(e) {
    this.setData({ reviewCounterpartyScore: Number(e.currentTarget.dataset.score || 5) });
  },

  updateReviewContent(e) {
    this.setData({ reviewContent: e.detail.value || "" });
  },

  async submitReview() {
    if (!this.data.reviewOrderId) return;
    try {
      await submitOrderReview(this.data.reviewOrderId, {
        propScore: this.data.reviewPropScore,
        counterpartyScore: this.data.reviewCounterpartyScore,
        content: this.data.reviewContent,
        reviewerRole: "supplier",
      });
      this.closeReviewModal();
      await this.resetAndLoad();
      wx.showToast({ title: "评价成功", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "评价失败", icon: "none" });
    }
  },

  openScanModal(e) {
    const orderId = e.currentTarget.dataset.id;
    const mode = e.currentTarget.dataset.mode;
    const order = this.data.allOrders.find((item) => String(item.id) === String(orderId));
    if (!order) return;

    this.setData({
      showScanModal: true,
      scanMode: mode,
      currentOrder: order,
    });
  },

  closeScanModal() {
    this.setData({ showScanModal: false, currentOrder: null });
  },

  async scanOneProp(e) {
    const propId = Number(e.currentTarget.dataset.propId);
    const { currentOrder, scanMode } = this.data;
    if (!currentOrder) return;

    try {
      const updated = scanMode === "outbound"
        ? await scanOutboundProp(currentOrder.id, propId)
        : await scanReturnProp(currentOrder.id, propId);

      this.setData({ currentOrder: normalizeListOrder(updated) });
      await this.resetAndLoad();
      wx.showToast({ title: "扫码成功", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "扫码失败", icon: "none" });
    }
  },

  async scanAllRemaining() {
    const { currentOrder, scanMode } = this.data;
    if (!currentOrder) return;

    let updated = currentOrder;
    const props = currentOrder.props || [];

    try {
      for (const prop of props) {
        const scanned = scanMode === "outbound" ? prop.outboundScanned : prop.returnScanned;
        if (scanned) continue;

        updated = scanMode === "outbound"
          ? await scanOutboundProp(updated.id, prop.id)
          : await scanReturnProp(updated.id, prop.id);
      }

      this.setData({ currentOrder: normalizeListOrder(updated) });
      await this.resetAndLoad();
      wx.showToast({ title: "批量扫码完成", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "批量扫码失败", icon: "none" });
    }
  },
});
