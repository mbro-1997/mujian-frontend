const { listProps } = require("../../services/prop.service");
const { listProjects, createProject, addPropToProject } = require("../../services/project.service");
const { PROP_STATUS } = require("../../constants/status");
const { expireTimedOutOrders } = require("../../services/order.service");

function uniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))];
}

Page({
  data: {
    props: [],
    filteredProps: [],
    searchKeyword: "",
    activeFilter: "all",
    filters: [
      { key: "all", label: "全部" },
      { key: "idle", label: "空闲" },
      { key: "renting", label: "租赁中" },
      { key: "locked", label: "已锁定" },
    ],
    styleOptions: ["全部"],
    typeOptions: ["全部"],
    selectedStyle: "全部",
    selectedType: "全部",
    styleIndex: 0,
    typeIndex: 0,
    showProjectPicker: false,
    pickerProjects: [],
    pendingPropId: null,
    showCreateProjectModal: false,
    createProjectName: "",
  },

  async onLoad() {
    await this.refreshProps();
  },

  async onShow() {
    await expireTimedOutOrders();
    await this.refreshProps();

    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  async refreshProps() {
    try {
      const props = await listProps();
      this.setData(
        {
          props,
          styleOptions: ["全部", ...uniqueValues(props, "style")],
          typeOptions: ["全部", ...uniqueValues(props, "type")],
          styleIndex: 0,
          typeIndex: 0,
        },
        () => this.applyFilters()
      );
    } catch (err) {
      wx.showToast({ title: "加载道具失败", icon: "none" });
    }
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: (e.detail.value || "").trim() }, () => this.applyFilters());
  },

  setFilter(e) {
    this.setData({ activeFilter: e.currentTarget.dataset.filter }, () => this.applyFilters());
  },

  onStyleChange(e) {
    const styleIndex = Number(e.detail.value || 0);
    this.setData(
      {
        styleIndex,
        selectedStyle: this.data.styleOptions[styleIndex] || "全部",
      },
      () => this.applyFilters()
    );
  },

  onTypeChange(e) {
    const typeIndex = Number(e.detail.value || 0);
    this.setData(
      {
        typeIndex,
        selectedType: this.data.typeOptions[typeIndex] || "全部",
      },
      () => this.applyFilters()
    );
  },

  resetQuickFilters() {
    this.setData(
      {
        selectedStyle: "全部",
        selectedType: "全部",
        styleIndex: 0,
        typeIndex: 0,
      },
      () => this.applyFilters()
    );
  },

  applyFilters() {
    const { props, searchKeyword, activeFilter, selectedStyle, selectedType } = this.data;
    const keyword = searchKeyword.toLowerCase();

    let filtered = [...props];

    if (keyword) {
      filtered = filtered.filter((item) => {
        const name = (item.name || "").toLowerCase();
        const material = (item.material || "").toLowerCase();
        return name.includes(keyword) || material.includes(keyword);
      });
    }

    if (activeFilter === "idle") {
      filtered = filtered.filter((item) => item.status === PROP_STATUS.IDLE);
    }

    if (activeFilter === "renting") {
      filtered = filtered.filter((item) => item.status === PROP_STATUS.RENTING);
    }

    if (activeFilter === "locked") {
      filtered = filtered.filter((item) => item.status === PROP_STATUS.LOCKED);
    }

    if (selectedStyle !== "全部") {
      filtered = filtered.filter((item) => item.style === selectedStyle);
    }

    if (selectedType !== "全部") {
      filtered = filtered.filter((item) => item.type === selectedType);
    }

    this.setData({ filteredProps: filtered });
  },

  viewPropDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/prop-detail/index?id=${id}` });
  },

  async addToProject(e) {
    const propId = Number(e.currentTarget.dataset.id);

    try {
      const projects = (await listProjects()).filter((item) => item.status === "editing");
      this.setData({
        showProjectPicker: true,
        pickerProjects: projects,
        pendingPropId: propId,
      });
    } catch (err) {
      wx.showToast({ title: err.message || "加载方案失败", icon: "none" });
    }
  },

  closeProjectPicker() {
    this.setData({
      showProjectPicker: false,
      pickerProjects: [],
      pendingPropId: null,
    });
  },

  async chooseProject(e) {
    const projectId = Number(e.currentTarget.dataset.id);
    const propId = this.data.pendingPropId;
    if (!projectId || !propId) return;

    try {
      await addPropToProject(projectId, propId);
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
    const name = (this.data.createProjectName || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入方案名称", icon: "none" });
      return;
    }

    try {
      const project = await createProject({ name });
      const propId = this.data.pendingPropId;
      if (propId) {
        await addPropToProject(project.id, propId);
      }
      this.closeCreateProjectModal();
      this.closeProjectPicker();
      wx.showToast({ title: propId ? "方案已创建并加入道具" : "方案已创建", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "创建方案失败", icon: "none" });
    }
  },

});
