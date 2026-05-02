const PROP_STATUS = {
  IDLE: "idle",
  LOCKED: "locked",
  RENTING: "renting",
  OFFLINE: "offline",
};

const PROJECT_STATUS = {
  EDITING: "editing",
  ORDERED: "ordered",
};

const ORDER_STATUS = {
  PENDING_FACTORY_CONFIRM: "pending_factory_confirm",
  WAIT_PICKUP: "wait_pickup",
  RENTING: "renting",
  WAIT_REVIEW: "wait_review",
  COMPLETED: "completed",
  CANCELLED_TIMEOUT: "cancelled_timeout",
  CANCELLED_MANUAL: "cancelled_manual",
};

const PROP_STATUS_TEXT = {
  [PROP_STATUS.IDLE]: "空闲",
  [PROP_STATUS.LOCKED]: "已锁定",
  [PROP_STATUS.RENTING]: "租赁中",
  [PROP_STATUS.OFFLINE]: "已下架",
};

const PROJECT_STATUS_TEXT = {
  [PROJECT_STATUS.EDITING]: "编辑中",
  [PROJECT_STATUS.ORDERED]: "已下单",
};

const ORDER_STATUS_TEXT = {
  [ORDER_STATUS.PENDING_FACTORY_CONFIRM]: "待工厂确认",
  [ORDER_STATUS.WAIT_PICKUP]: "待取货",
  [ORDER_STATUS.RENTING]: "租赁中",
  [ORDER_STATUS.WAIT_REVIEW]: "待评价",
  [ORDER_STATUS.COMPLETED]: "已完成",
  [ORDER_STATUS.CANCELLED_TIMEOUT]: "超时取消",
  [ORDER_STATUS.CANCELLED_MANUAL]: "工厂驳回",
};

function getPropStatusText(status) {
  return PROP_STATUS_TEXT[status] || status || "未知状态";
}

function getProjectStatusText(status) {
  return PROJECT_STATUS_TEXT[status] || status || "未知状态";
}

function getOrderStatusText(status) {
  return ORDER_STATUS_TEXT[status] || status || "未知状态";
}

function getPropStatusClass(status) {
  if (status === PROP_STATUS.IDLE) return "status-free";
  if (status === PROP_STATUS.RENTING) return "status-renting";
  return "status-pending";
}

function getOrderStatusClass(status) {
  if (status === ORDER_STATUS.CANCELLED_MANUAL || status === ORDER_STATUS.CANCELLED_TIMEOUT) return "status-danger";
  if (status === ORDER_STATUS.COMPLETED) return "status-free";
  if (status === ORDER_STATUS.RENTING) return "status-renting";
  return "status-pending";
}

function isPropOrderable(status) {
  return status === PROP_STATUS.IDLE;
}

module.exports = {
  PROP_STATUS,
  PROJECT_STATUS,
  ORDER_STATUS,
  PROP_STATUS_TEXT,
  PROJECT_STATUS_TEXT,
  ORDER_STATUS_TEXT,
  getPropStatusText,
  getProjectStatusText,
  getOrderStatusText,
  getPropStatusClass,
  getOrderStatusClass,
  isPropOrderable,
};
