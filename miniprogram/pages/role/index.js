const {
  getUser,
  getSelectedAccount,
  setSelectedAccount,
  clearAuthSession,
  fetchDemoAccounts,
  getDemoAccountByKey,
  loginCurrentAccount,
  loginRealWechat,
  loginByRole,
  bindDemanderRole,
  resolveEntryPath,
} = require("../../services/user.service");
const { KEYS, getItem, setItem } = require("../../store/local-db");

Page({
  data: {
    showFactoryChooser: false,
    showAccountSheet: false,
    roleLoading: false,
    demoAccounts: [],
    selectedAccountKey: "demander_demo",
    selectedAccount: null,
    canEnterSupplier: false,
    canEnterAdmin: false,
  },

  async onLoad() {
    await this.loadDemoAccounts();

    const user = getUser();
    const holdUntil = Number(getItem(KEYS.ROLE_ENTRY_HOLD_UNTIL, 0) || 0);
    const shouldStayOnRole = holdUntil > Date.now();
    if (shouldStayOnRole) {
      setItem(KEYS.ROLE_ENTRY_HOLD_UNTIL, 0);
      return;
    }
    if (user && user.defaultEntry && user.defaultEntry !== "role_select") {
      this.redirectByUser(user);
    }
  },

  async loadDemoAccounts() {
    const demoAccounts = await fetchDemoAccounts();
    const selectedAccountKey = getSelectedAccount();
    const selectedAccount = demoAccounts.find((item) => item.accountKey === selectedAccountKey) || demoAccounts[0] || null;

    if (selectedAccount) {
      setSelectedAccount(selectedAccount.accountKey);
    }

    this.setData({
      demoAccounts,
      selectedAccountKey: selectedAccount ? selectedAccount.accountKey : "demander_demo",
      selectedAccount,
      canEnterSupplier: !!(selectedAccount && (selectedAccount.roleBindings || []).includes("supplier")),
      canEnterAdmin: !!(selectedAccount && (selectedAccount.roleBindings || []).includes("admin")),
    });
  },

  openAccountSheet() {
    this.setData({ showAccountSheet: true });
  },

  closeAccountSheet() {
    this.setData({ showAccountSheet: false });
  },

  async switchAccount(e) {
    const accountKey = e.currentTarget.dataset.accountKey;
    const selectedAccount = this.data.demoAccounts.find((item) => item.accountKey === accountKey);
    if (!selectedAccount) return;

    clearAuthSession();
    setSelectedAccount(accountKey);
    let nextSelectedAccount = selectedAccount;
    if (accountKey === "new_user_demo") {
      try {
        const resetUser = await loginCurrentAccount({ resetDemo: true });
        nextSelectedAccount = {
          ...selectedAccount,
          roleBindings: resetUser.roleBindings || [],
          registerStatus: resetUser.registerStatus || "new",
        };
      } catch (err) {
        clearAuthSession();
      }
    }
    this.setData({
      selectedAccountKey: accountKey,
      selectedAccount: nextSelectedAccount,
      showAccountSheet: false,
      canEnterSupplier: !!((nextSelectedAccount.roleBindings || []).includes("supplier")),
      canEnterAdmin: !!((nextSelectedAccount.roleBindings || []).includes("admin")),
    });

    wx.showToast({ title: `已切换到${selectedAccount.nickname}`, icon: "none" });
  },

  async selectRole(e) {
    const role = e.currentTarget.dataset.role;
    if (this.data.roleLoading) return;
    this.setData({ roleLoading: true });

    try {
      const user = await loginCurrentAccount();
      if (role === "demander") {
        await this.handleDemanderEntry(user);
      } else {
        await this.handleFactoryEntry(user);
      }
    } catch (err) {
      wx.showToast({ title: err.message || "进入失败", icon: "none" });
    } finally {
      this.setData({ roleLoading: false });
    }
  },

  async loginWithWechat() {
    if (this.data.roleLoading) return;
    this.setData({ roleLoading: true });
    try {
      const user = await loginRealWechat();
      const selectedAccount = {
        accountKey: "wechat_real",
        nickname: "微信真实账号",
        description: user.needRoleSelection
          ? "首次微信登录，请选择租赁方或工厂方继续注册"
          : "已通过微信官方登录接口识别身份",
        roleBindings: user.roleBindings || [],
        registerStatus: user.registerStatus || "new",
      };
      this.setData({
        selectedAccountKey: "wechat_real",
        selectedAccount,
        canEnterSupplier: (user.roleBindings || []).includes("supplier"),
        canEnterAdmin: (user.roleBindings || []).includes("admin"),
      });
      if (user.defaultEntry && user.defaultEntry !== "role_select") {
        this.redirectByUser(user);
        return;
      }
      wx.showToast({ title: "微信登录成功，请选择身份", icon: "none" });
    } catch (err) {
      wx.showToast({ title: err.message || "微信登录失败", icon: "none" });
    } finally {
      this.setData({ roleLoading: false });
    }
  },

  async handleDemanderEntry(user) {
    const roleBindings = user.roleBindings || [];
    if (roleBindings.includes("demander")) {
      const nextUser = await loginByRole("demander");
      this.redirectByUser(nextUser);
      return;
    }
    if (roleBindings.includes("supplier") || roleBindings.includes("admin")) {
      wx.showToast({ title: "当前账号已绑定工厂或管理员角色，不能进入租赁端", icon: "none" });
      return;
    }

    const nextUser = await bindDemanderRole();
    this.redirectByUser(nextUser);
  },

  async handleFactoryEntry(user) {
    const roleBindings = user.roleBindings || [];
    if (roleBindings.includes("demander")) {
      wx.showToast({ title: "当前账号已绑定租赁方，不能申请工厂入驻", icon: "none" });
      return;
    }
    if (roleBindings.includes("admin") || roleBindings.includes("supplier")) {
      this.setData({
        showFactoryChooser: true,
        canEnterSupplier: roleBindings.includes("supplier"),
        canEnterAdmin: roleBindings.includes("admin"),
      });
      return;
    }
    if (user.defaultEntry === "factory_audit_status" || user.registerStatus === "factory_pending" || user.registerStatus === "factory_rejected") {
      this.redirectByUser(user);
      return;
    }
    wx.navigateTo({ url: "/pages/factory-invite/index" });
  },

  closeFactoryChooser() {
    this.setData({ showFactoryChooser: false });
  },

  async chooseFactoryEntry(e) {
    const role = e.currentTarget.dataset.role;
    this.closeFactoryChooser();
    try {
      const user = await loginByRole(role);
      this.redirectByUser(user);
    } catch (err) {
      wx.showToast({ title: err.message || "进入失败", icon: "none" });
    }
  },

  redirectByUser(user) {
    const url = resolveEntryPath(user.defaultEntry);
    if (url === "/pages/role/index") {
      return;
    }
    wx.reLaunch({ url });
  },
});
