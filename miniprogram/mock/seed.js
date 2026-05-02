const { PROP_STATUS, PROJECT_STATUS, ORDER_STATUS } = require("../constants/status");

function buildSeedData() {
  const now = Date.now();

  const props = [
    {
      id: 1,
      name: "舞台聚光灯",
      image: "/images/default-goods-image.png",
      style: "现代",
      type: "灯光",
      size: "120cm x 80cm",
      material: "金属",
      price: 100,
      deposit: 500,
      fireRating: "B1",
      transport: "防震运输",
      vehicle: "厢式货车",
      status: PROP_STATUS.IDLE,
    },
    {
      id: 2,
      name: "专业音响系统",
      image: "/images/default-goods-image.png",
      style: "现代",
      type: "音响",
      size: "80cm x 60cm",
      material: "塑料+金属",
      price: 150,
      deposit: 800,
      fireRating: "B1",
      transport: "立放固定",
      vehicle: "中型货车",
      status: PROP_STATUS.LOCKED,
    },
    {
      id: 3,
      name: "LED 显示屏",
      image: "/images/default-goods-image.png",
      style: "科技",
      type: "屏幕",
      size: "200cm x 120cm",
      material: "LED+金属",
      price: 200,
      deposit: 1000,
      fireRating: "B1",
      transport: "防震木箱",
      vehicle: "厢式货车",
      status: PROP_STATUS.RENTING,
    },
    {
      id: 4,
      name: "舞台桁架",
      image: "/images/default-goods-image.png",
      style: "工业",
      type: "结构",
      size: "300cm x 200cm",
      material: "铝合金",
      price: 80,
      deposit: 400,
      fireRating: "A",
      transport: "捆扎运输",
      vehicle: "平板车",
      status: PROP_STATUS.RENTING,
    },
    {
      id: 5,
      name: "背景幕布",
      image: "/images/default-goods-image.png",
      style: "传统",
      type: "布景",
      size: "500cm x 300cm",
      material: "阻燃布",
      price: 60,
      deposit: 300,
      fireRating: "B1",
      transport: "卷装运输",
      vehicle: "小型货车",
      status: PROP_STATUS.OFFLINE,
    },
    {
      id: 6,
      name: "无线麦克风套装",
      image: "/images/default-goods-image.png",
      style: "现代",
      type: "音响",
      size: "手持",
      material: "工程塑料",
      price: 50,
      deposit: 200,
      fireRating: "B1",
      transport: "防摔箱",
      vehicle: "小型货车",
      status: PROP_STATUS.IDLE,
    },
  ];

  const projects = [
    {
      id: 1,
      name: "毕业晚会方案",
      propIds: [1, 2, 3],
      status: PROJECT_STATUS.EDITING,
      description: "校园舞台项目",
      createdAt: now - 2 * 3600 * 1000,
    },
  ];

  const orders = [
    {
      id: "ORD-20260413-001",
      projectId: 9001,
      status: ORDER_STATUS.PENDING_FACTORY_CONFIRM,
      price: 150,
      deposit: 800,
      date: "2026-04-13",
      propIds: [2],
      outboundScannedPropIds: [],
      returnScannedPropIds: [],
      createdAt: now - 20 * 60 * 1000,
      confirmDeadlineAt: now + 40 * 60 * 1000,
    },
    {
      id: "ORD-20260412-002",
      projectId: 9002,
      status: ORDER_STATUS.RENTING,
      price: 280,
      deposit: 1400,
      date: "2026-04-12",
      propIds: [3, 4],
      outboundScannedPropIds: [3, 4],
      returnScannedPropIds: [],
      createdAt: now - 2 * 24 * 3600 * 1000,
      confirmDeadlineAt: now - 2 * 24 * 3600 * 1000 + 3600 * 1000,
      confirmedAt: now - 2 * 24 * 3600 * 1000 + 30 * 60 * 1000,
      pickedUpAt: now - 2 * 24 * 3600 * 1000 + 2 * 3600 * 1000,
    },
  ];

  const user = {
    id: 1,
    name: "用户",
    avatar: "/images/avatar.png",
    role: "需求方",
    certification: "未认证",
    credit: 80,
  };

  return {
    props,
    projects,
    orders,
    user,
    selectedRole: "demander",
  };
}

module.exports = {
  buildSeedData,
};
