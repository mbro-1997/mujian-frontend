<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";
import DeskQueueMetrics from "../../components/DeskQueueMetrics.vue";
import DeskPanel from "../../components/DeskPanel.vue";
import "../trading/trading.css";
import { onMounted, ref } from "vue";
import { api, ApiError } from "../../api/http";
import { me } from "../../session/state";
import { useSessionView } from "../../session/view";
import { money, time, query, command, hasPending, recover, tradeError } from "../../api/trading";
import type { PageResult } from "../../api/trading-types";

interface Warning {
  checkId: string;
  orderId: string;
  orderNo: string;
  factoryName: string;
  status: string;
  startAt: string;
  warningAt: string;
  autoCloseAt: string;
  claimCreated: boolean;
  depositFen: number;
}
interface OrderRef {
  orderId: string;
  orderNo: string;
  factoryName: string;
  depositFen: number;
}
const props = defineProps<{ order?: OrderRef }>();
interface Check {
  autoCloseAt: string | null;
  id: string | null;
  version: number;
  status: string;
  claimCreated: boolean;
  closedAt: string | null;
  inventoryReleased: boolean;
  depositStatus: string;
  availableActions: string[];
  items: {
    itemId: string;
    name: string;
    expectedQuantity: number;
    checkedQuantity: number;
  }[];
}
interface Fee {
  status: "awaiting_handover" | "pending_review" | "effective";
  version: number;
  dueDate: string;
  handoverMethod: string | null;
  handoverAt: string | null;
  handoverBasis: string | null;
  disputed: boolean;
  elapsedMs: number | null;
  excludedMs: number | null;
  days: number | null;
  rentFen: number | null;
  capFen: number | null;
  liabilityFen: number | null;
  rentOffsetFen: number | null;
  liabilityOffsetFen: number | null;
  rentDueFen: number | null;
  liabilityDueFen: number | null;
  rentPaidFen: number;
  liabilityPaidFen: number;
  availableDepositFen: number;
  reviewBasis: string | null;
  lines: { itemId: string; quantity: number; dailyRentFen: number }[];
}
const methodLabels: Record<string, string> = {
  carrier: "实际交运",
  self_delivery: "实际开始自送",
  factory_pickup: "工厂实际接走",
};
const feeStatus = { awaiting_handover: "待核实交接", pending_review: "待平台核定", effective: "已核定" };
const feeMoney = (v: number | null) => (v === null ? "待核定" : "¥" + money(v));
const form = ref({
  method: "",
  at: "",
  excluded: 0,
  liability: 0,
  fault: false,
  basis: "",
  quantities: [] as number[],
});
interface Context {
  disputes: { overdueFee: Fee | null };
  shipment: { method: string };
  disputeProtectionReady: boolean;
  returnCheck: Check;
}
interface Result {
  checkClosed: boolean;
  refundObligationRecorded: boolean;
  inventoryReleased: boolean;
  eventRecorded: boolean;
  actionId: string | null;
}
const names: Record<string, string> = {
  pending: "待核验",
  warning: "已预警",
  no_issue: "工厂确认无异常",
  auto_closed: "系统已关闭",
  admin_closed: "平台已关闭",
  claim_submitted: "已有索赔",
};
const rows = ref<Warning[]>([]),
  selected = ref<OrderRef | null>(null),
  context = ref<Context | null>(null),
  result = ref<Result | null>(null);
const keyword = ref(""),
  factoryId = ref(""),
  from = ref(""),
  to = ref(""),
  status = ref("warning"),
  page = ref(1),
  total = ref("0");
const busy = ref(false),
  message = ref(""),
  reason = ref(""),
  operation = ref<"arrival" | "close" | "">("");
