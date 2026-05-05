const { ENABLE_MOCK } = require("../config/env");
const { KEYS, getItem, setItem } = require("../store/local-db");
const { request } = require("./http");

const REAL_WECHAT_ACCOUNT_KEY = "wechat_real";

const ROLE_META = {
  demander: { label: "租赁方", roleLabel: "租赁端" },
  supplier: { label: "工厂方", roleLabel: "工厂端" },
  admin: { label: "管理员", roleLabel: "管理员" },
};

const DEFAULT_DEMO_ACCOUNTS = [
  {
    accountKey: "demander_demo",
    nickname: "租赁端演示账号",
    description: "已绑定 demander，可直接体验租赁端完整下单流程",
    roleBindings: ["demander"],
    registerStatus: "active",
  },
  {
    accountKey: "admin_demo",
    nickname: "管理员演示账号",
    description: "已绑定 admin + supplier，可进入管理员端并切换工厂视角",
    roleBindings: ["admin", "supplier"],
    registerStatus: "active",
  },
  {
    accountKey: "new_user_demo",
    nickname: "新用户演示账号",
    description: "首次微信登录用户，无任何业务角色，可走邀请码入驻流程",
    roleBindings: [],
    registerStatus: "new",
  },
];

const REAL_WECHAT_ACCOUNT = {
  accountKey: REAL_WECHAT_ACCOUNT_KEY,
  nickname: "微信真实账号",
  description: "通过 wx.login 和后端 code2Session 获取 openid，走正式注册/登录流程",
  roleBindings: [],
  registerStatus: "new",
  realWechat: true,
};

function getSelectedAccount() {
  return getItem(KEYS.SELECTED_ACCOUNT, "demander_demo");
}

function setSelectedAccount(accountKey) {
  setItem(KEYS.SELECTED_ACCOUNT, accountKey || "demander_demo");
}

function getSelectedRole() {
  return getItem(KEYS.SELECTED_ROLE, "");
}

function setSelectedRole(role) {
  setItem(KEYS.SELECTED_ROLE, role || "");
}

function getAuthToken() {
  return getItem(KEYS.AUTH_TOKEN, "");
}

function setAuthToken(token) {
  setItem(KEYS.AUTH_TOKEN, token || "");
}

function clearAuthSession() {
  setAuthToken("");
  setSelectedRole("");
  updateUser(null);
}

function getUser() {
  return getItem(KEYS.USER, null);
}

function updateUser(nextUser) {
  setItem(KEYS.USER, nextUser);
}

function getCachedDemoAccounts() {
  const accounts = getItem(KEYS.DEMO_ACCOUNTS, DEFAULT_DEMO_ACCOUNTS);
  return ensureRealWechatAccount(accounts);
}

function setCachedDemoAccounts(accounts) {
  setItem(KEYS.DEMO_ACCOUNTS, ensureRealWechatAccount(accounts));
}

function ensureRealWechatAccount(accounts = []) {
  const list = Array.isArray(accounts) && accounts.length ? accounts : DEFAULT_DEMO_ACCOUNTS;
  if (list.some((item) => item.accountKey === REAL_WECHAT_ACCOUNT_KEY)) {
    return list;
  }
  return list.concat(REAL_WECHAT_ACCOUNT);
}

