<script setup lang="ts">
import DeskTable from '../../components/DeskTable.vue';
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api, ApiError, refreshCsrf, requestErrorText } from "../../api/http";
import { me } from "../../session/state";
import { useSessionView } from "../../session/view";
const props = defineProps<{
    couponId?: string;
    status?: string;
    usageIds: string[];
  }>(),
  emit = defineEmits<{ invalidated: [] }>();
type Audit = {
  checkoutBatchId: string;
  paymentId: string | null;
  allocations: {
    factoryId: string;
    skuId: string;
    rentalOrderId: string | null;
    eligibleRentAmountFen: number;
    allocatedDiscountAmountFen: number;
  }[];
};
const usage = ref(""),
  audit = ref<Audit | null>(null),
  reason = ref(""),
  message = ref(""),
  busy = ref(false),
  pending = ref<{
    url: string;
    key: string;
    reason: string;
    expectedStatus: string;
  } | null>(null);
const view = useSessionView(() => {
  audit.value = null;
  usage.value = "";
  pending.value = null;
  reason.value = "";
  message.value = "";
});
function pendingKey(id: string) {
  return "mj.couponInvalidate." + me.value?.userId + "." + id;
}
watch(
  () => props.couponId,
  () => {
    reason.value = "";
    message.value = "";
    audit.value = null;
    usage.value = "";
    pending.value = null;
    if (props.couponId) {
      try {
        pending.value = JSON.parse(
          sessionStorage.getItem(pendingKey(props.couponId)) || "null",
        );
        reason.value = pending.value?.reason || "";
      } catch {
        pending.value = null;
      }
    }
  },
  { immediate: true },
);
const route = useRoute();
watch(
  () => route.query.usageId,
  (id) => {
    if (typeof id === "string" && /^[0-9a-f]{32}$/.test(id)) {
      usage.value = id;
      void lookup();
    }
  },
  { immediate: true },
);
async function lookup() {
  const owner = view.capture(),
    id = usage.value;
  if (!id) return;
  audit.value = null;
  try {
    const result = await api<Audit>(
      "/api/admin/coupon-usages/" + encodeURIComponent(id) + "/allocations",
    );
    if (view.current(owner) && usage.value === id) {
      audit.value = result;
      message.value = "";
    }
  } catch (e) {
    if (view.current(owner) && usage.value === id) {
      audit.value = null;
      message.value = requestErrorText(e);
    }
  }
}
async function invalidate() {
  if (busy.value || !props.couponId || !props.status) return;
  if (!pending.value)
    pending.value = {
      url: "/api/admin/user-coupons/" + props.couponId + "/invalidate",
      key: crypto.randomUUID(),
      reason: reason.value.trim(),
      expectedStatus: props.status,
    };
  const couponId = props.couponId,
    storageKey = pendingKey(couponId);
  const p = pending.value,
    owner = view.capture();
  sessionStorage.setItem(storageKey, JSON.stringify(p));
  busy.value = true;
  try {
    await refreshCsrf();
    await api(
      p.url,
      "POST",
      { reason: p.reason, expectedStatus: p.expectedStatus },
      true,
      p.key,
    );
    sessionStorage.removeItem(storageKey);
    if (view.current(owner) && props.couponId === couponId) {
      message.value = "作废已登记";
      pending.value = null;
      emit("invalidated");
    }
  } catch (e) {
    const rejected =
      e instanceof ApiError && e.outcome === "business-rejection";
    if (rejected) sessionStorage.removeItem(storageKey);
    if (view.current(owner) && props.couponId === couponId) {
      message.value = requestErrorText(e);
      if (rejected) pending.value = null;
    }
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
</script>
<template>
  <section class="record-panel">
    <h2>冻结优惠分摊核对</h2>
    <div v-if="couponId">
      <el-button
        v-for="id in usageIds"
        :key="id"
        @click="
          usage = id;
          lookup();
        ">
        查看使用记录 {{ id }} 的分摊
      </el-button>
      <p v-if="!usageIds.length">此券暂无使用记录</p>
    </div>
    <form @submit.prevent="lookup">
      <label>
        优惠使用记录编号
        <el-input v-model.trim="usage" required />
      </label>
      <el-button native-type="submit">查询分摊</el-button>
    </form>
    <section v-if="audit">
      <el-button @click="audit = null">收起分摊</el-button>
      <p>
        结算批次 {{ audit.checkoutBatchId }} · 支付单
        <RouterLink
          v-if="audit.paymentId && me?.permissions.includes('admin:trade:payment:read')"
          :to="{ path: '/trading/payments', query: { id: audit.paymentId } }">
          {{ audit.paymentId }}
        </RouterLink>
        <span v-else>{{ audit.paymentId || '待生成' }}</span>
      </p>
      <DeskTable :data="audit.allocations" empty-text="暂无记录">
        <el-table-column label="工厂" min-width="94" prop="factoryId" />
        <el-table-column label="SKU" min-width="138" prop="skuId" />
        <el-table-column label="租赁订单" min-width="94">
          <template #default="{ row: r }">{{ r.rentalOrderId || '待成单' }}</template>
        </el-table-column>
        <el-table-column label="适用租金（分）" min-width="94" prop="eligibleRentAmountFen" />
        <el-table-column label="分摊优惠（分）" min-width="94" prop="allocatedDiscountAmountFen" />
      </DeskTable>
    </section>
    <form
      v-if="
        couponId &&
        (!!pending || ['available', 'returned'].includes(status || '')) &&
        me?.permissions.includes('admin:coupon:invalidate')
      "
      @submit.prevent="invalidate">
      <label>
        作废原因
        <el-input v-model.trim="reason" maxlength="255" required :disabled="!!pending" />
      </label>
      <el-button :disabled="busy" native-type="submit">
        {{ pending ? '按原请求重试' : '确认作废此券' }}
      </el-button>
    </form>
    <p role="status">{{ message }}</p>
  </section>
</template>
