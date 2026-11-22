<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import DeskPanel from "../../components/DeskPanel.vue";
import "./trading.css";
import { onMounted, ref } from "vue";
import { api, ApiError, refreshCsrf } from "../../api/http";
import { query, time, tradeError } from "../../api/trading";
import type { PageResult } from "../../api/trading-types";
import { me } from "../../session/state";
import { acknowledgementRequests } from "../../api/settlement-acknowledgements";
import type { AcknowledgementRequest } from "../../api/settlement-acknowledgements";
import { useSessionView } from "../../session/view";
interface Summary {
  id: string;
  batchNo: string;
  factoryName: string;
  orderCount: number;
  rentBaseFen: string;
  commissionFen: string;
  depositCompensationFen: string;
  freightFen: string;
  factorySettleFen: string;
  actualUnlockFen: string;
  status: string;
  settledAt: string | null;
  generatedAt: string;
}
interface Detail {
  summary: Summary;
  receiverName: string;
  accountMasked: string;
  exceptionCode: string | null;
  lastCheckedAt: string | null;
  lastAcknowledgedAt: string | null;
  snapshotToken: string | null;
}
interface Item {
  id: string;
  orderNo: string;
  orderId: string;
  extensionRentFen: number;
  rentAdjustmentFen: number;
  commissionRateBps: number;
  factoryRentFen: number;
  factoryGoodsFen?: number;
  goodsPaidFen?: number;
  goodsRefundedFen?: number;
  goodsBaseFen?: number;
  initialRentFen: number;
  overdueRentFen: number;
  overdueCommissionFen: number;
  excessCompensationFen: number;
  couponDiscountFen: number;
  rentRefundedFen: number;
  rentBaseFen: number;
  commissionFen: number;
  depositCompensationFen: number;
  freightApprovedFen: number;
  freightRefundedFen: number;
  freightSettleFen: number;
  factorySettleFen: number;
}
const breakdown = [
  ["goodsPaidFen", "实付商品金额"], ["goodsRefundedFen", "已退商品金额"],
  ["goodsBaseFen", "商品结算基数"], ["factoryGoodsFen", "工厂商品应收"],
  ["initialRentFen", "首次实付租金"], ["extensionRentFen", "延期实付租金"],
  ["overdueRentFen", "逾期租金"], ["couponDiscountFen", "优惠券分摊"],
  ["rentRefundedFen", "已退租金"], ["rentAdjustmentFen", "租金调整额"],
  ["rentBaseFen", "租金结算基数"], ["factoryRentFen", "工厂租金应收"],
  ["commissionFen", "平台佣金"], ["overdueCommissionFen", "其中逾期租金佣金"],
  ["depositCompensationFen", "押金赔付"], ["excessCompensationFen", "另收补缴赔付"],
  ["freightApprovedFen", "核准运费"], ["freightRefundedFen", "已退运费"],
  ["freightSettleFen", "应结运费"], ["factorySettleFen", "工厂应结总额"],
] as const;
interface Execution {
  id: string;
  sourceSuborderId: string;
  commissionStatus: string;
  unfreezeStatus: string;
  expectedCommissionFen: number;
  actualCommissionFen: number;
  expectedUnlockFen: number;
  actualUnlockFen: number;
  channelSharingNo: string | null;
  channelFinishNo: string | null;
  exceptionCode: string | null;
  lastQueriedAt: string | null;
}
const state: Record<string, string> = {
  processing: "处理中",
  settled: "已结算",
  pending: "待执行",
  success: "已成功",
  failed: "待技术处理",
  not_required: "无需分佣",
  blocked: "等待分佣",
};
const money = (fen: string | number) => {
  const n = String(fen).padStart(3, "0");
  return n.slice(0, -2) + "." + n.slice(-2);
};
const status = ref(""),
  factory = ref(""),
  from = ref(""),
  to = ref(""),
  page = ref(1),
  total = ref("0"),
  rows = ref<Summary[]>([]);
const detail = ref<Detail | null>(null),
  currentItem = ref<Item | null>(null),
  items = ref<PageResult<Item> | null>(null),
  executions = ref<PageResult<Execution> | null>(null),
  busy = ref(false),
  message = ref(""),
  modal = ref(false),
  remark = ref("");