function normalizeUser(raw, role, account) {
  const meta = ROLE_META[role] || ROLE_META.demander;
  const roleBindings = raw.roleBindings || (account && account.roleBindings) || [];
  const isRealWechat = (account && account.accountKey === REAL_WECHAT_ACCOUNT_KEY) || raw.mock === false;
  return {
    ...raw,
    id: raw.id,
    name: raw.nickname || (account && account.nickname) || meta.label,
    nickname: raw.nickname || (account && account.nickname) || meta.label,
    avatar: raw.avatarUrl || "/images/avatar.png",
    avatarUrl: raw.avatarUrl || "/images/avatar.png",
    role: role ? meta.roleLabel : "未选择",
    roleCode: role || "",
    accountName: isRealWechat ? "微信真实账号" : ((account && account.nickname) || meta.label),
    accountDescription: isRealWechat ? "真实微信 openid 绑定账号" : ((account && account.description) || ""),
    certification: raw.realnameVerified ? "已认证" : "未认证",
    studentCertification: raw.studentVerified ? "已认证" : "未认证",
    credit: raw.realnameVerified ? 98 : 80,
    roleBindings,
    registerStatus: raw.registerStatus || (account && account.registerStatus) || "new",
    defaultEntry: raw.defaultEntry || "role_select",
    needRoleSelection: !!raw.needRoleSelection,
    factoryAuditStatus: raw.factoryAuditStatus || "",
    factoryAuditRejectReason: raw.factoryAuditRejectReason || "",
  };
}

function resolveEntryPath(defaultEntry) {
  switch (defaultEntry) {
    case "admin_home":
      return "/pages/warehouse/index";
    case "factory_home":
      return "/pages/project/index";
    case "demander_home":
      return "/pages/home/index";
    case "factory_audit_status":
      return "/pages/factory-audit-status/index";
    default:
      return "/pages/role/index";
  }
}

function shouldSetupProfile(user = {}) {
  const accountKey = getSelectedAccount();
  return accountKey === REAL_WECHAT_ACCOUNT_KEY
    && user.needRoleSelection
    && (!user.phone || !user.nickname || user.nickname.startsWith("微信用户"));
}

async function fetchDemoAccounts() {
  if (!ENABLE_MOCK) {
    return ensureRealWechatAccount(DEFAULT_DEMO_ACCOUNTS);
  }

  try {
    const data = await request({ url: "/auth/demo-accounts" });
    const accounts = ensureRealWechatAccount(Array.isArray(data) && data.length ? data : DEFAULT_DEMO_ACCOUNTS);
    setCachedDemoAccounts(accounts);
    return accounts;
  } catch (err) {
    return getCachedDemoAccounts();
  }
}

function getDemoAccountByKey(accountKey) {
  if (accountKey === REAL_WECHAT_ACCOUNT_KEY) return REAL_WECHAT_ACCOUNT;
  return getCachedDemoAccounts().find((item) => item.accountKey === accountKey) || DEFAULT_DEMO_ACCOUNTS[0];
}

async function fetchUser() {
  const data = await request({ url: "/users/me" });
  const actualRole = (data && data.currentRole) || "";
  const account = getDemoAccountByKey(getSelectedAccount());
  const user = normalizeUser(data || {}, actualRole, account);
  setSelectedRole(actualRole);
  updateUser(user);
  return user;
}

async function loginAsAccount(accountKey = getSelectedAccount(), options = {}) {
  const loginResult = await request({
    url: "/auth/demo-login",
    method: "POST",
    data: { accountKey, resetDemo: !!options.resetDemo },
  });
  setAuthToken((loginResult && loginResult.token) || "");
  setSelectedAccount(accountKey);
  setSelectedRole((loginResult && loginResult.currentRole) || "");
  return fetchUser();
}

async function loginAsRole(role, accountKey = getSelectedAccount()) {
  const loginResult = await request({
    url: "/auth/demo-login",
    method: "POST",
    data: { accountKey, role },
  });
  setAuthToken((loginResult && loginResult.token) || "");
  setSelectedAccount(accountKey);
  setSelectedRole((loginResult && loginResult.currentRole) || role || "");
  return fetchUser();
}

async function loginWithWechatCode(code, desiredRole = "", options = {}) {
  const loginResult = await request({
    url: "/auth/wechat-login",
    method: "POST",
    data: { code, desiredRole, realWechat: !!options.realWechat },
  });
  setAuthToken((loginResult && loginResult.token) || "");
  if (options.realWechat) {
    setSelectedAccount(REAL_WECHAT_ACCOUNT_KEY);
  }
  setSelectedRole((loginResult && loginResult.currentRole) || desiredRole || "");
  return fetchUser();
}

