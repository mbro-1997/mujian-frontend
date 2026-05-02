const { getSelectedRole } = require("../services/user.service");

Component({
  data: {
    selected: 0,
    tabs: [],
  },

  lifetimes: {
    attached() {
      this.updateTabs();
    },
  },

  pageLifetimes: {
    show() {
      this.updateTabs();
    },
  },

  methods: {
    updateTabs() {
      const selectedRole = getSelectedRole() || "demander";
      let tabs = [];

      if (selectedRole === "admin") {
        tabs = [
          {
            pagePath: "/pages/warehouse/index",
            text: "审核中心",
            iconPath: "/images/icons/business.png",
            selectedIconPath: "/images/icons/business-active.png",
          },
          {
            pagePath: "/pages/project/index",
            text: "仲裁中心",
            iconPath: "/images/icons/examples.png",
            selectedIconPath: "/images/icons/examples-active.png",
          },
          {
            pagePath: "/pages/publish/index",
            text: "运营管理",
            iconPath: "/images/icons/goods.png",
            selectedIconPath: "/images/icons/goods-active.png",
          },
          {
            pagePath: "/pages/mine/index",
            text: "我的",
            iconPath: "/images/icons/usercenter.png",
            selectedIconPath: "/images/icons/usercenter-active.png",
          },
        ];
      } else if (selectedRole === "supplier") {
        tabs = [
          {
            pagePath: "/pages/project/index",
            text: "订单",
            iconPath: "/images/icons/examples.png",
            selectedIconPath: "/images/icons/examples-active.png",
          },
          {
            pagePath: "/pages/warehouse/index",
            text: "仓库",
            iconPath: "/images/icons/business.png",
            selectedIconPath: "/images/icons/business-active.png",
          },
          {
            pagePath: "/pages/publish/index",
            text: "发布",
            iconPath: "/images/icons/goods.png",
            selectedIconPath: "/images/icons/goods-active.png",
          },
          {
            pagePath: "/pages/mine/index",
            text: "我的",
            iconPath: "/images/icons/usercenter.png",
            selectedIconPath: "/images/icons/usercenter-active.png",
          },
        ];
      } else {
        tabs = [
          {
            pagePath: "/pages/home/index",
            text: "首页",
            iconPath: "/images/icons/home.png",
            selectedIconPath: "/images/icons/home-active.png",
          },
          {
            pagePath: "/pages/project/index",
            text: "项目",
            iconPath: "/images/icons/examples.png",
            selectedIconPath: "/images/icons/examples-active.png",
          },
          {
            pagePath: "/pages/mine/index",
            text: "我的",
            iconPath: "/images/icons/usercenter.png",
            selectedIconPath: "/images/icons/usercenter-active.png",
          },
        ];
      }

      const pages = getCurrentPages();
      const currentRoute = pages.length ? `/${pages[pages.length - 1].route}` : tabs[0].pagePath;
      const selectedIndex = Math.max(0, tabs.findIndex((tab) => tab.pagePath === currentRoute));

      this.setData({ tabs, selected: selectedIndex });
    },

    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
      const tab = this.data.tabs[index];
      if (!tab) return;
      this.setData({ selected: index });
      wx.switchTab({ url: tab.pagePath });
    },
  },
});
