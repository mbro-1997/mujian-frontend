const { getPropById, getWarehousePropById, updatePropStatus } = require("../../services/prop.service");
const { getSelectedRole } = require("../../services/user.service");
const { listProjects, createProject, addPropToProject } = require("../../services/project.service");
const { PROP_STATUS, getPropStatusClass } = require("../../constants/status");

Page({
  data: {
    prop: null,
    statusClass: "status-pending",
    isSupplier: false,
    isDemander: false,
    showProjectPicker: false,
    pickerProjects: [],
    showCreateProjectModal: false,
    createProjectName: "",
  },

  async onLoad(options) {
    this.checkUserRole();
    await this.loadPropDetail(options.id);
  },

  onShow() {
    this.checkUserRole();
  },

  checkUserRole() {
    const role = getSelectedRole();
    this.setData({
      isSupplier: role === "supplier" || role === "admin",
      isDemander: role === "demander",
    });
  },

  async loadPropDetail(id) {
    try {
      const role = getSelectedRole();
      const prop = role === "supplier" || role === "admin"
        ? await getWarehousePropById(id)
        : await getPropById(id);

      if (!prop) {
        throw new Error("道具不存在");
      }

      this.setData({
        prop,
        statusClass: prop.statusClass || getPropStatusClass(prop.status),
      });
    } catch (err) {
      wx.showToast({ title: "道具不存在", icon: "none" });
      setTimeout(() => wx.navigateBack(), 600);
    }
  },

  async addToProject() {
    const { prop } = this.data;
    if (!prop) return;

    try {
      const projects = (await listProjects()).filter((item) => item.status === "editing");
      this.setData({
        showProjectPicker: true,
        pickerProjects: projects,
      });
    } catch (err) {
      wx.showToast({ title: err.message || "加载方案失败", icon: "none" });
    }
  },

  closeProjectPicker() {
    this.setData({
      showProjectPicker: false,
      pickerProjects: [],
    });
  },

  async chooseProject(e) {
    const { prop } = this.data;
    const projectId = Number(e.currentTarget.dataset.id);
    if (!prop || !projectId) return;

    try {
      await addPropToProject(projectId, prop.id);
      this.closeProjectPicker();
      wx.showToast({ title: "已加入方案", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "加入失败", icon: "none" });
    }
  },

  openCreateProjectModal() {
    this.setData({ showCreateProjectModal: true, createProjectName: "" });
  },

  closeCreateProjectModal() {
    this.setData({ showCreateProjectModal: false, createProjectName: "" });
  },

  updateCreateProjectName(e) {
    this.setData({ createProjectName: e.detail.value || "" });
  },

  async confirmCreateProject() {
    const { prop, createProjectName } = this.data;
    const name = (createProjectName || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入方案名称", icon: "none" });
      return;
    }
    if (!prop) return;

    try {
      const project = await createProject({ name });
      await addPropToProject(project.id, prop.id);
      this.closeCreateProjectModal();
      this.closeProjectPicker();
      wx.showToast({ title: "方案已创建并加入道具", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "创建方案失败", icon: "none" });
    }
  },

  contactSupplier() {
    wx.showToast({ title: "联系功能开发中", icon: "none" });
  },

  editProp() {
    wx.showToast({ title: "编辑功能开发中", icon: "none" });
  },

  async toggleStatus() {
    const { prop } = this.data;
    if (!prop) return;

    if (prop.auditStatus === "pending") {
      wx.showToast({ title: "审核中不可上下架", icon: "none" });
      return;
    }

    if (prop.status === PROP_STATUS.RENTING || prop.status === PROP_STATUS.LOCKED) {
      wx.showToast({ title: "当前状态不可上下架", icon: "none" });
      return;
    }

    const nextStatus = prop.status === PROP_STATUS.OFFLINE ? PROP_STATUS.IDLE : PROP_STATUS.OFFLINE;

    try {
      const nextProp = await updatePropStatus(prop.id, nextStatus);
      this.setData({
        prop: nextProp,
        statusClass: nextProp.statusClass || getPropStatusClass(nextProp.status),
      });
      wx.showToast({ title: "申请已提交，待审核", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "更新失败", icon: "none" });
    }
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.url;
    const urls = this.data.prop && this.data.prop.images && this.data.prop.images.length
      ? this.data.prop.images
      : [this.data.prop.image];
    wx.previewImage({ current, urls });
  },
});