function runWxLogin() {
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || typeof wx.login !== "function") {
      reject(new Error("当前环境不支持微信登录"));
      return;
    }

    wx.login({
      success(res) {
        if (!res.code) {
          reject(new Error("微信登录未返回 code"));
          return;
        }
        resolve(res.code);
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || "微信登录失败"));
      },
    });
  });
}

async function loginCurrentAccount(options = {}) {
  const accountKey = getSelectedAccount();
  if (accountKey === REAL_WECHAT_ACCOUNT_KEY || options.realWechat) {
    const code = await runWxLogin();
    return loginWithWechatCode(code, "", { realWechat: true });
  }
  if (ENABLE_MOCK) {
    return loginAsAccount(accountKey, options);
  }
  const code = await runWxLogin();
  return loginWithWechatCode(code, "");
}

async function loginByRole(role) {
  const accountKey = getSelectedAccount();
  if (accountKey === REAL_WECHAT_ACCOUNT_KEY) {
    const code = await runWxLogin();
    return loginWithWechatCode(code, role, { realWechat: true });
  }
  if (ENABLE_MOCK) {
    return loginAsRole(role, accountKey);
  }
  const code = await runWxLogin();
  return loginWithWechatCode(code, role);
}

async function loginRealWechat() {
  clearAuthSession();
  setSelectedAccount(REAL_WECHAT_ACCOUNT_KEY);
  const code = await runWxLogin();
  return loginWithWechatCode(code, "", { realWechat: true });
}

async function bindDemanderRole() {
  await request({
    url: "/users/bind-demander",
    method: "POST",
  });
  // 绑定角色后必须重新签发带 demander 角色的 token。
  // 否则首进项目页时，后端仍会按旧的“无角色 token”拒绝方案接口。
  return loginByRole("demander");
}

async function updateUserProfile(data = {}) {
  const updated = await request({
    url: "/users/profile",
    method: "PUT",
    data: {
      nickname: data.nickname || "",
      avatarUrl: data.avatarUrl || "",
    },
  });
  const role = (updated && updated.currentRole) || getSelectedRole();
  const user = normalizeUser(updated || {}, role, getDemoAccountByKey(getSelectedAccount()));
  updateUser(user);
  return user;
}

async function bindWechatPhone(code) {
  const updated = await request({
    url: "/users/phone/wechat",
    method: "POST",
    data: { code },
  });
  const role = (updated && updated.currentRole) || getSelectedRole();
  const user = normalizeUser(updated || {}, role, getDemoAccountByKey(getSelectedAccount()));
  updateUser(user);
  return user;
}

async function verifyFactoryInvite(code) {
  return request({
    url: "/users/factory-invite/verify",
    method: "POST",
    data: { code },
  });
}

async function submitFactoryApplication(data) {
  return request({
    url: "/users/factory-applications",
    method: "POST",
    data,
  });
}

async function getFactoryAuditStatus() {
  return request({ url: "/users/factory-audit-status" });
}

module.exports = {
  getUser,
  updateUser,
  getSelectedAccount,
  setSelectedAccount,
  getSelectedRole,
  setSelectedRole,
  getAuthToken,
  setAuthToken,
  clearAuthSession,
  getDemoAccountByKey,
  fetchDemoAccounts,
  fetchUser,
  loginCurrentAccount,
  loginAsAccount,
  loginAsRole,
  loginWithWechatCode,
  loginRealWechat,
  loginByRole,
  bindDemanderRole,
  updateUserProfile,
  bindWechatPhone,
  verifyFactoryInvite,
  submitFactoryApplication,
  getFactoryAuditStatus,
  resolveEntryPath,
  shouldSetupProfile,
  REAL_WECHAT_ACCOUNT_KEY,
};
