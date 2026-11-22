<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";
import DeskQueueMetrics from "../../components/DeskQueueMetrics.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import DeskPanel from "../../components/DeskPanel.vue";
import OpenArbitration from "./OpenArbitration.vue";
import "../trading/trading.css";
import { onMounted, ref, watch } from "vue";
import { api } from "../../api/http";
import { command, hasPending, query, recover, time, tradeError } from "../../api/trading";
import { useSessionView } from "../../session/view";
import type { PageResult } from "../../api/trading-types";

type Cash = { rentFen: number; depositFen: number; freightFen: number };
type Plan = {
  direction: "continue" | "terminate";
  version: number;
  locked: boolean;
  solutionSummary: string;
  agreement: { summary: string; confirmedAt: string };
  recovery: string | null;
  goodsLocation: string | null;
  freightResponsibility: string | null;
  refundBasis: string | null;
  depositReason: string | null;
  refundComponents: Cash | null;
  serviceRefund: { components: Cash; basis: string } | null;
  refunds: { refundId: string; amountFen: number; status: string }[];
};
const refundLabels: Record<string, string> = {
  pending: "待提交",
  processing: "退款中",
  success: "退款成功",
  failed: "退款待处理",
  cancelled: "已撤销",
};
interface Issue {
  plan: Plan | null;
  remainingRefundLimits: Cash | null;
  id: string;
  orderNo: string;
  orderId: string;
  factoryName: string;
  version: number;
  status: string;
  scene: string;
  effect: string;
  summary: string;
  createdAt: string;
  supplementRequest: string | null;
  availableActions: string[];
  evidenceIds: string[];
  items: { itemId: string; issueType: string; quantity: number; description: string | null }[];
}
const statuses: Record<string, string> = {
  submitted: "已上报",
  processing: "处理中",
  waiting_evidence: "待买家补证",
  resolved: "已解决",
  transferred_arbitration: "已转仲裁",
  closed: "已关闭",
};
const types: Record<string, string> = {
  not_as_described: "与描述不符",
  quantity_mismatch: "数量不符",
  damaged: "破损",
  hidden_defect: "隐蔽故障",
  other: "其他",
};
const rows = ref<Issue[]>([]),
  detail = ref<Issue | null>(null),
  orderId = ref(""),
  status = ref("");
const page = ref(1),
  total = ref(0),
  reason = ref(""),
  busy = ref(false),
  message = ref("");
