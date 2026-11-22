<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import { ElMessageBox } from "element-plus";
import DeskPager from "../../components/DeskPager.vue";
import "element-plus/es/components/message-box/style/css";
import DeskTable from "../../components/DeskTable.vue";
import DeskQueueMetrics from "../../components/DeskQueueMetrics.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import DeskPanel from "../../components/DeskPanel.vue";
import "../trading/trading.css";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api, refreshCsrf } from "../../api/http";
import { command, hasPending, recover, query, money, time, tradeError } from "../../api/trading";
import type { PageResult } from "../../api/trading-types";
import { useSessionView } from "../../session/view";

type Cash = { rentFen: number; depositFen: number; freightFen: number };
type Outcome = { itemId: string; snId: string | null; quantity: number; result: string };
type Option = {
  id: string;
  itemId: string;
  snId: string | null;
  snCode: string | null;
  name: string;
  quantity: number;
};
type Refund = { refundId: string; status: string; amountFen: number };
type Decision = {
  id: string;
  summary: string;
  responsibility: string;
  lossFen: number;
  rentDeductionFen: number;
  depositDeductionFen: number;
  receivableFen: number;
  refundBasis: string | null;
  refunds: Cash;
  stockOutcomes: Outcome[];
  status: string;
};
type Row = {
  id: string;
  orderId: string;
  orderNo: string;
  factoryName?: string;
  version: number;
  createdAt: string;
  availableActions: string[];
  decisionStage?: string;
  status?: string;
  extensionStatus?: string;
  summary?: string;
  caseNo?: string;
  receivableNo?: string;
  problemType?: string;
  claimId?: string;
  appealReason?: string;
  failureReason?: string;
  requestedEvidence?: string;
  reviewRemark?: string;
  evidenceIds?: string[];
  responseDeadlineAt?: string;
  reason?: string;
  refund?: Refund;
  refunds?: Refund[];
  originalDueDate?: string;
  requestedDueDate?: string;
  rentFen?: number;
  factoryDeadlineAt?: string;
  claimedFen?: number;
  approvedLossFen?: number;
  sourceType?: string;
  overdueRentDueFen?: number;
  overdueLiabilityDueFen?: number;
  overdueRentPaidFen?: number;
  overdueLiabilityPaidFen?: number;
  confirmedLossFen?: number;
  receivableFen?: number;
  paidFen?: number;
  outstandingFen?: number;
  depositDeductedFen?: number;
  waivedFen?: number;
  depositBalance?: { paidFen: number; deductedFen: number; refundedFen: number; reservedFen: number };
  decision?: Decision;
  stockOptions?: Option[];
};
const amount = (fen?: number | null) => (fen == null ? "—" : "¥" + money(fen));
const collections: Record<string, [string, string]> = {
  claims: ["工厂索赔", "claims"],
  arbitrations: ["仲裁案件", "arbitrations"],
  extensions: ["延期申请", "extensions"],
  receivables: ["订单补缴", "compensation-receivables"],
};
const labels: Record<string, string> = {
  draft: "草稿",
  submitted: "待平台审核",
  admin_reviewing: "审核中",
  supplement_required: "待工厂补证",
  waiting_user_response: "待买家回应",
  user_confirmed: "买家已确认",
  user_appealed: "已申诉",
  auto_confirmed: "到期生效",
  executing: "执行中",
  execution_failed: "执行待恢复",
  rejected: "已驳回",
  withdrawn: "已撤回",
  closed: "已关闭",
  open: "待审理",
  evidence_review: "材料审核中",
  waiting_evidence: "待补证",
  decision_draft: "裁决草稿",
  decided: "已裁决",
  cancelled: "已取消",
  pending: "待处理",
  paying: "支付中",
  paid: "已支付",
  waived: "已减免",
  pending_payment: "待付款",
  pending_factory: "待工厂审批",
  factory_warning: "审批临近截止",
  approved: "已生效",
  rejected_refunding: "已拒绝，退款中",
  rejected_refunded: "已拒绝，已退款",
  payment_failed: "付款已关闭",
  processing: "退款中",
  success: "退款成功",
  failed: "退款待处理",
  buyer: "买家",
  factory: "工厂",
  shared: "双方",
  damaged: "损坏",
  missing: "缺失",
  lost_item: "遗失",
  other: "其他",
  platform: "平台",
  unknown: "待明确",
  no_change: "保留当前实物状态",
  repair: "维修",
  lost: "丢失",
  scrap: "报废",
  buyout: "买断",
};
const route = useRoute(),
  kind = computed(() => route.path.split("/").pop() || ""),
  collection = computed(() => collections[kind.value] || collections.claims);
