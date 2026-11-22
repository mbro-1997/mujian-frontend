<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";
import DeskQueueMetrics from "../../components/DeskQueueMetrics.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import DeskPanel from "../../components/DeskPanel.vue";
import ReturnWarnings from "../fulfillment/ReturnWarnings.vue";
import "./trading.css";
import { ref, computed, onMounted } from "vue";
import { api } from "../../api/http";
import { useRoute } from "vue-router";
import { me } from "../../session/state";
import { useSessionView } from "../../session/view";
import { money, time, query, labels, command, recover, hasPending, tradeError } from "../../api/trading";
import type {
  PageResult,
  OrderSummary,
  OrderDetail,
  Payment,
  PaymentTrace,
  Refund,
  RefundTrace,
  Merchant,
} from "../../api/trading-types";
const props = defineProps<{ kind: "orders" | "payments" | "refunds" | "merchants" }>();
const configs = {
  orders: { title: "租赁订单查询", path: "rental-orders", permission: "order" },
  payments: { title: "支付资金查询", path: "payments", permission: "payment" },
  refunds: { title: "退款追溯", path: "refunds", permission: "refund" },
  merchants: { title: "收付通账户", path: "factory-wechat-accounts", permission: "merchant" },
};
const config = computed(() => configs[props.kind]);
const permitted = computed(() =>
  me.value?.permissions.includes("admin:trade:" + config.value.permission + ":read")
);
const orders = ref<OrderSummary[]>([]),
  payments = ref<Payment[]>([]),
  refunds = ref<Refund[]>([]),
  merchants = ref<Merchant[]>([]);
const order = ref<OrderDetail | null>(null),
  payment = ref<PaymentTrace | null>(null),
  refund = ref<RefundTrace | null>(null),
  merchant = ref<Merchant | null>(null);
const page = ref(1),
  total = ref("0"),
  keyword = ref(""),
  factoryId = ref(""),
  buyerUserId = ref(""),
  status = ref(""),
  businessType = ref(""),
  busy = ref(false),
  message = ref("");
