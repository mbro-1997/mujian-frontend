const {
  getOrderById,
  submitOrderReview,
  submitOrderDispute,
  scanOutboundQrCode,
  scanReturnQrCode,
} = require("../../services/order.service");
const { ORDER_STATUS } = require("../../constants/status");
const { getSelectedRole } = require("../../services/user.service");
const { resolveQrCode } = require("../../services/qrcode.service");
const { scanQrCode } = require("../../utils/qr-scan");

function buildScanState(order) {
  if (!order) return {};
  const total = Number(order.propCount || 0);
  const outboundScannedCount = Number(order.outboundScannedCount || 0);
  const returnScannedCount = Number(order.returnScannedCount || 0);
  return {
    canScanOutboundNow: !!order.canScanOutbound
      && order.status === ORDER_STATUS.WAIT_PICKUP
      && total > 0
      && outboundScannedCount < total,
    canScanReturnNow: !!order.canScanReturn
      && order.status === ORDER_STATUS.RENTING
      && total > 0
      && outboundScannedCount >= total
      && returnScannedCount < total,
    showOutboundScan: order.status === ORDER_STATUS.WAIT_PICKUP
      || order.status === ORDER_STATUS.RENTING
      || outboundScannedCount > 0,
    showReturnScan: order.status === ORDER_STATUS.WAIT_PICKUP
      || order.status === ORDER_STATUS.RENTING
      || returnScannedCount > 0,
    outboundDisabledText: total > 0 && outboundScannedCount >= total ? "出库已完成" : "出库扫码",
    returnDisabledText: outboundScannedCount < total ? "待全部出库" : "入库已完成",
  };
}

function money(value) {
  const amount = Number(value || 0);
  return amount.toFixed(2).replace(/\.00$/, "");
}

function calcPlatformAmount(amount) {
  return Math.floor(Number(amount || 0) * 20) / 100;
}

function calcSupplierAmount(amount) {
  return Number(amount || 0) - calcPlatformAmount(amount);
}

function latestResolvedDispute(order) {
  const disputes = order?.disputes || [];
  return disputes.find((item) => item.status === "resolved" || item.status === "closed") || null;
}

function buildFundNotice(order, role) {
  if (!order) return null;
  const price = Number(order.price || 0);
  const deposit = Number(order.deposit || 0);
  const total = price + deposit;
  const dispute = latestResolvedDispute(order);

  if (order.status === ORDER_STATUS.CANCELLED_MANUAL) {
    if (role === "demander") {
      return {
        key: `order-fund-cancel-${order.id}`,
        title: "订单已驳回，款项将退回",
        content: `工厂已驳回该订单。租金 ¥${money(price)} 与押金 ¥${money(deposit)}，合计 ¥${money(total)} 将原路退回至您的微信支付账户，预计 1-3 个工作日到账。`,
      };
    }
    return {
      key: `order-fund-cancel-${order.id}-${role}`,
      title: "订单已驳回",
      content: "该订单已驳回，平台将向租赁方原路退回租金和押金，本订单不产生工厂结算。",
    };
  }

  if (dispute) {
    const claim = Number(dispute.claimAmount || 0);
    if (dispute.status === "closed") {
      return {
        key: `order-fund-dispute-${order.id}-${dispute.id}-closed-${role}`,
        title: "仲裁未通过",
        content: role === "supplier"
          ? `管理员已拒绝本次仲裁。订单将按正常规则结算，工厂预计获得实际费用 80%，约 ¥${money(calcSupplierAmount(price))}，预计 1-3 个工作日进入结算账户。`
          : `管理员已拒绝本次仲裁。订单将按正常规则结算，押金 ¥${money(deposit)} 预计 1-3 个工作日原路退回至您的微信支付账户。`,
      };
    }

    if (dispute.applicantRole === "demander") {
      const compensation = Math.min(claim, price);
      const remainingRent = Math.max(price - compensation, 0);
      return {
        key: `order-fund-dispute-${order.id}-${dispute.id}-resolved-${role}`,
        title: role === "demander" ? "仲裁成功" : "仲裁已裁定",
        content: role === "supplier"
          ? `管理员同意租赁方仲裁。平台将从实际费用中扣除赔付 ¥${money(compensation)}，剩余实际费用 ¥${money(remainingRent)} 按平台 20% / 工厂 80% 结算，工厂预计获得 ¥${money(calcSupplierAmount(remainingRent))}。`
          : `管理员同意您的仲裁。押金 ¥${money(deposit)} 与赔付 ¥${money(compensation)} 将原路退回至您的微信支付账户，预计 1-3 个工作日到账。`,
      };
    }

    if (dispute.applicantRole === "supplier") {
      const compensation = Math.min(claim, deposit);
      const restDeposit = Math.max(deposit - compensation, 0);
      return {
        key: `order-fund-dispute-${order.id}-${dispute.id}-resolved-${role}`,
        title: role === "supplier" ? "仲裁成功" : "仲裁已裁定",
        content: role === "supplier"
          ? `管理员同意您的仲裁。工厂预计获得实际费用 80%（约 ¥${money(calcSupplierAmount(price))}）及押金赔付 ¥${money(compensation)}，预计 1-3 个工作日进入结算账户。`
          : `管理员同意工厂方仲裁。平台将从押金中扣除赔付 ¥${money(compensation)}，剩余押金 ¥${money(restDeposit)} 将原路退回至您的微信支付账户，预计 1-3 个工作日到账。`,
      };
    }
  }

  if (order.status === ORDER_STATUS.COMPLETED) {
    return {
      key: `order-fund-completed-${order.id}-${role}`,
      title: "订单已完成，结算处理中",
      content: role === "supplier"
        ? `双方评价已完成。工厂预计获得实际费用 80%，约 ¥${money(calcSupplierAmount(price))}，预计 1-3 个工作日进入结算账户。`
        : `双方评价已完成。押金 ¥${money(deposit)} 将原路退回至您的微信支付账户，预计 1-3 个工作日到账。`,
    };
  }

  return null;
}

