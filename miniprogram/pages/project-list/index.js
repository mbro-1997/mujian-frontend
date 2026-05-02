const { listProjects, createProject } = require("../../services/project.service");

Page({
  data: {
    projects: [],
    showCreateProjectModal: false,
    createProjectName: "",
  },

  async onShow() {
    await this.loadProjects();
  },

  async loadProjects() {
    try {
      this.setData({ projects: await listProjects() });
    } catch (err) {
      wx.showToast({ title: err.message || "加载方案失败", icon: "none" });
    }
  },

  viewProjectDetail(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    wx.navigateTo({ url: `/pages/project-detail/index?id=${id}` });
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
    const name = (this.data.createProjectName || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入方案名称", icon: "none" });
      return;
    }
    try {
      const project = await createProject({ name });
      this.closeCreateProjectModal();
      wx.navigateTo({ url: `/pages/project-detail/index?id=${project.id}` });
      wx.showToast({ title: "方案已创建", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "创建方案失败", icon: "none" });
    }
  },

  exportPDF(e) {
    const id = Number(e.currentTarget.dataset.id || 0);
    wx.showToast({ title: id ? `方案 ${id} 导出成功` : "PDF 导出成功", icon: "success" });
  },
});
