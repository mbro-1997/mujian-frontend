export interface PageResult<T> {
  items: T[];
  total: string;
  page: number;
  pageSize: number;
}
export interface Receipt {
  requestId: string;
  resourceId: string;
  resourceType: string;
  resourceVersion: number;
  operation: string;
  outcome: string;
  appliedAt: string;
}
export interface Amounts {
  rentOriginalFen: number;
  couponDiscountFen: number;
  rentCashFen: number;
  depositFen: number;
  freightFen: number;
  totalFen: number;
}
export interface TradeItem {
  snapshotItemId: string;
  sourceItemId: string;
  skuId: string;
  name: string;
  image: { url: string; expiresAt: string; cacheKey: string } | null;
  assetType: string;
  quantity: number;
  dailyRentFen: number;
  rentOriginalFen: number;
  couponDiscountFen: number;
  rentCashFen: number;
  depositFen: number;
  transportRequirement: string | null;
}
export interface RoutePrice {
  serviceMode: string;
  chargeMode: string;
  vehicleTierId: string | null;
  vehicleTierName: string | null;
  distanceMeter: number | null;
  pricingRuleId: string | null;
  ruleVersion: string | null;
  guideMinFen: number | null;
  guideMaxFen: number | null;
  prepaidFen: number;
  calculatedAt: string | null;
}
export interface Group {
  factoryId: string;
  factoryName: string;
  items: TradeItem[];
  amounts: Amounts;
  outbound: RoutePrice;
  return: RoutePrice;
  buyerRemark: string | null;
}
export interface OrderSummary {
  fulfillmentStage?: string;
  id: string;
  orderNo: string;
  factoryId: string;
  factoryName: string;
  orderStatus: string;
  acceptStatus: string;
  refundStatus: string;
  displayStatus: string;
  version: number;
  startDate: string;
  endDate: string;
  amounts: Amounts;
  paidFen: number;
  refundedFen: number;
  deductedFen: number;
  acceptDeadlineAt: string;
  createdAt: string;
  availableActions: string[];
}
export interface OrderDetail extends OrderSummary {
  batchId: string;
  paymentId: string;
  items: TradeItem[];
  receiver: { name: string; phone: string; regionText: string; detailAddress: string };
  buyerRemark: string | null;
  outbound: RoutePrice;
  return: RoutePrice;
  transportNotice: string;
  acceptedAt: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  refundIds: string[];
  supplyWarning: boolean;
  cancellationRule: {
    ruleCode: string;
    version: string;
    freeHoursExclusive: number;
    middleHoursInclusive: number;
    middleRateBps: number;
    lateRateBps: number;
  };
}
export interface Payment {
  id: string;
  paymentNo: string;
  status: string;
  payableFen: number;
  paidFen: number;
  refundedFen: number;
  expireAt: string;
  paidAt: string | null;
  lastCheckedAt: string | null;
}
export interface CouponReturn {
  status: string;
  userCouponId: string | null;
  returnedAt: string | null;
  validUntil: string | null;
}
export interface Batch {
  id: string;
  batchNo: string;
  checklistId: string;
  status: string;
  version: number;
  amounts: Amounts;
  payment: Payment;
  orderIds: string[];
  refundIds: string[];
  recoveryMode: string;
  nextAction: string;
  canContinuePay: boolean;
  canCancelPayment: boolean;
  holdExpireAt: string;
  createdAt: string;
  couponReturn: CouponReturn;
}
export interface Refund {
  id: string;
  refundNo: string;
  businessType: string;
  businessId: string;
  paymentId: string;
  suborderId: string;
  type: string;
  status: string;
  goodsFen?: number;
  rentFen: number;
  depositFen: number;
  freightFen: number;
  totalFen: number;
  reason: string | null;
  requestedAt: string;
  successAt: string | null;
  failureReasonCode: string | null;
  couponReturn: CouponReturn;
}
export interface RefundTrace {
  refund: Refund;
  channelOutRefundNo: string;
  channelRefundId: string | null;
  lastCheckedAt: string | null;
  attemptCount: number;
}
export interface Suborder {
  id: string;
  factoryId: string;
  orderId: string | null;
  paymentStatus: string;
  fundsStatus: string;
  payableFen: number;
  paidFen: number;
  refundedFen: number;
  channelTradeNo: string;
  channelTransactionId: string | null;
  paidAt: string | null;
  freezeExpireAt: string | null;
  freezeAlertStatus: string;
}
export interface PaymentTrace {
  payment: Payment;
  batch: Batch | null;
  scene: "initial_order"|"extension_rent"|"compensation_supplement"|"custom_order_full_payment";customOrderId?:string; extensionId:string|null;receivableId:string|null;
  suborders: Suborder[];
  refunds: Refund[];
  groups: Group[];
  couponUsageId: string | null;
}
export interface Merchant {
  id: string | null;
  factoryId: string;
  version: number;
  accountStatus: string;
  profitSharingStatus: string;
  subjectName: string;
  subMerchantMasked: string | null;
  lastSyncedAt: string | null;
  onboardingAvailable: boolean;
  nextAction: string;
  actionUrl: string | null;
  reasonCode: string | null;
}
export interface Vehicle {
  id: string;
  version: number;
  tierCode: string;
  tierName: string;
  cargoLengthMm: number;
  cargoWidthMm: number;
  cargoHeightMm: number;
  effectiveVolumeCm3: string;
  safePayloadGram: string;
  sortNo: number;
  status: string;
}
export interface ExtraFee {
  type: string;
  maxAmountFen: number;
}
export interface PriceRule {
  id: string;
  version: number;
  status: string;
  ruleVersion: string;
  cityCode: string;
  vehicleTierId: string;
  distanceMinMeter: number;
  distanceMaxMeter: number | null;
  includedDistanceMeter: number;
  guideMinFen: number;
  guideMaxFen: number;
  ownVehicleSettleFen: number;
  extraKmFen: number | null;
  effectiveAt: string;
  expireAt: string | null;
  extraFees: ExtraFee[];
}
