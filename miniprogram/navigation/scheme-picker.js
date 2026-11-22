const session = require("../session/storage");
const login = require("./login-page");

module.exports = {
  openSchemePicker(prop) {
    if (!prop || this.data.schemeProp) return;
    if (!session.token()) {
      this.schemeLoginId = prop.id;
      return this.login();
    }
    this.setData({ schemeProp: prop });
    this.getTabBar?.()?.setData({ hidden: true });
  },
  closeSchemePicker() {
    this.setData({ schemeProp: null });
    this.getTabBar?.()?.setData({ hidden: false });
  },
  closeLogin() {
    this.schemeLoginId = "";
    login.closeLogin.call(this);
  },
  async loginSucceeded(event) {
    const id = this.schemeLoginId;
    this.schemeLoginId = "";
    await login.loginSucceeded.call(this, event);
    if (!id || event.detail.context.roleCode !== "demander" || event.detail.context.accessMode !== "normal") return;
    if (this.data.id === id && this.data.verified) this.unavailable();
    else if (this.data.items) this.joinScheme({ detail: { id } });
  },
};
