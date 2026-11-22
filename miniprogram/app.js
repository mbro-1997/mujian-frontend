const activity = require("./session/activity");
App({
  globalData: { context: null },
  onShow() {
    activity.show();
  },
  onHide() {
    activity.hide();
  },
});