const base = computed(() => "/api/admin/" + collection.value[1]);
const rows = ref<Row[]>([]),
  detail = ref<Row | null>(null),
  order = ref(""),
  page = ref(1),
  total = ref(0),
  busy = ref(false),
  message = ref(""),
  picture = ref("");
const stage = ref("");
const stages: Record<string, string> = {
  awaiting_decision: "等待裁决",
  decided: "裁决完成",
  historical: "撤销历史",
};
const requestText = ref(""),
  selectedEvidence = ref<string[]>([]);
const review = ref("approve"),
  remark = ref(""),
  party = ref("buyer"),
  loss = ref(0),
  rent = ref(0),
  basis = ref(""),
  responsibility = ref("buyer");
const cash = ref<Cash>({ rentFen: 0, depositFen: 0, freightFen: 0 }),
  outcomes = ref<Outcome[]>([]),
  selection = ref("");
let round = 0;
function reset() {
  round++;
  stage.value = "";
  rows.value = [];
  detail.value = null;
  order.value = "";
  picture.value = "";
  busy.value = false;
  message.value = "";
  page.value = 1;
  total.value = 0;
}
const session = useSessionView(reset);
function run(work: (current: () => boolean) => Promise<void>) {
  if (busy.value) return;
  const path = route.path,
    owner = session.capture(),
    sequence = ++round;
  const current = () => session.current(owner) && sequence === round && path === route.path;
  busy.value = true;
  message.value = "";
  return work(current)
    .catch((e) => {
      if (current()) message.value = tradeError(e);
    })
    .finally(() => {
      if (current()) busy.value = false;
    });
}
async function pageData(next: number) {
  return api<PageResult<Row>>(
    base.value +
      "?" +
      query({
        orderId: order.value.trim(),
        decisionStage: kind.value === "arbitrations" ? stage.value : "",
        page: next,
        pageSize: 20,
      })
  );
}
async function list(next = 1) {
  return run(async (current) => {
    const r = await pageData(next);
    if (current()) {
      rows.value = r.items;
      page.value = next;
      total.value = Number(r.total);
      detail.value = null;
      picture.value = "";
    }
  });
}
function display(r: Row) {
  detail.value = r;
  picture.value = "";
  review.value = "approve";
  requestText.value = "";
  selectedEvidence.value = [];
  remark.value = r.decision?.summary || "";
  loss.value = r.decision?.lossFen ?? r.claimedFen ?? 0;
  responsibility.value = r.decision?.responsibility || "buyer";
  rent.value = r.decision?.rentDeductionFen || 0;
  basis.value = r.decision?.refundBasis || "";
  cash.value = { ...(r.decision?.refunds || { rentFen: 0, depositFen: 0, freightFen: 0 }) };
  outcomes.value = (r.decision?.stockOutcomes || []).map((v) => ({ ...v }));
  selection.value = "";
  rows.value = rows.value.map((x) => (x.id === r.id ? r : x));
}
function show(id: string) {
  return run(async (current) => {
    const r = await api<Row>(base.value + "/" + id);
    if (current()) display(r);
  });
}
function action(suffix: string, body: object) {
  const r = detail.value;
  if (!r) return;
  return run(async (current) => {
    const slot = "review:" + r.id;
    if (hasPending(slot)) await recover(slot);
    else await command(slot, base.value + "/" + r.id + "/" + suffix, { expectedVersion: r.version, ...body });
    if (current()) {
      const updated = await api<Row>(base.value + "/" + r.id);
      if (!current()) return;
      if (kind.value === "arbitrations" && updated.decisionStage !== r.decisionStage) {
        let next = page.value;
        let result = await pageData(next);
        if (!current()) return;
        if (next > 1 && !result.items.length) {
          next = Math.max(1, Math.ceil(Number(result.total) / 20));
          result = await pageData(next);
        }
        if (!current()) return;
        rows.value = result.items;
        page.value = next;
        total.value = Number(result.total);
      }
      display(updated);
    }
  });
}
function evidence(id: string) {
  const r = detail.value;
  if (!r) return;
  return run(async (current) => {
    await refreshCsrf();
    if (!current()) return;
    const d = await api<{ url: string }>(
      "/api/admin/rental-orders/" + r.orderId + "/evidence/" + id + "/view",
      "POST",
      {}
    );
    if (current()) picture.value = d.url;
  });
}
const available = computed(() => {
  const b = detail.value?.depositBalance;
  return b ? b.paidFen - b.deductedFen - b.refundedFen - b.reservedFen : 0;
});
const retained = computed(
  () => available.value - Math.min(available.value, loss.value) - cash.value.depositFen
);
function validBuyerCharge(party: string, loss: number, rent: number) {
  return (loss === 0 && rent === 0) || party === "buyer" || party === "shared";
}
const validDraft = computed(() => validBuyerCharge(responsibility.value, loss.value, rent.value));
const confirmable = computed(() => {
  const r = detail.value,
    d = r?.decision;
  return (
    !!d &&
    validBuyerCharge(d.responsibility, d.lossFen, d.rentDeductionFen) &&
    (!r.claimId || available.value === d.depositDeductionFen + d.refunds.depositFen)
  );
});
function addOutcome() {
  const opt = detail.value?.stockOptions?.find((s) => s.id === selection.value);
  if (opt) outcomes.value.push({ itemId: opt.itemId, snId: opt.snId, quantity: 1, result: "no_change" });
}
function option(o: Outcome) {
  return detail.value?.stockOptions?.find((s) => s.itemId === o.itemId && s.snId === o.snId);
}
function save() {
  if (!validDraft.value) return;
  return action("decision-draft", {
    responsibility: responsibility.value,
    lossFen: loss.value,
    rentDeductionFen: rent.value,
    refunds: cash.value,
    stockOutcomes: outcomes.value,
    summary: remark.value.trim(),
    ...(basis.value.trim() ? { refundBasis: basis.value.trim() } : {}),
  });
}
async function confirm() {
  const record = detail.value;
  const decision = record?.decision;
  if (!decision || !confirmable.value || busy.value) return;
  const owner = session.capture();
  try {
    await ElMessageBox.confirm("确认后将按已保存的裁决处理资金与库存。", "确认执行裁决", {
      confirmButtonText: "确认执行",
      cancelButtonText: "取消",
      type: "warning",
    });
  } catch {
    return;
  }
  if (session.current(owner) && detail.value === record && record.decision === decision && confirmable.value)
    return action("decision-confirm", { decisionId: decision.id });
}
watch(
  () => route.path,
  () => {
    reset();
    order.value = typeof route.query.orderId === "string" ? route.query.orderId : "";
    if (collections[kind.value]) list();
  },
  { immediate: true }
);
useDetailScroll(() => !!detail.value);
function resetFilters() {
  order.value = "";
  stage.value = "";
  return list(1);
}
</script>

