const {
  getUser,
  getSelectedRole,
  fetchUser,
  clearAuthSession,
  loginAsRole,
} = require("../../services/user.service");

Page({
  data: {
    user: null,
    selectedRole: "demander",
    isDemander: true,
    isSupplier: false,
    isAdmin: false,
  },

  async onShow() {
    if (wx.getStorageSync("adminFactoryContext") === "1") {
      await loginAsRole("admin").catch(() => null);
      wx.removeStorageSync("adminFactoryContext");
    }
    await this.loadUserInfo();
    wx.setNavigationBarTitle({ title: "我的" });

    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      let selected = 2;
      if (this.data.isAdmin || this.data.isSupplier) {
        selected = 3;
      }
      this.getTabBar().setData({ selected });
    }
  },

  async loadUserInfo() {
    const selectedRole = getSelectedRole();
    let user = getUser() || {};

    try {
      user = await fetchUser(selectedRole);
    } catch (err) {
      user = getUser() || user;
    }

    this.setData({
      user,
      selectedRole,
      isDemander: selectedRole === "demander",
      isSupplier: selectedRole === "supplier",
      isAdmin: selectedRole === "admin",
    });
  },

  async goAdminWarehouse() {
    if (this.data.isAdmin) {
      wx.setStorageSync("adminFactoryContext", "1");
      await loginAsRole("supplier");
      wx.navigateTo({ url: "/pages/admin/factory-warehouse?fromAdmin=1" });
      return;
    }
    wx.navigateTo({ url: "/pages/admin/factory-warehouse" });
  },

  async goAdminOrders() {
    if (this.data.isAdmin) {
      wx.setStorageSync("adminFactoryContext", "1");
      await loginAsRole("supplier");
      wx.navigateTo({ url: "/pages/supplier-orders/index?fromAdmin=1" });
      return;
    }
    wx.navigateTo({ url: "/pages/supplier-orders/index" });
  },

  goAdminPublish() {
    if (this.data.isAdmin) {
      wx.setStorageSync("adminFactoryContext", "1");
    }
    wx.navigateTo({ url: "/pages/admin/factory-publish" });
  },

  goAdminQrPool() {
    wx.navigateTo({ url: "/pages/admin/qr-pool/index" });
  },

  goAdminInvitePool() {
    wx.navigateTo({ url: "/pages/admin/invite-pool/index" });
  },

  viewOrders() {
    wx.switchTab({ url: "/pages/project/index" });
  },

  viewCreditLogs() {
    wx.navigateTo({ url: "/pages/credit-log/index" });
  },

  viewMyDisputes() {
    wx.navigateTo({ url: "/pages/dispute-list/index" });
  },

  viewProjects() {
    if (this.data.isSupplier || this.data.isAdmin) {
      wx.showToast({ title: "当前角色没有方案模块", icon: "none" });
      return;
    }
    wx.switchTab({ url: "/pages/project/index" });
  },

  viewCertification() {
    wx.showToast({ title: "实名认证功能开发中", icon: "none" });
  },

  viewStudentCertification() {
    wx.showToast({ title: "学生认证功能开发中", icon: "none" });
  },

  viewSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  logout() {
    wx.showModal({
      title: "提示",
      content: "确定退出登录吗？",
      success: (res) => {
        if (!res.confirm) return;
        clearAuthSession();
        wx.reLaunch({ url: "/pages/role/index" });
      },
    });
  },
});
