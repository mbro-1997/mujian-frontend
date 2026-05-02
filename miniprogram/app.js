const { initMockData } = require("./store/local-db");

App({
  onLaunch() {
    initMockData();
  },
  globalData: {
    userInfo: null,
  },
});