const session = useSessionView(() => {
  rows.value = [];
  detail.value = null;
  reason.value = "";
  message.value = "";
  busy.value = false;
  total.value = 0;
  page.value = 1;
});
function slot(issue: Issue) {
  return "issue-evidence:" + issue.id;
}
async function list(next = 1) {
  if (busy.value) return;
  const owner = session.capture();
  busy.value = true;
  message.value = "";
  try {
    const result = await api<PageResult<Issue>>(
      "/api/admin/issues?" +
        query({ orderId: orderId.value.trim(), status: status.value, page: next, pageSize: 20 })
    );
    if (session.current(owner)) {
      rows.value = result.items;
      page.value = result.page;
      total.value = Number(result.total);
      detail.value = null;
      reason.value = "";
    }
  } catch (error) {
    if (session.current(owner)) {
      rows.value = [];
      detail.value = null;
      message.value = tradeError(error);
    }
  } finally {
    if (session.current(owner)) busy.value = false;
  }
}
async function show(id: string) {
  if (busy.value) return;
  const owner = session.capture();
  busy.value = true;
  message.value = "";
  try {
    const issue = await api<Issue>("/api/admin/issues/" + id);
    if (session.current(owner)) {
      detail.value = issue;
      reason.value = "";
    }
  } catch (error) {
    if (session.current(owner)) {
      detail.value = null;
      message.value = tradeError(error);
    }
  } finally {
    if (session.current(owner)) busy.value = false;
  }
}
async function requestEvidence() {
  const issue = detail.value;
  if (!issue || busy.value) return;
  const key = slot(issue),
    owner = session.capture();
  busy.value = true;
  message.value = "";
  try {
    if (hasPending(key)) await recover(key);
    else
      await command(key, "/api/admin/issues/" + issue.id + "/request-evidence", {
        expectedVersion: issue.version,
        reason: reason.value.trim(),
      });
    if (!session.current(owner)) return;
    const refreshed = await api<Issue>("/api/admin/issues/" + issue.id);
    if (session.current(owner)) {
      detail.value = refreshed;
      rows.value = rows.value.map((row) => (row.id === issue.id ? refreshed : row));
      reason.value = "";
    }
  } catch (error) {
    if (session.current(owner)) {
      message.value = tradeError(error);
      if ((error as { reason?: string }).reason === "VERSION_CONFLICT") {
        const refreshed = await api<Issue>("/api/admin/issues/" + issue.id);
        if (session.current(owner)) detail.value = refreshed;
      }
    }
  } finally {
    if (session.current(owner)) busy.value = false;
  }
}
function newForm(issue: Issue | null) {
  const p = issue?.plan;
  const cash = p?.refundComponents || p?.serviceRefund?.components;
  return {
    direction: p?.direction || ("continue" as Plan["direction"]),
    summary: p?.solutionSummary || "",
    agreement: p?.agreement.summary || "",
    confirmedAt: "",
    recovery: p?.recovery || "",
    location: p?.goodsLocation || "",
    freight: p?.freightResponsibility || "",
    refundBasis: p?.refundBasis || p?.serviceRefund?.basis || "",
    depositReason: p?.depositReason || "",
    rentFen: cash?.rentFen || 0,
    depositFen: cash?.depositFen || 0,
    freightFen: cash?.freightFen || 0,
  };
}
const form = ref(newForm(null)),
  editing = ref(false);
watch(detail, (issue) => {
  form.value = newForm(issue);
  editing.value = false;
});
async function resolve() {
  const issue = detail.value;
  if (!issue || busy.value) return;
  const owner = session.capture(),
    slot = "issue-plan:" + issue.id,
    v = form.value;
  busy.value = true;
  message.value = "";
  try {
    if (hasPending(slot)) await recover(slot);
    else {
      const cash = { rentFen: v.rentFen, depositFen: v.depositFen, freightFen: v.freightFen };
      const body = {
        expectedVersion: issue.version,
        direction: v.direction,
        solutionSummary: v.summary.trim(),
        agreement: {
          summary: v.agreement.trim(),
          confirmedAt: new Date(v.confirmedAt).toISOString(),
          evidenceIds: issue.evidenceIds,
        },
        references: [{ relationType: "rental_order", relationId: issue.orderId }],
        ...(v.direction === "terminate"
          ? {
              recovery: v.recovery.trim(),
              goodsLocation: v.location.trim(),
              freightResponsibility: v.freight.trim(),
              refundComponents: cash,
              refundBasis: v.refundBasis.trim(),
              depositReason: v.depositReason.trim() || null,
            }
          : {
              serviceRefund:
                cash.rentFen + cash.depositFen + cash.freightFen > 0
                  ? { components: cash, basis: v.refundBasis.trim() }
                  : null,
            }),
      };
      await command(slot, "/api/admin/issues/" + issue.id + "/resolution", body);
    }
    if (session.current(owner)) {
      const refreshed = await api<Issue>("/api/admin/issues/" + issue.id);
      if (session.current(owner)) {
        detail.value = refreshed;
        rows.value = rows.value.map((row) => (row.id === issue.id ? refreshed : row));
      }
    }
  } catch (e) {
    if (session.current(owner)) message.value = tradeError(e);
  } finally {
    if (session.current(owner)) busy.value = false;
  }
}
onMounted(() => list());
useDetailScroll(() => !!detail.value);
function resetFilters() {
  orderId.value = "";
  status.value = "";
  return list(1);
}
</script>

