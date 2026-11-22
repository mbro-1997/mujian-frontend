<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";
import DeskQueueMetrics from "../../components/DeskQueueMetrics.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import DeskPanel from "../../components/DeskPanel.vue";
import "../trading/trading.css";
import { ref, onMounted } from "vue";
import { api, ApiError, refreshCsrf } from "../../api/http";
import { useSessionView } from "../../session/view";
import { command, recover, hasPending, query, money, time, tradeError } from "../../api/trading";
import type { PageResult } from "../../api/trading-types";
interface Leg {
  transportLegId: string;
  chargeMode: string;
  source: string | null;
  carrierName: string | null;
  carrierOrderNo: string | null;
  baseAmountFen: number;
  totalAmountFen: number;
  approvedAmountFen: number;
  extraFees: {
    type: string;
    description: string;
    amountFen: number;
    evidenceIds: string[];
  }[];
}
interface Expense {
  id: string;
  orderId: string;
  orderNo: string;
  factoryName: string;
  statementVersion: number;
  version: number;
  status: string;
  outbound: Leg;
  return: Leg;
  declaredTotalFen: number;
  approvedTotalFen: number;
  prepaidPoolFen: number;
  onlineSettleFen: number;
  refundableFen: number;
  overBudgetFen: number;
  reviewReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  availableActions: string[];
}
interface Photo {
  id: string;
  transportLegId: string;
  statementId: string;
}
const labels: Record<string, string> = {
  draft: "暂存",
  submitted: "待审核",
  reviewing: "审核中",
  returned: "已退回",
  approved: "已核准",
  cancelled: "已取消",
  toll: "通行",
  parking: "停车",
  handling: "装卸",
  waiting: "等候",
};
const keyword = ref(""),
  factoryId = ref(""),
  status = ref("submitted"),
  budget = ref(""),
  page = ref(1),
  total = ref("0"),
  rows = ref<Expense[]>([]);
const row = ref<Expense | null>(null),
  reason = ref(""),
  decision = ref(""),
  photos = ref<Photo[]>([]),
  picture = ref(""),
  photoPage = ref(1),
  photoMore = ref(false),
  message = ref(""),
  busy = ref(false);