const pending = ref<AcknowledgementRequest | null>(null);
function close() {
  currentItem.value = null;
  detail.value = null;
  items.value = null;
  executions.value = null;
  modal.value = false;
  remark.value = "";
  pending.value = null;
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
      if (
        e instanceof ApiError &&
        ["PERMISSION_DENIED", "RESOURCE_NOT_FOUND", "LOGIN_REQUIRED"].includes(e.reason)
      ) {
        close();
        rows.value = [];
      }
    }
  } finally {
    if (current()) busy.value = false;
  }
}
const base = "/api/admin/settlements";
function list(n = 1) {
  if (Boolean(from.value) !== Boolean(to.value) || from.value > to.value) {
    message.value = "请填写完整的起止日期";
    return;
  }
  return run(async (current) => {
    const v = await api<PageResult<Summary>>(
      base +
        "?" +
        query({
          status: status.value,
          factoryId: factory.value.trim(),
          fromDate: from.value,
          toDate: to.value,
          page: n,
          pageSize: 20,
        })
    );
    if (current()) {
      close();
      rows.value = v.items;
      page.value = n;
      total.value = v.total;
    }
  });
}
async function read(id: string, current: () => boolean) {
  const p = base + "/" + id;
  const [d, i, e] = await Promise.all([
    api<Detail>(p),
    api<PageResult<Item>>(p + "/items?pageSize=10"),
    api<PageResult<Execution>>(p + "/executions?pageSize=10"),
  ]);
  if (current()) {
    pending.value = me.value ? acknowledgementRequests.find(me.value.userId, id) : null;
    remark.value = pending.value?.body.remark ?? "";
    detail.value = d;
    items.value = i;
    executions.value = e;
  }
}
function change(kind: "items" | "executions", n: number) {
  const d = detail.value;
  if (!d) return;
  return run(async (current) => {
    const p = base + "/" + d.summary.id + "/" + kind + "?pageSize=10&page=" + n;
    if (kind === "items") {
      const r = await api<PageResult<Item>>(p);
      if (current()) items.value = r;
    } else {
      const r = await api<PageResult<Execution>>(p);
      if (current()) executions.value = r;
    }
  });
}
function ack() {
  const d = detail.value;
  const adminId = me.value?.userId;
  const snapshotToken = d?.snapshotToken;
  if (!adminId || !d || !snapshotToken) return;
  const id = d.summary.id;
  return run(async (current) => {
    await refreshCsrf();
    if (!current()) return;
    const replay = acknowledgementRequests.find(adminId, id) !== null;
    const command = acknowledgementRequests.recoverOrCreate(adminId, id, snapshotToken, remark.value.trim());
    pending.value = command;
    try {
      await api(base + "/" + id + "/acknowledgements", "POST", command.body, true, command.key);
    } catch (e) {
      if (e instanceof ApiError && e.outcome === "business-rejection") {
        const snapshotRejected = [
          "SETTLEMENT_SNAPSHOT_CHANGED",
          "SETTLEMENT_SNAPSHOT_EXPIRED",
          "IDEMPOTENCY_CONFLICT",
        ].includes(e.reason);
        // 重试若在权限、限流等前置环节被拒，仍无法判断首次请求是否已入账。
        if (!replay || snapshotRejected) {
          acknowledgementRequests.finish(adminId, id, command);
          if (current()) pending.value = null;
        }
        if (snapshotRejected && current()) {
          modal.value = false;
          await read(id, current);
          if (current()) message.value = "结算记录已刷新，请重新核对后确认。";
          return;
        }
      }
      throw e;
    }
    acknowledgementRequests.finish(adminId, id, command);
    if (current()) {
      pending.value = null;
      modal.value = false;
      remark.value = "";
      await read(id, current);
      if (current()) message.value = "已记录本次核对。";
    }
  });
}
onMounted(() => list());
useDetailScroll(() => currentItem.value ? 2 : detail.value ? 1 : 0);
function resetFilters() {
  status.value = "";
  factory.value = "";
  from.value = "";
  to.value = "";
  return list();
}
</script>
<template>
  <main class="trade-admin">
    <header>
      <h1>{{ currentItem ? "单笔结算明细" : detail ? "工厂结算批次详情" : "工厂结算批次" }}</h1>
      <el-button v-if="currentItem" @click="currentItem = null">返回批次详情</el-button>
    </header>
    <p v-if="message" role="status">{{ message }}</p>
    <template v-if="!detail">
      <DeskPanel title="工厂结算批次" :meta="busy || message ? undefined : '共 ' + total + ' 批'">
        <DeskFilters :busy="busy" @search="list()" @reset="resetFilters">
          <el-form-item label="状态">
            <el-select
              v-model="status"
              :empty-values="[null, undefined]"
              placeholder="全部"
              popper-class="desk-select-menu">
              <el-option value="" label="全部" />
              <el-option value="processing" label="处理中" />
              <el-option value="settled" label="已结算" />
            </el-select>
          </el-form-item>
          <el-form-item label="工厂 ID"><el-input v-model="factory" clearable /></el-form-item>
          <el-form-item label="生成日期">
            <el-date-picker v-model="from" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
          </el-form-item>
          <el-form-item label="结束日期">
            <el-date-picker v-model="to" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
          </el-form-item>
        </DeskFilters>
        <div class="panel scroll">
          <DeskTable
            :data="rows"
            :empty-text="busy ? '正在读取…' : message ? '读取失败' : '当前条件无结算批次'">
            <el-table-column label="批次号" min-width="94" prop="batchNo" />
            <el-table-column label="工厂" min-width="94" prop="factoryName" />
            <el-table-column label="订单数" min-width="94" prop="orderCount" />
            <el-table-column label="租金基数" min-width="94">
              <template #default="{ row: r }">{{ money(r.rentBaseFen) }}</template>
            </el-table-column>
            <el-table-column label="平台佣金" min-width="94">
              <template #default="{ row: r }">{{ money(r.commissionFen) }}</template>
            </el-table-column>
            <el-table-column label="押金赔付" min-width="94">
              <template #default="{ row: r }">{{ money(r.depositCompensationFen) }}</template>
            </el-table-column>
            <el-table-column label="线上运费" min-width="94">
              <template #default="{ row: r }">{{ money(r.freightFen) }}</template>
            </el-table-column>
            <el-table-column label="工厂应结" min-width="94">
              <template #default="{ row: r }">{{ money(r.factorySettleFen) }}</template>
            </el-table-column>
            <el-table-column label="状态" min-width="94">
              <template #default="{ row: r }">{{ state[r.status] }}</template>
            </el-table-column>
            <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
              <template #default="{ row: r }">
                <el-button
                  @click="run((current) => read(r.id, current))"
                  :disabled="busy"
                  size="small"
                  link
                  class="desk-row-link">
                  查看
                </el-button>
              </template>
            </el-table-column>
          </DeskTable>
        </div>
        <DeskPager :page="page" :total="total" :busy="busy" @turn="list(page + $event)" />
      </DeskPanel>
    </template>
    <template v-else-if="currentItem">
      <DeskPanel :title="currentItem.orderNo" :meta="detail.summary.batchNo">
        <dl class="desk-facts">
          <div><dt>结算明细 ID</dt><dd>{{ currentItem.id }}</dd></div>
          <div><dt>订单 ID</dt><dd>{{ currentItem.orderId }}</dd></div>
          <div><dt>所属工厂</dt><dd>{{ detail.summary.factoryName }}</dd></div>
          <div><dt>佣金比例</dt><dd>{{ currentItem.commissionRateBps / 100 }}%</dd></div>
        </dl>
      </DeskPanel>
      <DeskPanel title="结算金额拆分">
        <dl class="desk-facts">
          <template v-for="[key, label] in breakdown" :key="key">
            <div v-if="currentItem[key] != null"><dt>{{ label }}</dt><dd>¥{{ money(currentItem[key]!) }}</dd></div>
          </template>
        </dl>
      </DeskPanel>
    </template>
    <template v-else>
      <el-button @click="close" :disabled="busy">返回批次列表</el-button>
      <section class="panel">
        <h2>{{ detail.summary.factoryName }} · {{ state[detail.summary.status] }}</h2>
        <p>
          批次 {{ detail.summary.batchNo }} · {{ time(detail.summary.generatedAt) }} 生成 ·
          {{ detail.summary.orderCount }} 张订单
        </p>
        <div class="numbers">
          <div>
            租金基数
            <strong>¥{{ money(detail.summary.rentBaseFen) }}</strong>
          </div>
          <div>
            平台佣金
            <strong>¥{{ money(detail.summary.commissionFen) }}</strong>
          </div>
          <div>
            工厂应结
            <strong>¥{{ money(detail.summary.factorySettleFen) }}</strong>
          </div>
          <div>
            实际解冻
            <strong>¥{{ money(detail.summary.actualUnlockFen) }}</strong>
          </div>
        </div>
        <p>
          收款方 {{ detail.receiverName }} · {{ detail.accountMasked }} · 到账时间
          {{ time(detail.summary.settledAt) }}
        </p>
        <p v-if="detail.exceptionCode">
          渠道异常 {{ detail.exceptionCode }} · 最近核对
          {{ time(detail.lastCheckedAt) }}
        </p>
      </section>
      <section v-if="items" class="panel scroll">
        <h2>结算明细</h2>
        <DeskTable :data="items.items" empty-text="暂无记录">
          <el-table-column label="订单" min-width="94">
            <template #default="{ row: i }">
              {{ i.goodsPaidFen !== undefined ? "定制" : "租赁" }} · {{ i.orderNo }}
            </template>
          </el-table-column>
          <el-table-column label="实付商品或租金 / 已退" min-width="138">
            <template #default="{ row: i }">
              {{ money(i.goodsPaidFen ?? i.initialRentFen) }} /
              {{ money(i.goodsRefundedFen ?? i.rentRefundedFen) }}
            </template>
          </el-table-column>
          <el-table-column label="优惠" min-width="94">
            <template #default="{ row: i }">{{ money(i.couponDiscountFen) }}</template>
          </el-table-column>
          <el-table-column label="基数 / 佣金" min-width="94">
            <template #default="{ row: i }">
              {{ money(i.goodsBaseFen ?? i.rentBaseFen) }} / {{ money(i.commissionFen) }}
              <small v-if="i.overdueRentFen">
                其中逾期租金 {{ money(i.overdueRentFen) }}，佣金 {{ money(i.overdueCommissionFen) }}
              </small>
            </template>
          </el-table-column>
          <el-table-column label="押金赔付" min-width="94">
            <template #default="{ row: i }">
              {{ money(i.depositCompensationFen) }}
              <small v-if="i.excessCompensationFen">
                另实收补缴赔付 {{ money(i.excessCompensationFen) }}
              </small>
            </template>
          </el-table-column>
          <el-table-column label="核准运费 / 已退 / 应结" min-width="94">
            <template #default="{ row: i }">
              {{ money(i.freightApprovedFen) }} / {{ money(i.freightRefundedFen) }} /
              {{ money(i.freightSettleFen) }}
            </template>
          </el-table-column>
          <el-table-column label="工厂应结" min-width="94">
            <template #default="{ row: i }">{{ money(i.factorySettleFen) }}</template>
          </el-table-column>
          <el-table-column label="操作" fixed="right" width="100" :show-overflow-tooltip="false">
            <template #default="{ row }">
              <el-button link size="small" class="desk-row-link" @click="currentItem = row">查看明细</el-button>
            </template>
          </el-table-column>
        </DeskTable>
        <DeskPager
          :page="items.page"
          :total="items.total"
          :page-size="items.pageSize"
          :busy="busy"
          @turn="change('items', items.page + $event)" />
      </section>
      <section v-if="executions" class="panel scroll">
        <h2>分佣与解冻记录</h2>
        <DeskTable :data="executions.items" empty-text="暂无记录">
          <el-table-column label="来源子单" min-width="138" prop="sourceSuborderId" />
          <el-table-column label="佣金 · 预计 / 实际" min-width="94">
            <template #default="{ row: e }">
              {{ state[e.commissionStatus] }} · {{ money(e.expectedCommissionFen) }} /
              {{ money(e.actualCommissionFen) }}
            </template>
          </el-table-column>
          <el-table-column label="解冻 · 预计 / 实际" min-width="94">
            <template #default="{ row: e }">
              {{ state[e.unfreezeStatus] }} · {{ money(e.expectedUnlockFen) }} /
              {{ money(e.actualUnlockFen) }}
            </template>
          </el-table-column>
          <el-table-column label="渠道流水" min-width="94">
            <template #default="{ row: e }">
              {{ e.channelSharingNo || "—" }} / {{ e.channelFinishNo || "—" }}
            </template>
          </el-table-column>
          <el-table-column label="异常及查询时间" min-width="138">
            <template #default="{ row: e }">
              {{ e.exceptionCode || "—" }} · {{ time(e.lastQueriedAt) }}
            </template>
          </el-table-column>
        </DeskTable>
        <DeskPager
          :page="executions.page"
          :total="executions.total"
          :page-size="executions.pageSize"
          :busy="busy"
          @turn="change('executions', executions.page + $event)" />
      </section>
      <p v-if="detail.lastAcknowledgedAt">最近已阅 {{ time(detail.lastAcknowledgedAt) }}</p>
      <el-button v-if="detail.snapshotToken" @click="modal = true" :disabled="busy">
        {{ pending ? "按原请求重试已阅" : "记录已阅" }}
      </el-button>
      <el-dialog
        v-model="modal"
        title="确认已核对本批次"
        class="desk-dialog"
        width="min(540px, 94vw)"
        align-center
        append-to-body
        :show-close="!busy"
        :close-on-click-modal="!busy"
        :close-on-press-escape="!busy">
        <p>{{ detail.summary.batchNo }} · 实际解冻 ¥{{ money(detail.summary.actualUnlockFen) }}</p>
        <label>
          核对备注（选填）
          <el-input v-model="remark" maxlength="500" :disabled="busy || !!pending" type="textarea" />
        </label>
        <template #footer>
          <el-button @click="modal = false" :disabled="busy">取消</el-button>
          <el-button type="primary" @click="ack" :disabled="busy">确认已阅</el-button>
        </template>
      </el-dialog>
    </template>
  </main>
</template>
<style scoped>
.scroll {
  overflow-x: auto;
}
td,
th {
  padding: 0.65rem;
  text-align: left;
}
.numbers {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
}
.numbers strong {
  display: block;
  font-size: 1.45rem;
}

textarea {
  display: block;
  width: 100%;
}
</style>