function clear() {
  selected.value = null;
  context.value = null;
  result.value = null;
  operation.value = "";
  reason.value = "";
}
const session = useSessionView(() => {
  clear();
  rows.value = [];
  busy.value = false;
  message.value = "";
});
async function run(action: (current: () => boolean) => Promise<void>) {
  if (busy.value) return;
  const owner = session.capture(),
    current = () => session.current(owner);
  busy.value = true;
  message.value = "";
  try {
    await action(current);
  } catch (e) {
    if (current()) {
      message.value = tradeError(e);
      if (e instanceof ApiError && ["PERMISSION_DENIED", "RESOURCE_NOT_FOUND"].includes(e.reason)) {
        clear();
        rows.value = [];
      }
    }
  } finally {
    if (current()) busy.value = false;
  }
}
function load(next = 1) {
  if (!!from.value !== !!to.value || (from.value && from.value > to.value)) {
    message.value = "请填写完整、有效的自动关闭日期范围";
    return;
  }
  return run(async (current) => {
    const data = await api<PageResult<Warning>>(
      "/api/admin/return-checks?" +
        query({
          keyword: keyword.value.trim(),
          factoryId: factoryId.value.trim(),
          autoCloseFrom: from.value,
          autoCloseTo: to.value,
          status: status.value,
          page: next,
          pageSize: 20,
        })
    );
    if (current()) {
      rows.value = data.items;
      total.value = data.total;
      page.value = data.page;
      clear();
    }
  });
}
const root = (id: string) => "/api/admin/rental-orders/" + id;
async function read(row: OrderRef, current: () => boolean) {
  const data = await api<Context>(root(row.orderId) + "/fulfillment");
  if (current()) {
    context.value = data;
    selected.value = row;
    const fee = data.disputes.overdueFee;
    if (fee)
      form.value = {
        method: fee.handoverMethod || (data.shipment.method === "factory_pickup" ? "factory_pickup" : ""),
        at: fee.handoverAt?.replace(/(?:Z|[+]08:00)$/, "") || "",
        excluded: (fee.excludedMs || 0) / 1000,
        liability: 0,
        fault: false,
        basis: "",
        quantities: fee.lines.map((l) => l.quantity),
      };
  }
}
function open(row: OrderRef) {
  return run(async (current) => {
    clear();
    await read(row, current);
  });
}
const slot = () => "close-return:" + selected.value?.orderId;
function assess() {
  const row = selected.value,
    fee = context.value?.disputes.overdueFee,
    v = form.value;
  if (!row || !fee || !v.at || !v.method || !v.basis.trim()) return;
  const local = v.at.length === 16 ? v.at + ":00" : v.at;
  const [seconds, fraction = ""] = local.split(".");
  const at = seconds + "." + fraction.padEnd(3, "0");
  return run(async (current) => {
    try {
      await command(slot(), root(row.orderId) + "/return-check/overdue-fee", {
        expectedVersion: fee.version,
        handoverAt: at + "+08:00",
        handoverMethod: v.method,
        excludedMs: Math.round(v.excluded * 1000),
        items: fee.lines.map((l, i) => ({ itemId: l.itemId, quantity: v.quantities[i] })),
        liabilityFen: v.liability,
        unreportedBuyerFault: v.fault,
        basis: v.basis.trim(),
      });
    } catch (e) {
      if (
        current() &&
        e instanceof ApiError &&
        ["VERSION_CONFLICT", "SOURCE_ACTION_REQUIRED"].includes(e.reason)
      )
        await read(row, current);
      throw e;
    }
    if (current()) await read(row, current);
  });
}
function cancelOperation() {
  if (busy.value) return;
  operation.value = "";
  reason.value = "";
}
function execute() {
  const row = selected.value,
    check = context.value?.returnCheck,
    op = operation.value;
  if (!row || !check || !op || !reason.value.trim()) return;
  return run(async (current) => {
    try {
      const value = await command<Result>(slot(), root(row.orderId) + "/return-check/" + op, {
        expectedVersion: check.version,
        reason: reason.value.trim(),
      });
      if (!current()) return;
      if (op === "close" && "checkClosed" in value) result.value = value;
      operation.value = "";
      reason.value = "";
      await read(row, current);
    } catch (e) {
      if (
        current() &&
        e instanceof ApiError &&
        [
          "VERSION_CONFLICT",
          "FULFILLMENT_STATE_CHANGED",
          "RETURN_CLAIM_EXISTS",
          "RETURN_ALREADY_CLOSED",
        ].includes(e.reason)
      ) {
        operation.value = "";
        await read(row, current);
      }
      throw e;
    }
  });
}
function recoverOriginal() {
  const row = selected.value;
  if (row)
    return run(async (current) => {
      await recover(slot());
      if (current()) {
        operation.value = "";
        await read(row, current);
      }
    });
}
onMounted(() => (props.order ? open(props.order) : load()));
function resetFilters() {
  keyword.value = "";
  factoryId.value = "";
  status.value = "";
  from.value = "";
  to.value = "";
  return load(1);
}
</script>
<template>
  <main class="trade-admin">
    <h1>{{ selected || props.order ? "归还核验详情" : "归还核验预警" }}</h1>
    <p role="alert" v-if="message">{{ message }}</p>
    <template v-if="!selected && !props.order">
      <p class="sub">查看归还核验开始、预警和自动关闭时间。</p>

      <DeskQueueMetrics />
      <DeskPanel title="归还核验" :meta="busy || message ? undefined : '共 ' + total + ' 条'">
        <DeskFilters :busy="busy" @search="load(1)" @reset="resetFilters">
          <el-form-item label="订单号或道具名称">
            <el-input v-model="keyword" placeholder="订单号或道具名称" clearable />
          </el-form-item>
          <el-form-item label="工厂 ID">
            <el-input v-model="factoryId" placeholder="工厂 ID" clearable />
          </el-form-item>
          <el-form-item label="核验状态">
            <el-select
              v-model="status"
              aria-label="核验状态"
              :empty-values="[null, undefined]"
              placeholder="全部状态"
              popper-class="desk-select-menu">
              <el-option value="" label="全部状态" />
              <el-option v-for="(label, key) in names" :value="key" :key="key" :label="label" />
            </el-select>
          </el-form-item>
          <el-form-item label="自动关闭自">
            <el-date-picker v-model="from" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
          </el-form-item>
          <el-form-item label="至">
            <el-date-picker v-model="to" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
          </el-form-item>
        </DeskFilters>
        <DeskTable
          :data="rows"
          :empty-text="busy ? '正在读取…' : message ? '读取失败' : '暂无匹配的核验记录'">
          <el-table-column label="订单编号" min-width="138" prop="orderNo" />
          <el-table-column label="工厂" min-width="94" prop="factoryName" />
          <el-table-column label="核验开始" min-width="94">
            <template #default="{ row: r }">{{ time(r.startAt) }}</template>
          </el-table-column>
          <el-table-column label="预警时间" min-width="138">
            <template #default="{ row: r }">{{ time(r.warningAt) }}</template>
          </el-table-column>
          <el-table-column label="自动关闭时间" min-width="138">
            <template #default="{ row: r }">{{ time(r.autoCloseAt) }}</template>
          </el-table-column>
          <el-table-column label="索赔状态" min-width="94">
            <template #default="{ row: r }">{{ r.claimCreated ? "已有索赔" : "未发起" }}</template>
          </el-table-column>
          <el-table-column label="押金" min-width="94">
            <template #default="{ row: r }">¥{{ money(r.depositFen) }}</template>
          </el-table-column>
          <el-table-column label="核验状态" min-width="94">
            <template #default="{ row: r }">{{ names[r.status] }}</template>
          </el-table-column>
          <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
            <template #default="{ row: r }">
              <el-button
                :disabled="busy || !me?.permissions.includes('admin:trade:order:read')"
                @click="open(r)"
                size="small"
                link
                class="desk-row-link">
                查看详情
              </el-button>
            </template>
          </el-table-column>
        </DeskTable>

        <DeskPager :page="page" :total="total" :busy="busy" @turn="load(page + $event)" />
      </DeskPanel>
    </template>
    <section v-else-if="context && selected" class="panel">
      <el-button v-if="!props.order" @click="load(page)" :disabled="busy">返回预警列表</el-button>
      <h2>{{ selected.orderNo }} · {{ selected.factoryName }}</h2>
      <p>
        {{ names[context.returnCheck.status] }} ·
        {{ context.returnCheck.claimCreated ? "已发起索赔" : "本核验未登记索赔" }}
        · 库存{{ context.returnCheck.inventoryReleased ? "已释放" : "仍占用" }}
      </p>
      <p v-if="!context.disputeProtectionReady">异议保护尚未就绪，正常关闭暂未开放。</p>
      <p>预计自动关闭 {{ time(context.returnCheck.autoCloseAt) }} · 押金 ¥{{ money(selected.depositFen) }}</p>
      <section v-if="context.disputes.overdueFee" class="panel">
        <template v-for="fee in [context.disputes.overdueFee]" :key="fee.version">
          <h2>归还费用 · {{ feeStatus[fee.status] }}</h2>
          <p>
            有效归还日 {{ fee.dueDate }} · {{ methodLabels[fee.handoverMethod || ""] || "实际交接" }}
            {{ fee.handoverAt ? time(fee.handoverAt) : "待核实" }}
            {{ fee.disputed ? "（原记录有争议）" : "" }}
          </p>
          <p v-if="fee.handoverBasis">交接依据 {{ fee.handoverBasis }}</p>
          <p>
            实际逾期 {{ fee.elapsedMs == null ? "待核实" : fee.elapsedMs / 1000 + " 秒" }} · 排除
            {{ fee.excludedMs == null ? "待核实" : fee.excludedMs / 1000 + " 秒" }} · 计费
            {{ fee.days == null ? "待核实" : fee.days + " 天" }}
          </p>
          <DeskTable
            :data="[
              {
                title: fee.status === 'effective' ? '逾期租金' : '预估租金',
                amount: fee.rentFen,
                offset: fee.rentOffsetFen,
                due: fee.rentDueFen,
                paid: fee.rentPaidFen,
              },
              {
                title: '责任扣款',
                amount: fee.liabilityFen,
                offset: fee.liabilityOffsetFen,
                due: fee.liabilityDueFen,
                paid: fee.liabilityPaidFen,
              },
            ]"
            empty-text="暂无费用记录">
            <el-table-column label="费用" prop="title" />
            <el-table-column
              v-for="(label, key) in { amount: '金额', offset: '押金抵扣', due: '应补', paid: '已补' }"
              :key="key"
              :label="label">
              <template #default="{ row }">{{ feeMoney(row[key]) }}</template>
            </el-table-column>
          </DeskTable>
          <p>
            额外责任扣款上限 {{ feeMoney(fee.capFen) }} · 可用押金 {{ feeMoney(fee.availableDepositFen) }}
          </p>
          <p v-if="fee.reviewBasis">核定依据 {{ fee.reviewBasis }}</p>
          <form
            v-if="context.returnCheck.availableActions.includes('assess_overdue_fee')"
            @submit.prevent="assess">
            <label>
              实际交接方式
              <el-select
                required
                v-model="form.method"
                :empty-values="[null, undefined]"
                placeholder="请选择"
                popper-class="desk-select-menu">
                <el-option disabled value="" label="请选择" />
                <el-option
                  v-if="context.shipment.method === 'factory_pickup'"
                  value="factory_pickup"
                  label="工厂实际接走" />
                <template v-else>
                  <el-option value="carrier" label="实际交运" />
                  <el-option value="self_delivery" label="实际开始自送" />
                </template>
              </el-select>
            </label>
            <label>
              交接时间（北京时间）
              <el-input required type="datetime-local" step="0.001" v-model="form.at" />
            </label>
            <label>
              排除工厂延误等非买家时长（秒）
              <el-input required type="number" min="0" step="0.001" v-model.number="form.excluded" />
            </label>
            <label v-for="(l, i) in fee.lines" :key="l.itemId">
              {{ context.returnCheck.items.find((r) => r.itemId === l.itemId)?.name || l.itemId }} · 单件日租
              {{ feeMoney(l.dailyRentFen) }} · 逾期数量
              <el-input
                required
                type="number"
                min="0"
                :max="l.quantity"
                step="1"
                v-model.number="form.quantities[i]" />
            </label>
            <label>
              核定责任扣款（分）
              <el-input required type="number" min="0" step="1" v-model.number="form.liability" />
            </label>
            <el-checkbox v-model="form.fault">已核实买家未告知且承担责任</el-checkbox>
            <el-input
              required
              maxlength="500"
              aria-label="计费与核责依据"
              placeholder="填写交接、排除时段、逾期数量及责任依据"
              v-model="form.basis"
              type="textarea" />
            <el-button
              class="primary"
              :disabled="busy || hasPending(slot()) || (form.liability > 0 && !form.fault)"
              native-type="submit"
              type="primary">
              核定费用并抵扣押金
            </el-button>
          </form>
        </template>
      </section>
      <DeskTable :data="context.returnCheck.items" empty-text="暂无记录">
        <el-table-column label="归还道具" min-width="94" prop="name" />
        <el-table-column label="已核对" min-width="94" prop="checkedQuantity" />
        <el-table-column label="应归还" min-width="94" prop="expectedQuantity" />
      </DeskTable>
      <div class="toolbar" v-if="!operation && me?.permissions.includes('admin:fulfillment:return:close')">
        <el-button
          v-if="context.returnCheck.availableActions.includes('admin_confirm_arrival')"
          @click="operation = 'arrival'">
          确认实际到厂
        </el-button>
        <el-button
          v-if="context.returnCheck.availableActions.includes('admin_close')"
          @click="operation = 'close'">
          提前结束核验
        </el-button>
      </div>
      <el-dialog v-if="operation" :model-value="true" align-center append-to-body class="desk-dialog"
        width="min(520px, 92vw)" :title="operation === 'close' ? '确认提前结束核验' : '确认道具实际到厂'"
        :close-on-click-modal="false" :show-close="!busy" :close-on-press-escape="!busy"
        @close="cancelOperation">
        <p>{{ selected.orderNo }} · {{ selected.factoryName }}</p>
        <p>{{ operation === "close" ? "关闭核验后将处理原路退押并释放本单库存。" : "以本次实际到厂记录启动核验计时。" }}</p>
        <el-form-item label="处理依据" required>
          <el-input v-model="reason" maxlength="500" aria-label="处理依据" placeholder="填写处理依据"
            :disabled="busy" type="textarea" :rows="3" />
        </el-form-item>
        <el-alert v-if="message" :title="message" type="warning" :closable="false" />
        <template #footer>
          <el-button @click="cancelOperation" :disabled="busy">取消</el-button>
          <el-button v-if="hasPending(slot())" @click="recoverOriginal" :loading="busy">查询原操作回执</el-button>
          <el-button v-else type="primary" @click="execute" :disabled="busy || !reason.trim()">确认执行</el-button>
        </template>
      </el-dialog>
      <el-button v-if="hasPending(slot())" @click="recoverOriginal" :disabled="busy">
        查询原操作回执
      </el-button>
      <section v-if="result">
        <h2>执行回执</h2>
        <p>
          核验{{ result.checkClosed ? "已关闭" : "待核实" }} ·
          {{ result.refundObligationRecorded ? "已登记退押义务" : "无新增退押义务" }}
          · 库存{{ result.inventoryReleased ? "已释放" : "待处理" }} · 事件{{
            result.eventRecorded ? "已记录" : "待记录"
          }}
        </p>
        <p v-if="result.actionId">处理记录 {{ result.actionId }}</p>
      </section>
    </section>
  </main>
</template>
