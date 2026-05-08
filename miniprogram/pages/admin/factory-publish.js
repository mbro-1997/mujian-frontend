const { listProps } = require("../../services/prop.service");
const { listOrders } = require("../../services/order.service");
const { PROP_STATUS, ORDER_STATUS } = require("../../constants/status");
const { loginAsRole, getSelectedRole } = require("../../services/user.service");
const { scanQrCode } = require("../../utils/qr-scan");

Page({
  data: {
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
    await this.loadWarehouseStats();
  },

  async loadWarehouseStats() {
    const shouldRestoreAdmin = getSelectedRole() === "admin";
    try {
      if (shouldRestoreAdmin) {
        await loginAsRole("supplier");
      }
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
    } finally {
      if (shouldRestoreAdmin) {
        await loginAsRole("admin").catch(() => null);
      }
    }
  },

  async scanCode() {
    try {
      const { qrCodeId } = await scanQrCode();
      wx.navigateTo({ url: `/pages/qr-entry/index?q=${encodeURIComponent(qrCodeId)}&source=admin_publish` });
    } catch (err) {
      wx.showToast({ title: err.message || "扫码失败", icon: "none" });
    }
  },
});