const selected = computed(() => !!(order.value || payment.value || refund.value || merchant.value));
const states = computed(() =>
  props.kind === "orders"
    ? [
        "pending_accept",
        "accepted",
        "pending_receipt",
        "renting",
        "overdue",
        "return_in_transit",
        "return_checking",
        "return_closed",
        "completed",
        "cancelled",
        "refund_exception",
      ]
    : props.kind === "payments"
    ? ["pending", "paying", "success", "closed", "failed"]
    : props.kind === "refunds"
    ? ["pending", "processing", "success", "failed", "cancelled"]
    : ["not_applied", "reviewing", "need_action", "active", "rejected", "frozen", "closed"]
);
function clearDetail() {
  order.value = null;
  payment.value = null;
  refund.value = null;
  merchant.value = null;
}
const view = useSessionView(() => {
  orders.value = [];
  payments.value = [];
  refunds.value = [];
  merchants.value = [];
  clearDetail();
  message.value = "";
  busy.value = false;
});
let round = 0;
async function load(reset = false) {
  if (busy.value || !permitted.value) return;
  if (reset) page.value = 1;
  const owner = view.capture(),
    sequence = ++round;
  busy.value = true;
  message.value = "";
  try {
    const filter = {
      page: page.value,
      pageSize: 20,
      factoryId: factoryId.value || undefined,
      ...(props.kind === "orders"
        ? {
            view: status.value || "all",
            keyword: keyword.value || undefined,
            buyerUserId: buyerUserId.value || undefined,
          }
        : props.kind === "payments"
        ? {
            status: status.value || undefined,
            keyword: keyword.value || undefined,
            buyerUserId: buyerUserId.value || undefined,
          }
        : props.kind === "refunds"
        ? { status: status.value || undefined, businessType: businessType.value || undefined }
        : { accountStatus: status.value || undefined }),
    };
    const path = "/api/admin/" + config.value.path + "?" + query(filter);
    if (props.kind === "orders") {
      const result = await api<PageResult<OrderSummary>>(path);
      if (view.current(owner) && sequence === round) {
        orders.value = result.items;
        total.value = result.total;
      }
    } else if (props.kind === "payments") {
      const result = await api<PageResult<Payment>>(path);
      if (view.current(owner) && sequence === round) {
        payments.value = result.items;
        total.value = result.total;
      }
    } else if (props.kind === "refunds") {
      const result = await api<PageResult<Refund>>(path);
      if (view.current(owner) && sequence === round) {
        refunds.value = result.items;
        total.value = result.total;
      }
    } else {
      const result = await api<PageResult<Merchant>>(path);
      if (view.current(owner) && sequence === round) {
        merchants.value = result.items;
        total.value = result.total;
      }
    }
  } catch (error) {
    if (view.current(owner) && sequence === round) message.value = tradeError(error);
  } finally {
    if (view.current(owner) && sequence === round) busy.value = false;
  }
}
async function open(id: string) {
  if (busy.value || !permitted.value) return;
  const owner = view.capture(),
    sequence = ++round;
  busy.value = true;
  message.value = "";
  clearDetail();
  try {
    const path = "/api/admin/" + config.value.path + "/" + id;
    if (props.kind === "orders") {
      const result = await api<OrderDetail>(path);
      if (view.current(owner) && sequence === round) order.value = result;
    } else if (props.kind === "payments") {
      const result = await api<PaymentTrace>(path);
      if (view.current(owner) && sequence === round) payment.value = result;
    } else if (props.kind === "refunds") {
      const result = await api<RefundTrace>(path);
      if (view.current(owner) && sequence === round) refund.value = result;
    } else {
      const result = await api<Merchant>(path);
      if (view.current(owner) && sequence === round) merchant.value = result;
    }
  } catch (error) {
    if (view.current(owner) && sequence === round) message.value = tradeError(error);
  } finally {
    if (view.current(owner) && sequence === round) busy.value = false;
  }
}
async function sync() {
  if (!merchant.value || busy.value) return;
  const id = merchant.value.factoryId,
    owner = view.capture();
  busy.value = true;
  message.value = "";
  try {
    await command<Merchant>("merchant:" + id, "/api/admin/factory-wechat-accounts/" + id + "/sync", {});
  } catch (error) {
    if (view.current(owner)) message.value = tradeError(error);
  } finally {
    if (view.current(owner)) busy.value = false;
  }
  if (view.current(owner) && !message.value) await open(id);
}
async function recovery() {
  if (!merchant.value) return;
  const id = merchant.value.factoryId,
    owner = view.capture();
  try {
    await recover("merchant:" + id);
    if (view.current(owner)) await open(id);
  } catch (error) {
    if (view.current(owner)) message.value = tradeError(error);
  }
}
function paginate(delta: number) {
  page.value += delta;
  void load();
}
const route = useRoute();
onMounted(async () => {
  await load();
  const id = route.query.id;
  if (props.kind === "payments" && typeof id === "string" && /^[0-9a-f]{32}$/.test(id)) await open(id);
});
function refundLabel(status: string) {
  const text: Record<string, string> = {
    processing: "退款中",
    failed: "退款待处理",
    partial_refunded: "已部分退款",
    full_refunded: "已全额退款",
  };
  return text[status] || labels[status];
}
useDetailScroll(() => selected.value);
function resetFilters() {
  keyword.value = "";
  factoryId.value = "";
  buyerUserId.value = "";
  status.value = "";
  businessType.value = "";
  return load(true);
}
</script>
<template>
  <section class="trade-admin">
    <h1>
      {{
        selected
          ? {
              orders: "租赁订单详情",
              payments: "支付与渠道子单详情",
              refunds: "退款详情",
              merchants: "收款账户详情",
            }[kind]
          : config.title
      }}
    </h1>
    <div class="sub">
      按原交易记录核对金额、状态与来源。资金结果由后台按原渠道号恢复，管理端不改款、不重新发起退款。
    </div>
    <div v-if="!permitted" class="notice">当前账号无此菜单权限。</div>
    <template v-else>
      <div v-if="message" class="notice error" role="alert">{{ message }}</div>
      <el-button v-if="selected" @click="clearDetail">返回列表</el-button>
      <template v-if="!selected">
        <DeskQueueMetrics />
        <DeskPanel :title="config.title" :meta="busy || message ? undefined : '共 ' + total + ' 条'">
          <DeskFilters :busy="busy" @search="load(true)" @reset="resetFilters">
            <el-form-item label="业务编号" v-if="kind === 'orders' || kind === 'payments'">
              <el-input
                v-model.trim="keyword"
                placeholder="订单 / 付款编号"
                aria-label="业务编号"
                maxlength="128"
                clearable />
            </el-form-item>
            <el-form-item label="工厂 ID">
              <el-input
                v-model.trim="factoryId"
                placeholder="工厂 ID（可选）"
                aria-label="工厂 ID"
                clearable />
            </el-form-item>
            <el-form-item label="买家 ID" v-if="kind === 'orders' || kind === 'payments'">
              <el-input
                v-model.trim="buyerUserId"
                placeholder="买家 ID（可选）"
                aria-label="买家 ID"
                clearable />
            </el-form-item>
            <el-form-item label="状态">
              <el-select
                v-model="status"
                aria-label="状态"
                :empty-values="[null, undefined]"
                placeholder="全部状态"
                popper-class="desk-select-menu">
                <el-option value="" label="全部状态" />
                <el-option
                  v-for="state in states"
                  :key="state"
                  :value="state"
                  :label="labels[state] || state" />
              </el-select>
            </el-form-item>
            <el-form-item label="退款来源" v-if="kind === 'refunds'">
              <el-select
                v-model="businessType"
                aria-label="退款来源"
                :empty-values="[null, undefined]"
                placeholder="全部来源"
                popper-class="desk-select-menu">
                <el-option value="" label="全部来源" />
                <el-option value="custom_order" label="定制订单" />
                <el-option value="rental_order" label="租赁订单" />
                <el-option value="checkout_batch" label="未成单批次" />
              </el-select>
            </el-form-item>
          </DeskFilters>
          <div class="panel">
            <DeskTable
              v-if="kind === 'orders'"
              :data="orders"
              :empty-text="busy ? '正在读取…' : message ? '读取失败' : '当前条件暂无记录。'">
              <el-table-column label="订单编号" min-width="138" prop="orderNo" />
              <el-table-column label="用户" min-width="86">
                <template #default>未提供</template>
              </el-table-column>
              <el-table-column label="工厂" min-width="94" prop="factoryName" />
              <el-table-column label="租期" min-width="94">
                <template #default="{ row }">{{ row.startDate }} 至 {{ row.endDate }}</template>
              </el-table-column>
              <el-table-column label="租金实付" min-width="138">
                <template #default="{ row }">¥{{ money(row.amounts.rentCashFen) }}</template>
              </el-table-column>
              <el-table-column label="押金" min-width="94">
                <template #default="{ row }">¥{{ money(row.amounts.depositFen) }}</template>
              </el-table-column>
              <el-table-column label="履约阶段" min-width="102">
                <template #default="{ row }">
                  {{ row.fulfillmentStage ? labels[row.fulfillmentStage] || row.fulfillmentStage : "未提供" }}
                </template>
              </el-table-column>
              <el-table-column label="更新时间" min-width="108">
                <template #default>未提供</template>
              </el-table-column>
              <el-table-column label="订单状态" min-width="94">
                <template #default="{ row }">
                  {{ labels[row.displayStatus] || row.displayStatus }}
                  <small v-if="row.displayStatus === 'terminated' && row.refundStatus !== 'none'">
                    · {{ refundLabel(row.refundStatus) }}
                  </small>
                </template>
              </el-table-column>
              <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
                <template #default="{ row }">
                  <el-button @click="open(row.id)" :disabled="busy" size="small" link class="desk-row-link">
                    查看详情
                  </el-button>
                </template>
              </el-table-column>
            </DeskTable>
            <DeskTable
              v-else-if="kind === 'payments'"
              :data="payments"
              :empty-text="busy ? '正在读取…' : message ? '读取失败' : '当前条件暂无记录。'">
              <el-table-column label="支付编号" min-width="138" prop="paymentNo" />
              <el-table-column label="应付" min-width="94">
                <template #default="{ row }">¥{{ money(row.payableFen) }}</template>
              </el-table-column>
              <el-table-column label="实收" min-width="94">
                <template #default="{ row }">¥{{ money(row.paidFen) }}</template>
              </el-table-column>
              <el-table-column label="已退" min-width="94">
                <template #default="{ row }">¥{{ money(row.refundedFen) }}</template>
              </el-table-column>
              <el-table-column label="状态" min-width="94">
                <template #default="{ row }">{{ labels[row.status] }}</template>
              </el-table-column>
              <el-table-column label="付款 / 核实时刻" min-width="138">
                <template #default="{ row }">{{ time(row.paidAt) }} / {{ time(row.lastCheckedAt) }}</template>
              </el-table-column>
              <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
                <template #default="{ row }">
                  <el-button @click="open(row.id)" :disabled="busy" size="small" link class="desk-row-link">
                    资金追溯
                  </el-button>
                </template>
              </el-table-column>
            </DeskTable>
            <DeskTable
              v-else-if="kind === 'refunds'"
              :data="refunds"
              :empty-text="busy ? '正在读取…' : message ? '读取失败' : '当前条件暂无记录。'">
              <el-table-column label="退款编号" min-width="138" prop="refundNo" />
              <el-table-column label="业务对象" min-width="94">
                <template #default="{ row }">
                  {{
                    row.businessType === "custom_order"
                      ? "定制订单"
                      : row.businessType === "rental_order"
                      ? "租赁订单"
                      : "未成单批次"
                  }}
                  <small>{{ row.businessId }}</small>
                </template>
              </el-table-column>
              <el-table-column label="租金 / 定制商品" min-width="94">
                <template #default="{ row }">¥{{ money(row.goodsFen ?? row.rentFen) }}</template>
              </el-table-column>
              <el-table-column label="押金" min-width="94">
                <template #default="{ row }">¥{{ money(row.depositFen) }}</template>
              </el-table-column>
              <el-table-column label="运费" min-width="94">
                <template #default="{ row }">¥{{ money(row.freightFen) }}</template>
              </el-table-column>
              <el-table-column label="应退合计" min-width="94">
                <template #default="{ row }">¥{{ money(row.totalFen) }}</template>
              </el-table-column>
              <el-table-column label="状态" min-width="94">
                <template #default="{ row }">{{ labels[row.status] }}</template>
              </el-table-column>
              <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
                <template #default="{ row }">
                  <el-button @click="open(row.id)" :disabled="busy" size="small" link class="desk-row-link">
                    查看详情
                  </el-button>
                </template>
              </el-table-column>
            </DeskTable>
            <DeskTable
              v-else
              :data="merchants"
              :empty-text="busy ? '正在读取…' : message ? '读取失败' : '当前条件暂无记录。'">
              <el-table-column label="工厂 ID" min-width="138" prop="factoryId" />
              <el-table-column label="收款主体" min-width="94" prop="subjectName" />
              <el-table-column label="二级商户号" min-width="94">
                <template #default="{ row }">{{ row.subMerchantMasked || "尚未取得" }}</template>
              </el-table-column>
              <el-table-column label="账户状态" min-width="94">
                <template #default="{ row }">{{ labels[row.accountStatus] }}</template>
              </el-table-column>
              <el-table-column label="分账能力" min-width="94">
                <template #default="{ row }">{{ labels[row.profitSharingStatus] }}</template>
              </el-table-column>
              <el-table-column label="最近同步" min-width="138">
                <template #default="{ row }">{{ time(row.lastSyncedAt) }}</template>
              </el-table-column>
              <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
                <template #default="{ row }">
                  <el-button
                    @click="open(row.factoryId)"
                    :disabled="busy"
                    size="small"
                    link
                    class="desk-row-link">
                    查看账户
                  </el-button>
                </template>
              </el-table-column>
            </DeskTable>
          </div>
          <DeskPager :page="page" :total="total" :busy="busy" @turn="paginate" />
        </DeskPanel>
      </template>
      <div v-else class="detail-grid">
        <main>
          <template v-if="order">
            <div class="panel">
              <details v-if="me?.permissions.includes('admin:fulfillment:return:read')">
                <summary>归还核验与实际到厂记录</summary>
                <ReturnWarnings
                  :key="order.id"
                  :order="{
                    orderId: order.id,
                    orderNo: order.orderNo,
                    factoryName: order.factoryName,
                    depositFen: order.amounts.depositFen,
                  }" />
              </details>
              <h2>订单与责任</h2>
              <dl>
                <dt>订单编号</dt>
                <dd>{{ order.orderNo }}</dd>
                <dt>工厂 / 状态</dt>
                <dd>
                  {{ order.factoryName }} · {{ labels[order.displayStatus] }}
                  <small v-if="order.displayStatus === 'terminated' && order.refundStatus !== 'none'">
                    · {{ refundLabel(order.refundStatus) }}
                  </small>
                </dd>
                <dt>租期</dt>
                <dd>{{ order.startDate }} 至 {{ order.endDate }}</dd>
                <dt>原批次 / 支付</dt>
                <dd>{{ order.batchId }} / {{ order.paymentId }}</dd>
                <dt>接单截止 / 接单</dt>
                <dd>{{ time(order.acceptDeadlineAt) }} / {{ time(order.acceptedAt) }}</dd>
                <dt>收货人</dt>
                <dd>{{ order.receiver.name }} · {{ order.receiver.phone }}</dd>
                <dt>收货地址</dt>
                <dd>{{ order.receiver.regionText }} {{ order.receiver.detailAddress }}</dd>
                <dt>买家备注</dt>
                <dd>{{ order.buyerRemark || "未填写" }}</dd>
                <dt>终止原因</dt>
                <dd>{{ order.cancelReason || order.rejectReason || "未发生" }}</dd>
              </dl>
            </div>
            <div class="panel">
              <h2>原科目金额</h2>
              <div class="summary">
                <div>
                  原租金
                  <strong>¥{{ money(order.amounts.rentOriginalFen) }}</strong>
                </div>
                <div>
                  优惠
                  <strong>¥{{ money(order.amounts.couponDiscountFen) }}</strong>
                </div>
                <div>
                  实收 / 已退 / 已扣
                  <strong>
                    ¥{{ money(order.paidFen) }} / {{ money(order.refundedFen) }} /
                    {{ money(order.deductedFen) }}
                  </strong>
                </div>
              </div>
            </div>
            <div class="panel">
              <h2>道具快照</h2>
              <DeskTable :data="order.items" empty-text="暂无记录">
                <el-table-column label="道具" min-width="94" prop="name" />
                <el-table-column label="数量" min-width="94" prop="quantity" />
                <el-table-column label="原租金" min-width="94">
                  <template #default="{ row: item }">{{ money(item.rentOriginalFen) }}</template>
                </el-table-column>
                <el-table-column label="优惠" min-width="94">
                  <template #default="{ row: item }">{{ money(item.couponDiscountFen) }}</template>
                </el-table-column>
                <el-table-column label="现金租金" min-width="94">
                  <template #default="{ row: item }">{{ money(item.rentCashFen) }}</template>
                </el-table-column>
                <el-table-column label="押金" min-width="94">
                  <template #default="{ row: item }">{{ money(item.depositFen) }}</template>
                </el-table-column>
                <el-table-column label="运输要求" min-width="94">
                  <template #default="{ row: item }">{{ item.transportRequirement || "无" }}</template>
                </el-table-column>
              </DeskTable>
            </div>
            <div class="panel">
              <h2>配送与取消规则</h2>
              <dl>
                <dt>去程</dt>
                <dd>
                  {{ labels[order.outbound.serviceMode] }} ·
                  {{ order.outbound.vehicleTierName || "不适用" }} · 预收 ¥{{
                    money(order.outbound.prepaidFen)
                  }}
                </dd>
                <dt>返程</dt>
                <dd>
                  {{ labels[order.return.serviceMode] }} · {{ order.return.vehicleTierName || "不适用" }} ·
                  预收 ¥{{ money(order.return.prepaidFen) }}
                </dd>
                <dt>运输说明</dt>
                <dd>{{ order.transportNotice }}</dd>
                <dt>取消规则</dt>
                <dd>租赁订单取消与退款规则 · {{ order.cancellationRule.version }}</dd>
                <dt>关联退款</dt>
                <dd>{{ order.refundIds.join("、") || "无" }}</dd>
              </dl>
            </div>
          </template>
          <template v-if="payment">
            <div class="panel">
              <h2>原支付与批次</h2>
              <dl>
                <dt>支付编号</dt>
                <dd>{{ payment.payment.paymentNo }}</dd>
                <dt>付款来源</dt>
                <dd>
                  {{
                    {
                      initial_order: "原租赁订单",
                      extension_rent: "延期租金",
                      compensation_supplement: "订单差额补缴",
                      custom_order_full_payment: "定制全款",
                    }[payment.scene]
                  }}
                  {{ payment.customOrderId || payment.extensionId || payment.receivableId }}
                </dd>
                <dt v-if="payment.batch">批次 / 清单</dt>
                <dd v-if="payment.batch">{{ payment.batch.batchNo }} / {{ payment.batch.checklistId }}</dd>
                <dt>支付状态</dt>
                <dd>{{ labels[payment.payment.status] }}</dd>
                <dt>应付 / 实收 / 已退</dt>
                <dd>
                  ¥{{ money(payment.payment.payableFen) }} / {{ money(payment.payment.paidFen) }} /
                  {{ money(payment.payment.refundedFen) }}
                </dd>
                <dt>原截止 / 实付</dt>
                <dd>{{ time(payment.payment.expireAt) }} / {{ time(payment.payment.paidAt) }}</dd>
                <dt>最近核实</dt>
                <dd>{{ time(payment.payment.lastCheckedAt) }}</dd>
                <template v-if="payment.batch">
                  <dt>恢复模式</dt>
                  <dd>
                    {{ payment.batch.recoveryMode === "refund_batch" ? "整批退款" : "原批次继续恢复" }}
                  </dd>
                  <dt>优惠券消费 / 返还</dt>
                  <dd>
                    <RouterLink
                      v-if="payment.couponUsageId && me?.permissions.includes('admin:coupon:read')"
                      :to="{ path: '/operations/coupons', query: { usageId: payment.couponUsageId } }">
                      查看冻结分摊
                    </RouterLink>
                    <span v-else>{{ payment.couponUsageId || "未使用" }}</span>
                    ·
                    {{ labels[payment.batch.couponReturn.status] }}
                  </dd>
                </template>
              </dl>
            </div>
            <div class="panel">
              <h2>各工厂原子支付</h2>
              <DeskTable :data="payment.suborders" empty-text="暂无记录">
                <el-table-column label="工厂 / 订单" min-width="94">
                  <template #default="{ row: sub }">
                    {{ sub.factoryId }} · {{ sub.orderId || payment.customOrderId || "未成单" }}
                  </template>
                </el-table-column>
                <el-table-column label="原渠道单 / 交易号" min-width="94">
                  <template #default="{ row: sub }">
                    {{ sub.channelTradeNo }} · {{ sub.channelTransactionId || "未取得" }}
                  </template>
                </el-table-column>
                <el-table-column label="应付 / 实收 / 已退" min-width="94">
                  <template #default="{ row: sub }">
                    {{ money(sub.payableFen) }} / {{ money(sub.paidFen) }} / {{ money(sub.refundedFen) }}
                  </template>
                </el-table-column>
                <el-table-column label="支付 / 资金状态" min-width="94">
                  <template #default="{ row: sub }">
                    {{ labels[sub.paymentStatus] || sub.paymentStatus }} /
                    {{ labels[sub.fundsStatus] || sub.fundsStatus }}
                  </template>
                </el-table-column>
                <el-table-column label="实付 / 冻结截止" min-width="138">
                  <template #default="{ row: sub }">
                    {{ time(sub.paidAt) }} · {{ time(sub.freezeExpireAt) }}
                  </template>
                </el-table-column>
              </DeskTable>
            </div>
            <div v-for="group in payment.groups" :key="group.factoryId" class="panel">
              <h2>{{ group.factoryName }} · 原结算快照</h2>
              <dl>
                <dt>原租金 / 优惠 / 现金</dt>
                <dd>
                  ¥{{ money(group.amounts.rentOriginalFen) }} / {{ money(group.amounts.couponDiscountFen) }} /
                  {{ money(group.amounts.rentCashFen) }}
                </dd>
                <dt>押金 / 运费</dt>
                <dd>¥{{ money(group.amounts.depositFen) }} / {{ money(group.amounts.freightFen) }}</dd>
                <dt>道具</dt>
                <dd v-for="item in group.items" :key="item.snapshotItemId">
                  {{ item.name }} × {{ item.quantity }}，现金租金 ¥{{ money(item.rentCashFen) }}
                </dd>
              </dl>
            </div>
            <div class="panel">
              <h2>原退款义务</h2>
              <p v-if="!payment.refunds.length">暂无退款。</p>
              <dl v-for="item in payment.refunds" :key="item.id">
                <dt>{{ item.refundNo }}</dt>
                <dd>
                  ¥{{ money(item.totalFen) }} · {{ labels[item.status] }} ·
                  {{
                    item.businessType === "custom_order"
                      ? "定制订单"
                      : item.businessType === "checkout_batch"
                      ? "未成单批次"
                      : "租赁订单"
                  }}
                </dd>
              </dl>
            </div>
          </template>
          <template v-if="refund">
            <div class="panel">
              <h2>退款与原来源</h2>
              <dl>
                <dt>退款编号</dt>
                <dd>{{ refund.refund.refundNo }}</dd>
                <dt>来源</dt>
                <dd>
                  {{
                    refund.refund.businessType === "custom_order"
                      ? "定制订单"
                      : refund.refund.businessType === "checkout_batch"
                      ? "未成单批次"
                      : "租赁订单"
                  }}
                  · {{ refund.refund.businessId }}
                </dd>
                <dt>原支付 / 子单</dt>
                <dd>{{ refund.refund.paymentId }} / {{ refund.refund.suborderId }}</dd>
                <dt>{{ refund.refund.goodsFen !== undefined ? "定制商品" : "租金" }} / 押金 / 运费</dt>
                <dd>
                  ¥{{ money(refund.refund.goodsFen ?? refund.refund.rentFen) }} /
                  {{ money(refund.refund.depositFen) }} /
                  {{ money(refund.refund.freightFen) }}
                </dd>
                <dt>应退合计 / 状态</dt>
                <dd>¥{{ money(refund.refund.totalFen) }} · {{ labels[refund.refund.status] }}</dd>
                <dt>原渠道退款号</dt>
                <dd>{{ refund.channelOutRefundNo }}</dd>
                <dt>微信退款号</dt>
                <dd>{{ refund.channelRefundId || "尚未取得" }}</dd>
                <dt>成功时间</dt>
                <dd>{{ time(refund.refund.successAt) }}</dd>
                <dt>原因 / 错误</dt>
                <dd>{{ refund.refund.reason || "无" }} / {{ refund.refund.failureReasonCode || "无" }}</dd>
                <dt>核实 / 尝试次数</dt>
                <dd>{{ time(refund.lastCheckedAt) }} / {{ refund.attemptCount }}</dd>
                <dt>返券状态</dt>
                <dd>
                  {{ labels[refund.refund.couponReturn.status] }} ·
                  {{ time(refund.refund.couponReturn.validUntil) }}
                </dd>
              </dl>
            </div>
          </template>
          <div v-if="merchant" class="panel">
            <h2>收款账户</h2>
            <dl>
              <dt>工厂 / 主体</dt>
              <dd>{{ merchant.factoryId }} · {{ merchant.subjectName }}</dd>
              <dt>二级商户号</dt>
              <dd>{{ merchant.subMerchantMasked || "尚未取得" }}</dd>
              <dt>账户 / 分账</dt>
              <dd>{{ labels[merchant.accountStatus] }} / {{ labels[merchant.profitSharingStatus] }}</dd>
              <dt>最近同步</dt>
              <dd>{{ time(merchant.lastSyncedAt) }}</dd>
              <dt>办理状态</dt>
              <dd>
                {{
                  merchant.nextAction === "ready"
                    ? "已具备收款条件"
                    : merchant.nextAction === "wait"
                    ? "等待渠道审核"
                    : "需由工厂继续办理或联系平台"
                }}
              </dd>
            </dl>
            <div class="toolbar" v-if="me?.permissions.includes('admin:trade:merchant:sync')">
              <el-button :disabled="busy" @click="sync">同步真实渠道状态</el-button>
              <el-button
                v-if="hasPending('merchant:' + merchant.factoryId)"
                :disabled="busy"
                @click="recovery">
                查询原同步结果
              </el-button>
            </div>
            <div class="notice">收款账户与分账能力均需渠道确认。暂未开放自助办理时，请联系平台协助。</div>
          </div>
        </main>
        <aside class="panel side">
          <h2>查看说明</h2>
          <p class="sub">按订单、支付和退款编号核对原交易。</p>
          <p class="notice">退款失败或结果未确认时，系统会继续核实原退款进度。</p>
        </aside>
      </div>
    </template>
  </section>
</template>
