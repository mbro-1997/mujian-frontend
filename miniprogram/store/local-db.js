const { buildSeedData } = require("../mock/seed");
const { PROP_STATUS, PROJECT_STATUS, ORDER_STATUS } = require("../constants/status");

const KEYS = {
  PROPS: "props",
  PROJECTS: "projects",
  ORDERS: "orders",
  USER: "user",
  DEMO_ACCOUNTS: "demoAccounts",
  SELECTED_ACCOUNT: "selectedAccount",
  SELECTED_ROLE: "selectedRole",
  AUTH_TOKEN: "authToken",
  PENDING_QR_CODE_ID: "pendingQrCodeId",
  ROLE_ENTRY_HOLD_UNTIL: "roleEntryHoldUntil",
  INITED: "mock_inited",
};

const LEGACY_PROP_STATUS = {
  空闲: PROP_STATUS.IDLE,
  租赁中: PROP_STATUS.RENTING,
  已下架: PROP_STATUS.OFFLINE,
  已锁定: PROP_STATUS.LOCKED,
};

const LEGACY_PROJECT_STATUS = {
  待支付: PROJECT_STATUS.EDITING,
  编辑中: PROJECT_STATUS.EDITING,
  已支付: PROJECT_STATUS.ORDERED,
  已下单: PROJECT_STATUS.ORDERED,
};

const LEGACY_ORDER_STATUS = {
  待支付: ORDER_STATUS.PENDING_FACTORY_CONFIRM,
  待工厂确认: ORDER_STATUS.PENDING_FACTORY_CONFIRM,
  已支付: ORDER_STATUS.WAIT_PICKUP,
  待取货: ORDER_STATUS.WAIT_PICKUP,
  租赁中: ORDER_STATUS.RENTING,
  待评价: ORDER_STATUS.WAIT_REVIEW,
  已完成: ORDER_STATUS.COMPLETED,
  超时取消: ORDER_STATUS.CANCELLED_TIMEOUT,
};

function normalizePropStatus(status) {
  return LEGACY_PROP_STATUS[status] || status || PROP_STATUS.IDLE;
}

function normalizeProjectStatus(status) {
  return LEGACY_PROJECT_STATUS[status] || status || PROJECT_STATUS.EDITING;
}

function normalizeOrderStatus(status) {
  return LEGACY_ORDER_STATUS[status] || status || ORDER_STATUS.PENDING_FACTORY_CONFIRM;
}

function withPropDefaults(item = {}) {
  return {
    style: "通用",
    type: "道具",
    image: "/images/default-goods-image.png",
    fireRating: "",
    transport: "",
    vehicle: "",
    ...item,
    status: normalizePropStatus(item.status),
  };
}

function withProjectDefaults(item = {}) {
  return {
    description: "",
    propIds: [],
    createdAt: Date.now(),
    ...item,
    status: normalizeProjectStatus(item.status),
  };
}

function withOrderDefaults(item = {}) {
  const now = Date.now();
  return {
    propIds: [],
    outboundScannedPropIds: [],
    returnScannedPropIds: [],
    createdAt: now,
    confirmDeadlineAt: now + 60 * 60 * 1000,
    ...item,
    status: normalizeOrderStatus(item.status),
  };
}

function initMockData() {
  const seed = buildSeedData();

  if (!wx.getStorageSync(KEYS.INITED)) {
    wx.setStorageSync(KEYS.PROPS, (seed.props || []).map(withPropDefaults));
    wx.setStorageSync(KEYS.PROJECTS, (seed.projects || []).map(withProjectDefaults));
    wx.setStorageSync(KEYS.ORDERS, (seed.orders || []).map(withOrderDefaults));
    wx.setStorageSync(KEYS.USER, seed.user);
    wx.setStorageSync(KEYS.SELECTED_ACCOUNT, "demander_demo");
    wx.setStorageSync(KEYS.SELECTED_ROLE, seed.selectedRole);
    wx.setStorageSync(KEYS.INITED, true);
    return;
  }

  setItem(KEYS.PROPS, getItem(KEYS.PROPS, []).map(withPropDefaults));
  setItem(KEYS.PROJECTS, getItem(KEYS.PROJECTS, []).map(withProjectDefaults));
  setItem(KEYS.ORDERS, getItem(KEYS.ORDERS, []).map(withOrderDefaults));

  if (!getItem(KEYS.PROJECTS, []).length) {
    setItem(KEYS.PROJECTS, (seed.projects || []).map(withProjectDefaults));
  }

  if (!getItem(KEYS.ORDERS, []).length) {
    setItem(KEYS.ORDERS, (seed.orders || []).map(withOrderDefaults));
  }

  if (!getItem(KEYS.USER, null)) {
    setItem(KEYS.USER, seed.user);
  }

  if (!getItem(KEYS.SELECTED_ACCOUNT, "")) {
    setItem(KEYS.SELECTED_ACCOUNT, "demander_demo");
  }

  if (!getItem(KEYS.SELECTED_ROLE, "")) {
    setItem(KEYS.SELECTED_ROLE, seed.selectedRole);
  }
}

function getItem(key, fallback) {
  const data = wx.getStorageSync(key);
  return data === "" || data === undefined ? fallback : data;
}

function setItem(key, value) {
  wx.setStorageSync(key, value);
}

module.exports = {
  KEYS,
  initMockData,
  getItem,
  setItem,
};
