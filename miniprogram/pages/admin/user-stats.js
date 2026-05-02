const { getUserStats, bindUserRole, unbindUserRole } = require("../../services/admin.service");

const ROLE_TEXT = {
  demander: "需求方",
  supplier: "工厂",
  admin: "管理员",
};

function formatUsers(users = []) {
  return users.map((item) => ({
    ...item,
    roleLabel: ROLE_TEXT[item.role] || item.role || "未设置",
    roleBindingsLabel: (item.roleBindings || []).map((role) => ROLE_TEXT[role] || role),
    hasSupplier: (item.roleBindings || []).includes("supplier"),
    hasAdmin: (item.roleBindings || []).includes("admin"),
  }));
}

Page({
  data: { users: [], loading: false },

  async onShow() {
    await this.loadUsers();
  },

  async loadUsers() {
    this.setData({ loading: true });
    try {
      const users = await getUserStats();
      this.setData({ users: formatUsers(users) });
    } catch (err) {
      wx.showToast({ title: err.message || "加载用户失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async handleBindRole(e) {
    const userId = Number(e.currentTarget.dataset.id);
    const role = e.currentTarget.dataset.role;
    if (!userId || !role) return;

    try {
      const users = await bindUserRole(userId, role);
      this.setData({ users: formatUsers(users) });
      wx.showToast({ title: `已绑定${ROLE_TEXT[role] || role}`, icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "绑定角色失败", icon: "none" });
    }
  },

  async handleUnbindRole(e) {
    const userId = Number(e.currentTarget.dataset.id);
    const role = e.currentTarget.dataset.role;
    if (!userId || !role) return;

    try {
      const users = await unbindUserRole(userId, role);
      this.setData({ users: formatUsers(users) });
      wx.showToast({ title: `已取消${ROLE_TEXT[role] || role}`, icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "取消角色失败", icon: "none" });
    }
  },
});