<template>
  <main class="trade-admin">
    <header class="desk-head">
      <h1>{{ detail ? "订单问题详情" : "订单问题列表" }}</h1>
      <el-button v-if="detail" @click="detail = null" :disabled="busy">返回列表</el-button>
    </header>
    <p v-if="message" role="alert">{{ message }}</p>
    <DeskQueueMetrics v-if="!detail" />
    <DeskPanel v-if="!detail" title="订单问题" :meta="busy || message ? undefined : '共 ' + total + ' 条'">
      <DeskFilters :busy="busy" @search="list()" @reset="resetFilters">
        <el-form-item label="订单 ID">
          <el-input v-model="orderId" aria-label="订单 ID" placeholder="订单 ID" clearable />
        </el-form-item>
        <el-form-item label="问题状态">
          <el-select
            v-model="status"
            aria-label="问题状态"
            :empty-values="[null, undefined]"
            placeholder="全部状态"
            popper-class="desk-select-menu">
            <el-option value="" label="全部状态" />
            <el-option v-for="(label, key) in statuses" :key="key" :value="key" :label="label" />
          </el-select>
        </el-form-item>
      </DeskFilters>

      <DeskTable :data="rows" :empty-text="busy ? '正在读取…' : message ? '读取失败' : '当前没有匹配的问题'">
        <el-table-column label="问题编号" min-width="138" prop="id" />
        <el-table-column label="阶段" min-width="94">
          <template #default="{ row: item }">{{ item.scene === "receipt" ? "收货" : "使用中" }}</template>
        </el-table-column>
        <el-table-column label="关联订单" min-width="94" prop="orderNo" />
        <el-table-column label="工厂" min-width="94" prop="factoryName" />
        <el-table-column label="问题摘要" min-width="94" prop="summary" />
        <el-table-column label="履约处理" min-width="94">
          <template #default="{ row: item }">
            {{
              item.plan?.direction === "terminate"
                ? "已选终止履约方案"
                : item.plan?.direction === "continue"
                ? "继续履约"
                : "待协商"
            }}
          </template>
        </el-table-column>
        <el-table-column label="截止日期" min-width="108">
          <template #default>未提供</template>
        </el-table-column>
        <el-table-column label="状态" min-width="94">
          <template #default="{ row: item }">{{ statuses[item.status] }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
          <template #default="{ row: item }">
            <el-button @click="show(item.id)" :disabled="busy" size="small" link class="desk-row-link">
              详情
            </el-button>
          </template>
        </el-table-column>
      </DeskTable>

      <DeskPager :page="page" :total="total" :busy="busy" @turn="list(page + $event)" />
    </DeskPanel>
    <section v-if="detail" class="panel">
      <OpenArbitration
        v-if="detail.availableActions.includes('open_arbitration')"
        :order-id="detail.orderId"
        :source-id="detail.id"
        source-type="receipt_problem"
        :evidence-ids="detail.evidenceIds" />
      <h2>{{ detail.scene === "receipt" ? "收货问题" : "使用中异常" }} · {{ statuses[detail.status] }}</h2>
      <p>{{ detail.summary }}</p>
      <p>订单 {{ detail.orderNo }} · {{ detail.factoryName }}</p>
      <ul>
        <li v-for="item in detail.items" :key="item.itemId + item.issueType">
          {{ types[item.issueType] }} · {{ item.quantity }} 件
          <span v-if="item.description">· {{ item.description }}</span>
        </li>
      </ul>
      <p v-if="detail.supplementRequest">已要求补证：{{ detail.supplementRequest }}</p>
      <form
        v-if="detail.availableActions.includes('request_evidence') || hasPending(slot(detail))"
        @submit.prevent="requestEvidence">
        <label>
          需要补充的材料
          <el-input
            v-model="reason"
            maxlength="500"
            :disabled="busy || hasPending(slot(detail))"
            type="textarea" />
        </label>
        <el-button
          class="primary"
          :disabled="busy || (!reason.trim() && !hasPending(slot(detail)))"
          native-type="submit"
          type="primary">
          {{ hasPending(slot(detail)) ? "查询原操作" : "要求补证" }}
        </el-button>
      </form>
      <section v-if="detail.plan">
        <h3>
          {{ detail.plan.direction === "terminate" ? "终止履约" : "继续履约" }} · 方案第
          {{ detail.plan.version }} 版
        </h3>
        <p>{{ detail.plan.solutionSummary }}</p>
        <p v-if="detail.plan.recovery">回收安排　{{ detail.plan.recovery }}</p>
        <p v-for="refund in detail.plan.refunds" :key="refund.refundId">
          ¥{{ (refund.amountFen / 100).toFixed(2) }} · {{ refundLabels[refund.status] }} ·
          {{ refund.refundId }}
        </p>
      </section>
      <el-button
        v-if="
          !editing &&
          (detail.availableActions.includes('confirm_plan') ||
            detail.availableActions.includes('revise_plan'))
        "
        :disabled="!detail.remainingRefundLimits"
        @click="editing = true">
        {{ detail.plan ? "修订终止方案" : "录入协商方案" }}
      </el-button>
      <p v-if="!detail.remainingRefundLimits && detail.availableActions.some(a => a === 'confirm_plan' || a === 'revise_plan')" role="status">
        暂未取得可退金额上限，请重新读取本单详情。
      </p>
      <el-button v-if="hasPending('issue-plan:' + detail.id)" :disabled="busy" @click="resolve">
        查询方案提交结果
      </el-button>
      <form v-if="editing && detail.remainingRefundLimits" @submit.prevent="resolve">
        <fieldset :disabled="busy || hasPending('issue-plan:' + detail.id)">
          <legend>双方已确认的协商方案</legend>
          <label>
            履约决定
            <el-select
              v-model="form.direction"
              :disabled="!!detail.plan"
              :empty-values="[null, undefined]"
              placeholder="请选择"
              popper-class="desk-select-menu">
              <el-option value="continue" label="继续履约" />
              <el-option value="terminate" label="终止履约" />
            </el-select>
          </label>
          <label>
            方案说明
            <el-input v-model="form.summary" required maxlength="1000" type="textarea" />
          </label>
          <label>
            双方协商记录
            <el-input v-model="form.agreement" required maxlength="1000" type="textarea" />
          </label>
          <label>
            双方确认时间
            <el-input v-model="form.confirmedAt" type="datetime-local" required />
          </label>
          <template v-if="form.direction === 'terminate'">
            <label>
              道具当前位置
              <el-input v-model="form.location" required maxlength="500" />
            </label>
            <label>
              回收安排
              <el-input v-model="form.recovery" required maxlength="1000" type="textarea" />
            </label>
            <label>
              运费责任
              <el-input v-model="form.freight" required maxlength="500" />
            </label>
          </template>
          <label>
            租金退款（分，最多 {{ detail.remainingRefundLimits.rentFen }}）
            <el-input
              type="number"
              v-model.number="form.rentFen"
              min="0"
              step="1"
              :max="detail.remainingRefundLimits.rentFen"
              required />
          </label>
          <label>
            押金退款（分，最多 {{ detail.remainingRefundLimits.depositFen }}）
            <el-input
              type="number"
              v-model.number="form.depositFen"
              min="0"
              step="1"
              :max="detail.remainingRefundLimits.depositFen"
              required />
          </label>
          <label>
            运费退款（分，最多 {{ detail.remainingRefundLimits.freightFen }}）
            <el-input
              type="number"
              v-model.number="form.freightFen"
              min="0"
              step="1"
              :max="detail.remainingRefundLimits.freightFen"
              required />
          </label>
          <label
            v-if="form.direction === 'terminate' || form.rentFen + form.depositFen + form.freightFen > 0">
            退款依据
            <el-input v-model="form.refundBasis" required maxlength="1000" type="textarea" />
          </label>
          <label
            v-if="
              form.direction === 'terminate' && form.depositFen < detail.remainingRefundLimits.depositFen
            ">
            押金少退原因
            <el-input v-model="form.depositReason" required maxlength="500" type="textarea" />
          </label>
          <el-button class="primary" native-type="submit" type="primary">确认并执行方案</el-button>
          <el-button @click="editing = false">收起</el-button>
        </fieldset>
      </form>
    </section>
  </main>
</template>