function showOnceNotice(notice) {
  if (!notice || !notice.key) return;
  const storageKey = `muhou_notice_${notice.key}`;
  if (wx.getStorageSync(storageKey)) return;
  wx.setStorageSync(storageKey, 1);
  wx.showModal({
    title: notice.title,
    content: notice.content,
    showCancel: false,
    confirmText: "我知道了",
  });
}

Page({
  data: {
    orderId: null,
    order: null,
    isSupplier: false,
    rejected: false,
    showScanModal: false,
    scanMode: "outbound",
    scanQrCodeId: "",
    scanPropName: "",
    showReviewModal: false,
    reviewPropScore: 5,
    reviewCounterpartyScore: 5,
    reviewContent: "",
    showDisputeModal: false,
    disputeReason: "",
    disputeAmount: "",
    disputeImages: [],
    disputeMaxText: "",
  },

  async onLoad(options) {
    const orderId = Number(options.id || 0);
    this.setData({ orderId, isSupplier: getSelectedRole() === "supplier" });
    await this.loadOrder();
  },

  async loadOrder() {
    if (!this.data.orderId) {
      wx.showToast({ title: "订单不存在", icon: "none" });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }

    try {
      const rawOrder = await getOrderById(this.data.orderId);
      const order = {
        ...rawOrder,
        ...buildScanState(rawOrder),
      };
      this.setData({
        order,
        rejected: order.status === ORDER_STATUS.CANCELLED_MANUAL,
      });
      setTimeout(() => showOnceNotice(buildFundNotice(order, getSelectedRole())), 150);
    } catch (err) {
      wx.showToast({ title: err.message || "加载订单失败", icon: "none" });
      setTimeout(() => wx.navigateBack(), 600);
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/project/index" });
  },

  openPropDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/prop-detail/index?id=${id}` });
  },

  openReviewModal() {
    if (!this.data.order || !this.data.order.canReview) return;
    this.setData({
      showReviewModal: true,
      reviewPropScore: 5,
      reviewCounterpartyScore: 5,
      reviewContent: "",
    });
  },

  async openScanModal(e) {
    const mode = e.currentTarget.dataset.mode;
    const order = this.data.order;
    if (!order) return;
    if (mode === "outbound" && !order.canScanOutboundNow) {
      wx.showToast({ title: order.outboundDisabledText || "当前不能出库扫码", icon: "none" });
      return;
    }
    if (mode === "return" && !order.canScanReturnNow) {
      wx.showToast({ title: order.returnDisabledText || "当前不能入库扫码", icon: "none" });
      return;
    }

    try {
      const { qrCodeId } = await scanQrCode();
      let scanPropName = "";
      try {
        const resolved = await resolveQrCode(qrCodeId);
        scanPropName = resolved.propName || "";
      } catch (err) {
        scanPropName = "";
      }
      this.setData({
        showScanModal: true,
        scanMode: mode,
        scanQrCodeId: qrCodeId,
        scanPropName,
      });
    } catch (err) {
      wx.showToast({ title: err.message || "扫码失败", icon: "none" });
    }
  },

  closeScanModal() {
    this.setData({ showScanModal: false, scanQrCodeId: "", scanPropName: "" });
  },

  async confirmScannedQr() {
    const { order, scanMode, scanQrCodeId } = this.data;
    if (!order || !scanQrCodeId) return;

    try {
      await (scanMode === "outbound"
        ? scanOutboundQrCode(order.id, scanQrCodeId)
        : scanReturnQrCode(order.id, scanQrCodeId));
      this.closeScanModal();
      await this.loadOrder();
      wx.showToast({ title: scanMode === "outbound" ? "出库成功" : "入库成功", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "扫码操作失败", icon: "none" });
    }
  },

  closeReviewModal() {
    this.setData({ showReviewModal: false, reviewPropScore: 5, reviewCounterpartyScore: 5, reviewContent: "" });
  },

  openDisputeModal() {
    const order = this.data.order;
    if (!order || !order.canApplyDispute) {
      wx.showToast({ title: "当前订单节点不能发起仲裁", icon: "none" });
      return;
    }
    this.setData({
      showDisputeModal: true,
      disputeReason: "",
      disputeAmount: "",
      disputeImages: [],
      disputeMaxText: getSelectedRole() === "supplier"
        ? `工厂向用户索赔，最高不超过订单押金 ¥${money(order.deposit)}。`
        : `租赁方向工厂索赔，最高不超过订单实际费用 ¥${money(order.price)}。`,
    });
  },

  closeDisputeModal() {
    this.setData({ showDisputeModal: false, disputeReason: "", disputeAmount: "", disputeImages: [], disputeMaxText: "" });
  },

  updateDisputeReason(e) {
    this.setData({ disputeReason: e.detail.value || "" });
  },

  updateDisputeAmount(e) {
    this.setData({ disputeAmount: e.detail.value || "" });
  },

  chooseDisputeImages() {
    const remain = 3 - this.data.disputeImages.length;
    if (remain <= 0) return;
    wx.chooseImage({
      count: remain,
      sizeType: ["compressed", "original"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const next = [...this.data.disputeImages, ...(res.tempFilePaths || [])].slice(0, 3);
        this.setData({ disputeImages: next });
      },
    });
  },

  removeDisputeImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const next = [...this.data.disputeImages];
    next.splice(index, 1);
    this.setData({ disputeImages: next });
  },

  previewDisputeImage(e) {
    const current = e.currentTarget.dataset.url;
    wx.previewImage({ current, urls: this.data.disputeImages });
  },

  updateReviewPropScore(e) {
    this.setData({ reviewPropScore: Number(e.currentTarget.dataset.score || 5) });
  },

  updateReviewCounterpartyScore(e) {
    this.setData({ reviewCounterpartyScore: Number(e.currentTarget.dataset.score || 5) });
  },

  updateReviewContent(e) {
    this.setData({ reviewContent: e.detail.value || "" });
  },

  async submitReview() {
    if (!this.data.orderId) return;
    try {
      await submitOrderReview(this.data.orderId, {
        propScore: this.data.reviewPropScore,
        counterpartyScore: this.data.reviewCounterpartyScore,
        content: this.data.reviewContent,
        reviewerRole: getSelectedRole(),
      });
      this.closeReviewModal();
      await this.loadOrder();
      const order = this.data.order;
      if (order && order.status === ORDER_STATUS.WAIT_REVIEW) {
        wx.showModal({
          title: "评价已提交",
          content: getSelectedRole() === "supplier"
            ? "请等待租赁方完成评价。双方评价完成后，工厂结算款预计 1-3 个工作日进入结算账户。"
            : "请等待工厂方完成评价。双方评价完成后，押金预计 1-3 个工作日原路退回至您的微信支付账户。",
          showCancel: false,
          confirmText: "我知道了",
        });
      } else {
        const notice = buildFundNotice(order, getSelectedRole());
        if (notice?.key) {
          wx.setStorageSync(`muhou_notice_${notice.key}`, 1);
        }
        wx.showModal({
          title: notice?.title || "评价已提交",
          content: notice?.content || "双方评价已完成，平台将按订单规则处理押金和结算款，预计 1-3 个工作日完成。",
          showCancel: false,
          confirmText: "我知道了",
        });
      }
    } catch (err) {
      wx.showToast({ title: err.message || "评价失败", icon: "none" });
    }
  },

  async submitDispute() {
    const order = this.data.order;
    if (!order) return;
    const reason = (this.data.disputeReason || "").trim();
    const claimAmount = Number(this.data.disputeAmount || 0);
    const isSupplier = getSelectedRole() === "supplier";
    const maxClaimAmount = isSupplier ? Number(order.deposit || 0) : Number(order.price || 0);
    if (!reason) {
      wx.showToast({ title: "请填写仲裁原因", icon: "none" });
      return;
    }
    if (Number.isNaN(claimAmount) || claimAmount < 0) {
      wx.showToast({ title: "仲裁金额不能小于 0", icon: "none" });
      return;
    }
    if (claimAmount > maxClaimAmount) {
      wx.showToast({ title: isSupplier ? "工厂索赔金额不能超过押金" : "租赁方索赔金额不能超过实际费用", icon: "none" });
      return;
    }
    try {
      const updated = await submitOrderDispute(order.id, {
        reason,
        claimAmount,
        evidenceUrls: this.data.disputeImages.join(","),
      });
      this.closeDisputeModal();
      this.setData({ order: { ...updated, ...buildScanState(updated) } });
      wx.showToast({ title: "仲裁申请已提交", icon: "success" });
    } catch (err) {
      wx.showToast({ title: err.message || "提交仲裁失败", icon: "none" });
    }
  },
});