function close() {
  row.value = null;
  reason.value = "";
  decision.value = "";
  photos.value = [];
  picture.value = "";
}
const session = useSessionView(() => {
  close();
  rows.value = [];
  busy.value = false;
  message.value = "";
});
async function run(fn: (current: () => boolean) => Promise<void>) {
  if (busy.value) return;
  const owner = session.capture(),
    current = () => session.current(owner);
  busy.value = true;
  message.value = "";
  try {
    await fn(current);
  } catch (e) {
    if (current()) {
      message.value = tradeError(e);
      if (e instanceof ApiError && ["PERMISSION_DENIED", "RESOURCE_NOT_FOUND"].includes(e.reason)) {
        close();
        rows.value = [];
      }
    }
  } finally {
    if (current()) busy.value = false;
  }
}
function list(n = 1) {
  return run(async (current) => {
    const data = await api<PageResult<Expense>>(
      "/api/admin/transport-expenses?" +
        query({
          keyword: keyword.value.trim(),
          factoryId: factoryId.value.trim(),
          status: status.value,
          overBudget: budget.value,
          page: n,
          pageSize: 20,
        })
    );
    if (current()) {
      close();
      rows.value = data.items;
      page.value = n;
      total.value = data.total;
    }
  });
}
function base(r: Expense) {
  return "/api/admin/rental-orders/" + r.orderId;
}
async function evidence(r: Expense, n: number, current: () => boolean) {
  const d = await api<PageResult<Photo>>(
    base(r) + "/evidence?node=transport_expense&statementId=" + r.id + "&page=" + n + "&pageSize=20"
  );
  if (current()) {
    photos.value = n === 1 ? d.items : photos.value.concat(d.items);
    photoPage.value = n;
    photoMore.value = n * 20 < Number(d.total);
  }
}
async function read(r: Expense, current: () => boolean) {
  const detail = await api<Expense>(base(r) + "/transport-expenses/" + r.id);
  if (current()) {
    row.value = detail;
    await evidence(detail, 1, current);
  }
}
function open(r: Expense) {
  return run(async (current) => {
    close();
    await read(r, current);
  });
}
function showPhoto(id: string) {
  const r = row.value;
  if (!r) return;
  return run(async (current) => {
    await refreshCsrf();
    if (!current()) return;
    const d = await api<{ url: string }>(base(r) + "/evidence/" + id + "/view", "POST", {});
    if (current()) picture.value = d.url;
  });
}
function review() {
  const r = row.value,
    op = decision.value;
  if (!r || !op || (op === "return" && !reason.value.trim())) return;
  return run(async (current) => {
    try {
      await command("review:" + r.id, base(r) + "/transport-expenses/" + r.id + "/review", {
        expectedVersion: r.version,
        decision: op,
        reason: reason.value.trim() || null,
      });
      if (current()) {
        decision.value = "";
        reason.value = "";
        await read(r, current);
      }
    } catch (e) {
      if (
        current() &&
        e instanceof ApiError &&
        ["VERSION_CONFLICT", "EXPENSE_VERSION_NOT_CURRENT", "EXPENSE_IMMUTABLE"].includes(e.reason)
      ) {
        decision.value = "";
        await read(r, current);
      }
      throw e;
    }
  });
}
function original() {
  const r = row.value;
  if (r)
    return run(async (current) => {
      await recover("review:" + r.id);
      if (current()) {
        decision.value = "";
        await read(r, current);
      }
    });
}
onMounted(() => list());
useDetailScroll(() => !!row.value);
function resetFilters() {
  status.value = "";
  factoryId.value = "";
  keyword.value = "";
  budget.value = "";
  return list(1);
}
</script>
<template>
  <main class="trade-admin">
    <h1>{{ row ? "往返费用申报详情" : "运输费用审核" }}</h1>
    <p v-if="message" role="alert">{{ message }}</p>
    <template v-if="!row">
      <DeskQueueMetrics />
      <DeskPanel title="订单级往返费用申报" :meta="busy || message ? undefined : '共 ' + total + ' 条'">
        <DeskFilters :busy="busy" @search="list(1)" @reset="resetFilters">
          <el-form-item label="审核状态">
            <el-select
              v-model="status"
              aria-label="审核状态"
              :empty-values="[null, undefined]"
              placeholder="全部状态"
              popper-class="desk-select-menu">
              <el-option value="" label="全部状态" />
              <el-option
                v-for="s in ['draft', 'submitted', 'reviewing', 'returned', 'approved', 'cancelled']"
                :key="s"
                :value="s"
                :label="labels[s]" />
            </el-select>
          </el-form-item>
          <el-form-item label="工厂 ID">
            <el-input v-model="factoryId" placeholder="工厂 ID" clearable />
          </el-form-item>
          <el-form-item label="订单号或道具">
            <el-input v-model="keyword" placeholder="订单号或道具" clearable />
          </el-form-item>
          <el-form-item label="预算">
            <el-select
              v-model="budget"
              aria-label="预算"
              :empty-values="[null, undefined]"
              placeholder="全部预算"
              popper-class="desk-select-menu">
              <el-option value="" label="全部预算" />
              <el-option value="true" label="超预算" />
              <el-option value="false" label="预算内" />
            </el-select>
          </el-form-item>
        </DeskFilters>
        <DeskTable :data="rows" :empty-text="busy ? '正在读取…' : message ? '读取失败' : '暂无匹配申报'">
          <el-table-column label="申报编号" min-width="138" prop="id" />
          <el-table-column label="租赁订单" min-width="94" prop="orderNo" />
          <el-table-column label="工厂" min-width="94" prop="factoryName" />
          <el-table-column label="去程" min-width="94">
            <template #default="{ row: r }">¥{{ money(r.outbound.totalAmountFen) }}</template>
          </el-table-column>
          <el-table-column label="回程" min-width="94">
            <template #default="{ row: r }">¥{{ money(r.return.totalAmountFen) }}</template>
          </el-table-column>
          <el-table-column label="合计" min-width="94">
            <template #default="{ row: r }">¥{{ money(r.declaredTotalFen) }}</template>
          </el-table-column>
          <el-table-column label="状态" min-width="94">
            <template #default="{ row: r }">{{ labels[r.status] }}</template>
          </el-table-column>
          <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
            <template #default="{ row: r }">
              <el-button @click="open(r)" :disabled="busy" size="small" link class="desk-row-link">
                查看申报
              </el-button>
            </template>
          </el-table-column>
        </DeskTable>

        <DeskPager :page="page" :total="total" :busy="busy" @turn="list(page + $event)" />
      </DeskPanel>
    </template>
    <template v-else>
      <el-button @click="list(page)" :disabled="busy">返回申报列表</el-button>
      <h2>{{ row.orderNo }} · {{ row.factoryName }}</h2>
      <p>
        第 {{ row.statementVersion }} 版 · {{ labels[row.status] }} ·
        {{ time(row.submittedAt) }}
      </p>
      <section v-for="(leg, index) in [row.outbound, row.return]" :key="leg.transportLegId" class="panel">
        <h2>{{ index ? "回程" : "去程" }}费用</h2>
        <p>
          {{
            leg.source === "factory_vehicle"
              ? "工厂自有车辆"
              : leg.source === "third_party"
              ? "第三方承运"
              : "无平台申报"
          }}
          {{ leg.carrierName }} {{ leg.carrierOrderNo }}
        </p>
        <p>基础费用 ¥{{ money(leg.baseAmountFen) }} · 本段申报 ¥{{ money(leg.totalAmountFen) }}</p>
        <div v-for="(fee, i) in leg.extraFees" :key="i">
          {{ labels[fee.type] }} · ¥{{ money(fee.amountFen) }} ·
          {{ fee.description }}
        </div>
        <div class="toolbar">
          <el-button
            v-for="(p, i) in photos.filter((p) => p.transportLegId === leg.transportLegId)"
            :key="p.id"
            @click="showPhoto(p.id)"
            :disabled="busy">
            凭证 {{ i + 1 }}{{ p.statementId !== row.id ? "（历史复用）" : "" }}
          </el-button>
        </div>
      </section>
      <el-button v-if="photoMore" @click="run((current) => evidence(row!, photoPage + 1, current))">
        更多凭证
      </el-button>
      <section class="panel">
        <h2>往返核销汇总</h2>
        <p>
          申报合计 ¥{{ money(row.declaredTotalFen) }} · 暂收池 ¥{{ money(row.prepaidPoolFen) }} · 超预算 ¥{{
            money(Math.max(row.declaredTotalFen - row.prepaidPoolFen, 0))
          }}
        </p>
        <p v-if="row.status === 'approved'">
          核准 ¥{{ money(row.approvedTotalFen) }} · 线上应结 ¥{{ money(row.onlineSettleFen) }} · 应退余额 ¥{{
            money(row.refundableFen)
          }}
        </p>
        <p v-if="row.reviewReason">{{ row.reviewReason }}</p>
        <div v-if="!decision" class="toolbar">
          <el-button v-if="row.availableActions.includes('return')" @click="decision = 'return'">
            退回补正
          </el-button>
          <el-button
            v-if="row.availableActions.includes('approve')"
            class="primary"
            @click="decision = 'approve'"
            type="primary">
            按申报原额核准
          </el-button>
        </div>
        <div v-else>
          <h3>{{ decision === "return" ? "退回补正" : "确认按原额核准" }}</h3>
          <p v-if="decision === 'approve'">
            核准 ¥{{ money(row.declaredTotalFen) }}。如有余额，将登记用户原路退款。
          </p>
          <el-input
            v-model="reason"
            maxlength="500"
            :placeholder="decision === 'return' ? '请填写退回原因' : '审核说明（选填）'"
            type="textarea" />
          <div class="toolbar">
            <el-button @click="decision = ''" :disabled="busy">取消</el-button>
            <el-button
              class="primary"
              @click="review"
              :disabled="busy || (decision === 'return' && !reason.trim())"
              type="primary">
              确认
            </el-button>
          </div>
        </div>
        <el-button v-if="hasPending('review:' + row.id)" @click="original">查询原操作</el-button>
      </section>
    </template>
    <el-dialog
      v-if="picture"
      :model-value="true"
      title="费用凭证"
      class="desk-dialog"
      align-center
      append-to-body
      width="min(680px, 94vw)"
      @close="picture = ''">
      <img :src="picture" alt="费用凭证" class="desk-evidence-image" />
      <template #footer><el-button @click="picture = ''">关闭照片</el-button></template>
    </el-dialog>
  </main>
</template>