<template>
  <main class="trade-admin">
    <header class="desk-head">
      <h1>{{ collection[0] }}{{ detail ? "详情" : "" }}</h1>
      <el-button
        v-if="detail"
        @click="
          detail = null;
          picture = '';
        "
        :disabled="busy">
        返回列表
      </el-button>
    </header>
    <p v-if="message" role="alert">{{ message }}</p>
    <DeskQueueMetrics v-if="!detail" />
    <DeskPanel
      v-if="!detail"
      :title="collection[0] + '列表'"
      :meta="busy || message ? undefined : '共 ' + total + ' 条'">
      <DeskFilters :busy="busy" @search="list()" @reset="resetFilters">
        <el-form-item label="订单 ID"><el-input v-model="order" clearable /></el-form-item>
        <el-form-item label="裁决阶段" v-if="kind === 'arbitrations'">
          <el-select
            aria-label="裁决阶段"
            v-model="stage"
            :disabled="busy"
            @change="list()"
            :empty-values="[null, undefined]"
            placeholder="全部有效案件"
            popper-class="desk-select-menu">
            <el-option value="" label="全部有效案件" />
            <el-option v-for="(label, key) in stages" :key="key" :value="key" :label="label" />
          </el-select>
        </el-form-item>
      </DeskFilters>
      <DeskTable :data="rows" :empty-text="busy ? '正在读取…' : message ? '读取失败' : '暂无符合条件的记录'">
        <el-table-column
          :label="
            { claims: '索赔编号', arbitrations: '仲裁编号', receivables: '待缴编号', extensions: '申请编号' }[
              kind
            ]
          "
          min-width="138">
          <template #default="{ row: r }">{{ r.receivableNo || r.caseNo || r.id }}</template>
        </el-table-column>
        <el-table-column label="订单号" min-width="138" prop="orderNo" />
        <el-table-column label="工厂" min-width="94">
          <template #default="{ row: r }">{{ r.factoryName || "—" }}</template>
        </el-table-column>
        <el-table-column v-if="kind === 'claims'" label="问题类型" min-width="94">
          <template #default="{ row: r }">{{ labels[r.problemType || ""] || r.problemType || "—" }}</template>
        </el-table-column>
        <el-table-column v-if="kind === 'claims'" label="申请金额" min-width="94">
          <template #default="{ row: r }">{{ amount(r.claimedFen) }}</template>
        </el-table-column>
        <el-table-column v-if="kind === 'claims'" label="证据数" min-width="94">
          <template #default="{ row: r }">{{ r.evidenceIds?.length ?? "—" }}</template>
        </el-table-column>
        <el-table-column
          v-if="kind === 'extensions'"
          label="原归还日"
          min-width="94"
          prop="originalDueDate" />
        <el-table-column
          v-if="kind === 'extensions'"
          label="申请归还日"
          min-width="94"
          prop="requestedDueDate" />
        <el-table-column v-if="kind === 'extensions'" label="延期租金" min-width="94">
          <template #default="{ row: r }">{{ amount(r.rentFen) }}</template>
        </el-table-column>
        <el-table-column v-if="kind === 'receivables'" label="确认损失" min-width="94">
          <template #default="{ row: r }">{{ amount(r.confirmedLossFen) }}</template>
        </el-table-column>
        <el-table-column v-if="kind === 'receivables'" label="押金抵扣" min-width="94">
          <template #default="{ row: r }">{{ amount(r.depositDeductedFen) }}</template>
        </el-table-column>
        <el-table-column v-if="kind === 'receivables'" label="待缴余额" min-width="94">
          <template #default="{ row: r }">{{ amount(r.outstandingFen) }}</template>
        </el-table-column>
        <el-table-column :label="kind === 'arbitrations' ? '裁决阶段' : '当前状态'" min-width="94">
          <template #default="{ row: r }">
            {{
              kind === "arbitrations"
                ? stages[r.decisionStage || ""]
                : labels[r.status || r.extensionStatus || ""]
            }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="138">
          <template #default="{ row: r }">{{ time(r.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
          <template #default="{ row: r }">
            <el-button @click="show(r.id)" :disabled="busy" size="small" link class="desk-row-link">
              详情
            </el-button>
          </template>
        </el-table-column>
      </DeskTable>
      <DeskPager :page="page" :total="total" :busy="busy" @turn="list(page + $event)" />
    </DeskPanel>
    <section v-if="detail" class="panel">
      <h2>
        {{ detail.caseNo || detail.orderNo }} · {{ labels[detail.status || detail.extensionStatus || ""] }}
      </h2>
      <el-button :disabled="busy" @click="show(detail.id)">刷新进度</el-button>
      <p v-if="detail.summary">{{ detail.summary }}</p>
      <p v-if="detail.appealReason">申诉说明　{{ detail.appealReason }}</p>
      <p v-if="detail.requestedEvidence || detail.reviewRemark">
        {{ detail.requestedEvidence || detail.reviewRemark }}
      </p>
      <p v-if="detail.failureReason" role="alert">执行待恢复　{{ detail.failureReason }}</p>
      <el-button v-for="(id, i) in detail.evidenceIds" :key="id" @click="evidence(id)" :disabled="busy">
        查看材料 {{ i + 1 }}
      </el-button>
      <img v-if="picture" :src="picture" alt="案件材料" style="max-width: 100%; max-height: 60vh" />
      <p v-if="kind === 'extensions'">
        归还日 {{ detail.originalDueDate }} → {{ detail.requestedDueDate }} · 延期租金 ¥{{
          money(detail.rentFen!)
        }}
        · 审批截止 {{ time(detail.factoryDeadlineAt || null) }} {{ detail.reason }}
      </p>
      <p v-if="detail.refund">
        退款 ¥{{ money(detail.refund.amountFen) }} · {{ labels[detail.refund.status] }}
      </p>
      <template v-if="kind === 'receivables'">
        <template v-if="detail.sourceType === 'overdue_return'">
          <p>
            逾期租金应补 ¥{{ money(detail.overdueRentDueFen!) }} · 已补 ¥{{
              money(detail.overdueRentPaidFen!)
            }}
          </p>
          <p>
            责任扣款应补 ¥{{ money(detail.overdueLiabilityDueFen!) }} · 已补 ¥{{
              money(detail.overdueLiabilityPaidFen!)
            }}
          </p>
        </template>
        <p v-else>
          核定损失 ¥{{ money(detail.confirmedLossFen!) }} · 押金抵扣 ¥{{ money(detail.depositDeductedFen!) }}
        </p>
        <p>
          应补 ¥{{ money(detail.receivableFen!) }} · 已缴 ¥{{ money(detail.paidFen!) }} · 减免 ¥{{
            money(detail.waivedFen!)
          }}
          · 待缴 ¥{{ money(detail.outstandingFen!) }}
        </p>
      </template>
      <p v-if="kind === 'claims'">
        申请金额 ¥{{ money(detail.claimedFen || 0) }}
        <span v-if="detail.approvedLossFen != null">· 已核定 ¥{{ money(detail.approvedLossFen) }}</span>
        <span v-if="detail.responseDeadlineAt">· 买家回应截止 {{ time(detail.responseDeadlineAt) }}</span>
      </p>
      <form
        v-if="detail.availableActions.includes('review')"
        @submit.prevent="
          action('review', {
            decision: review,
            remark: remark.trim(),
            ...(review === 'approve' ? { lossFen: loss } : {}),
          })
        ">
        <label>
          处理方式
          <el-select
            v-model="review"
            :empty-values="[null, undefined]"
            placeholder="请选择"
            popper-class="desk-select-menu">
            <el-option value="approve" label="核定金额" />
            <el-option value="supplement" label="要求补证" />
            <el-option value="reject" label="驳回" />
          </el-select>
        </label>
        <label v-if="review === 'approve'">
          核定损失（分）
          <el-input v-model.number="loss" type="number" min="0" step="1" required />
        </label>
        <label>
          审核意见
          <el-input v-model="remark" required maxlength="500" type="textarea" />
        </label>
        <el-button class="primary" :disabled="busy || !remark.trim()" native-type="submit" type="primary">
          提交审核
        </el-button>
      </form>
      <template v-if="detail.depositBalance">
        <h3>押金核对</h3>
        <p>
          实收 ¥{{ money(detail.depositBalance.paidFen) }} · 历史已扣 ¥{{
            money(detail.depositBalance.deductedFen)
          }}
          · 已退 ¥{{ money(detail.depositBalance.refundedFen) }} · 原退款单占用 ¥{{
            money(detail.depositBalance.reservedFen)
          }}
        </p>
        <p>
          {{
            detail.claimId
              ? "归还索赔须交代全部押金去向。需要继续冻结的款项可保存在草稿中，暂缓终局确认。"
              : "履约继续时，裁决后剩余押金随原合同保留，在正常归还时处理。"
          }}
        </p>
        <p v-for="f in detail.refunds" :key="f.refundId">
          退款 ¥{{ money(f.amountFen) }} · {{ labels[f.status] }} · {{ f.refundId }}
        </p>
      </template>
      <div v-if="detail.decision">
        <h3>{{ detail.decision.status === "draft" ? "已保存的裁决草稿" : "生效裁决" }}</h3>
        <p>{{ detail.decision.summary }} · 责任方 {{ labels[detail.decision.responsibility] }}</p>
        <p>
          押金抵扣 ¥{{ money(detail.decision.depositDeductionFen) }} · 另行补缴 ¥{{
            money(detail.decision.receivableFen)
          }}
          · 拟退押金 ¥{{ money(detail.decision.refunds.depositFen) }}
        </p>
        <p v-if="detail.decision.refundBasis">退款依据　{{ detail.decision.refundBasis }}</p>
        <p>
          租金扣款 ¥{{ money(detail.decision.rentDeductionFen) }} · 退租金 ¥{{
            money(detail.decision.refunds.rentFen)
          }}
          · 退运费 ¥{{ money(detail.decision.refunds.freightFen) }}
        </p>
        <p v-for="(o, i) in detail.decision.stockOutcomes" :key="i">
          {{ option(o)?.name || o.itemId }} {{ option(o)?.snCode || o.snId }} · {{ o.quantity }} 件 ·
          {{ labels[o.result] }}
        </p>
        <p
          v-if="
            detail.decision.status === 'draft' &&
            !validBuyerCharge(
              detail.decision.responsibility,
              detail.decision.lossFen,
              detail.decision.rentDeductionFen
            )
          "
          role="alert">
          已保存草稿的买家扣款与责任方不符，请修正并重新保存。
        </p>
        <el-button
          v-if="detail.availableActions.includes('confirm_decision')"
          :disabled="busy || !confirmable"
          @click="confirm">
          确认执行已保存裁决
        </el-button>
      </div>
      <form v-if="detail.availableActions.includes('draft_decision')" @submit.prevent="save">
        <fieldset :disabled="busy">
          <legend>编辑裁决草稿</legend>
          <label>
            责任方
            <el-select
              :disabled="busy"
              v-model="responsibility"
              :empty-values="[null, undefined]"
              placeholder="请选择"
              popper-class="desk-select-menu">
              <el-option
                v-for="k in ['buyer', 'factory', 'platform', 'shared', 'unknown']"
                :value="k"
                :label="labels[k]" />
            </el-select>
          </label>
          <p>金额单位为分。共同责任只填证据支持的买家份额，并在裁决理由中说明依据。</p>
          <p v-if="!validDraft" role="alert">
            当前责任方不能扣买家款项，请将买家责任损失和租金扣款改为 0。独立退款可按依据填写。
          </p>
          <label>
            买家责任损失（分）
            <el-input type="number" min="0" step="1" required v-model.number="loss" />
          </label>
          <label>
            租金扣款（分）
            <el-input type="number" min="0" step="1" required v-model.number="rent" />
          </label>
          <label>
            应退押金（分）
            <el-input type="number" min="0" step="1" required v-model.number="cash.depositFen" />
          </label>
          <label>
            应退租金（分）
            <el-input type="number" min="0" step="1" required v-model.number="cash.rentFen" />
          </label>
          <label>
            应退运费（分）
            <el-input type="number" min="0" step="1" required v-model.number="cash.freightFen" />
          </label>
          <p>本草稿处理后剩余押金 ¥{{ money(retained) }}</p>
          <label v-if="cash.rentFen + cash.depositFen + cash.freightFen > 0">
            退款依据
            <el-input required maxlength="1000" v-model="basis" type="textarea" />
          </label>
          <label>
            实物处置
            <el-select
              :disabled="busy"
              v-model="selection"
              :empty-values="[null, undefined]"
              placeholder="选择本单道具"
              popper-class="desk-select-menu">
              <el-option value="" label="选择本单道具" />
              <el-option
                v-for="s in detail.stockOptions"
                :value="s.id"
                :key="s.id"
                :label="s.name + s.snCode + ' · ' + s.quantity + ' 件'" />
            </el-select>
          </label>
          <el-button @click="addOutcome" :disabled="!selection">添加处置项</el-button>
          <div v-for="(o, i) in outcomes" :key="i">
            {{ option(o)?.name }} {{ option(o)?.snCode }}
            <el-input
              type="number"
              min="1"
              step="1"
              required
              :max="option(o)?.quantity"
              v-model.number="o.quantity"
              aria-label="处置数量" />
            <el-select
              :disabled="busy"
              v-model="o.result"
              aria-label="实际处置"
              :empty-values="[null, undefined]"
              placeholder="请选择"
              popper-class="desk-select-menu">
              <el-option
                v-for="k in o.snId
                  ? ['no_change', 'repair', 'lost', 'scrap']
                  : ['no_change', 'buyout', 'lost', 'scrap']"
                :value="k"
                :label="labels[k]" />
            </el-select>
            <el-button @click="outcomes.splice(i, 1)">移除</el-button>
          </div>
          <label>
            裁决理由
            <el-input v-model="remark" required maxlength="1000" type="textarea" />
          </label>
          <el-button
            class="primary"
            :disabled="!remark.trim() || !validDraft || retained < 0"
            native-type="submit"
            type="primary">
            保存草稿
          </el-button>
        </fieldset>
      </form>
      <form
        v-if="detail.availableActions.includes('request_evidence')"
        @submit.prevent="action('request-evidence', { party, reason: requestText.trim() })">
        <label>
          补证方
          <el-select
            v-model="party"
            :empty-values="[null, undefined]"
            placeholder="请选择"
            popper-class="desk-select-menu">
            <el-option value="buyer" label="买家" />
            <el-option value="factory" label="工厂" />
          </el-select>
        </label>
        <label>
          材料要求
          <el-input v-model="requestText" maxlength="500" required type="textarea" />
        </label>
        <el-button :disabled="busy || !requestText.trim()" native-type="submit">要求补证</el-button>
      </form>
      <form
        v-if="detail.availableActions.includes('supplement')"
        @submit.prevent="
          action('supplement', {
            summary: requestText.trim(),
            evidence: { evidenceIds: selectedEvidence, uploadReceiptIds: [] },
          })
        ">
        <label>
          平台补充说明
          <el-input v-model="requestText" required maxlength="1000" type="textarea" />
        </label>
        <el-checkbox-group v-model="selectedEvidence">
          <el-checkbox v-for="(id, i) in detail.evidenceIds" :key="id" :value="id">
            引用材料 {{ i + 1 }}
          </el-checkbox>
        </el-checkbox-group>
        <el-button :disabled="busy || !requestText.trim()" native-type="submit">补充案件记录</el-button>
      </form>
      <el-button v-if="hasPending('review:' + detail.id)" @click="action('', {})" :disabled="busy">
        查询原操作
      </el-button>
    </section>
  </main>
</template>
