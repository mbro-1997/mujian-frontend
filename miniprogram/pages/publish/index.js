const { listProps } = require("../../services/prop.service");
const { getSelectedRole } = require("../../services/user.service");
const { getReviews, getUserStats } = require("../../services/admin.service");
const { listOrders } = require("../../services/order.service");
const { PROP_STATUS, ORDER_STATUS } = require("../../constants/status");

const USER_STATUS_TEXT = {
  active: "正常",
  disabled: "已停用",
  suspended: "已冻结",
};

function withAdminReviewPreview(list = []) {
  return list.map((item) => ({
    ...item,
    visibleText: item.visibleText || (item.visible ? "显示中" : "已隐藏"),
  }));
}

function withAdminUserPreview(list = []) {
  return list.map((item) => ({
    ...item,
    statusText: item.statusText || USER_STATUS_TEXT[item.status] || item.status,
    verifiedText: item.verifiedText || (item.verified ? "已认证" : "未认证"),
  }));
}

Page({
  data: {
    selectedRole: "supplier",
    isAdmin: false,
    showAdminOps: false,
    adminReviews: [],
    adminUsers: [],
    totalProps: 0,
    idleProps: 0,
    lockedProps: 0,
    rentingProps: 0,
    offlineProps: 0,
    pendingConfirmOrders: 0,
    utilizationRate: "0%",
    dailyRevenue: 0,
    totalDeposit: 0,
    avgRentPrice: 0,
  },

  async onShow() {
    const selectedRole = getSelectedRole() || "supplier";
    const isAdmin = selectedRole === "admin";
    const adminEntryTarget = wx.getStorageSync("adminEntryTarget");
    const forceFactoryPublish = isAdmin && adminEntryTarget === "publish";

    if (forceFactoryPublish) {
      wx.removeStorageSync("adminEntryTarget");
    }

    const showAdminOps = isAdmin && !forceFactoryPublish;
    this.setData({ selectedRole, isAdmin, showAdminOps });

    if (showAdminOps) {
      wx.setNavigationBarTitle({ title: "运营管理" });
      await this.loadAdminOpsData();
    } else {
      wx.setNavigationBarTitle({ title: "发布" });
      await this.loadWarehouseStats();
    }

    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  async loadAdminOpsData() {
    try {
      const [reviews, users] = await Promise.all([getReviews(), getUserStats()]);
      this.setData({
        adminReviews: withAdminReviewPreview(reviews),
        adminUsers: withAdminUserPreview(users),
      });
    } catch (err) {
      wx.showToast({ title: err.message || "加载运营数据失败", icon: "none" });
    }
  },

  viewMoreReviews() {
    wx.navigateTo({ url: "/pages/admin/review" });
  },

  viewMoreUsers() {
    wx.navigateTo({ url: "/pages/admin/user-stats" });
  },

  async loadWarehouseStats() {
    try {
      const [props, orders] = await Promise.all([require("../../services/prop.service").listWarehouseProps(), listOrders("supplier")]);

      const totalProps = props.length;
      const idleProps = props.filter((item) => item.status === PROP_STATUS.IDLE).length;
      const lockedProps = props.filter((item) => item.status === PROP_STATUS.LOCKED).length;
      const rentingProps = props.filter((item) => item.status === PROP_STATUS.RENTING).length;
      const offlineProps = props.filter((item) => item.status === PROP_STATUS.OFFLINE).length;

      const utilizationRate = totalProps ? `${Math.round((rentingProps / totalProps) * 100)}%` : "0%";
      const dailyRevenue = props
        .filter((item) => item.status === PROP_STATUS.RENTING)
        .reduce((sum, item) => sum + Number(item.price || 0), 0);
      const totalDeposit = props.reduce((sum, item) => sum + Number(item.deposit || 0), 0);
      const avgRentPrice = totalProps ? Math.round(props.reduce((sum, item) => sum + Number(item.price || 0), 0) / totalProps) : 0;
      const pendingConfirmOrders = orders.filter((item) => item.status === ORDER_STATUS.PENDING_FACTORY_CONFIRM).length;

      this.setData({
        totalProps,
        idleProps,
        lockedProps,
        rentingProps,
        offlineProps,
        pendingConfirmOrders,
        utilizationRate,
        dailyRevenue,
        totalDeposit,
        avgRentPrice,
      });
    } catch (err) {
      wx.showToast({ title: "加载统计失败", icon: "none" });
    }
  },

  scanCode() {
    wx.navigateTo({ url: "/pages/inventory/index?mode=scan" });
  },
});
