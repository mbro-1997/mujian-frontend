<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import DeskPanel from "../../components/DeskPanel.vue";
import "../trading/trading.css";
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "../../api/http";
import { me } from "../../session/state";
import { useSessionView } from "../../session/view";
import { command, tradeError, money } from "../../api/trading";
import type { PageResult } from "../../api/trading-types";
interface Evidence {
  materialId: string;
  name: string;
  type: string;
}
interface Row {
  id: string;
  orderId: string;
  version: number;
  state: string;
  evidence: Evidence[];
  originalDate?: string;
  requestedDate?: string;
  reason?: string;
  decisionNote?: string;
  problem?: string;
  issueType?: string;
  requestedSolution?: string;
  resolutionNote?: string;
  resolutionType?: string;
  goodsAvailableFen: number;
  freightAvailableFen: number;
  goodsRefundFen: number;
  freightRefundFen: number;
  refundId?: string;
  replacementDeliveryId?: string;
}
interface CaseContext {
  caseId: string;
  caseVersion: number;
  state: string;
  factoryStatements: {
    id: string;
    summary: string;
    at: string;
    evidence: Evidence[];
  }[];
  notes: { id: string; channel: string; summary: string; at: string }[];
}
const context = ref<CaseContext | null>(null),
  contact = ref(""),
  channel = ref("phone");
const route = useRoute(),
  ext = computed(() => route.path.endsWith("/extensions")),
  base = computed(() => "/api/admin/custom-" + (ext.value ? "extensions" : "after-sales"));
const rows = ref<Row[]>([]),
  detail = ref<Row | null>(null),
  page = ref(1),
  total = ref(0),
  busy = ref(false),
  error = ref(""),
  status = ref(""),
  remark = ref(""),
  decision = ref("approved"),
  resolution = ref("record_only"),
  goods = ref(0),
  freight = ref(0),
  preview = ref("");
const labels: Record<string, string> = {
  draft: "草稿",
  submitted: "待处理",
  processing: "处理中",
  approved: "已批准",
  rejected: "已驳回",
  waiting_factory: "待工厂执行",
  waiting_user: "待买家确认",
  refund_processing: "退款中",
  resolved: "已解决",
  closed: "已关闭",
  cancelled: "已取消",
  record_only: "记录并继续验收",
  rework: "返工重交",
  partial_refund: "部分退款",
  full_refund: "全额退款",
  platform_intervention: "平台介入",
};
const options = computed(() =>
  ext.value
    ? ["submitted", "approved", "rejected", "cancelled"]
    : [
        "submitted",
        "processing",
        "waiting_factory",
        "waiting_user",
        "refund_processing",
        "resolved",
        "closed",
        "cancelled",
      ]
);
const allowed = (key: string) => me.value?.permissions.includes("admin:custom:" + key);
const funds = computed(() => allowed("refund-approve")),
  writable = computed(() =>
    ext.value
      ? allowed("extension-review") && detail.value?.state === "submitted"
      : allowed("after-sale-resolve") &&
        !!detail.value &&
        ["submitted", "processing"].includes(detail.value.state) &&
        (!detail.value.resolutionType || detail.value.resolutionType === "platform_intervention")
  );
let seq = 0;
function reset() {
  seq++;
  context.value = null;
  contact.value = "";
  rows.value = [];
  detail.value = null;
  status.value = "";
  busy.value = false;
  error.value = "";
  preview.value = "";
  page.value = 1;
  total.value = 0;
}
const session = useSessionView(reset);
async function run(work: (current: () => boolean) => Promise<void>) {
  if (busy.value) return;
  const n = ++seq,
    owner = session.capture(),
    current = () => session.current(owner) && n === seq;
  busy.value = true;
  error.value = "";
  try {
    await work(current);
  } catch (e) {
    if (current()) error.value = tradeError(e);
  } finally {
    if (current()) busy.value = false;
  }
}
function show(r: Row) {
  contact.value = "";
  detail.value = r;
  preview.value = "";
  remark.value = "";
  decision.value = "approved";
  resolution.value = "record_only";
  goods.value = 0;
  freight.value = 0;
}
function read(next: number) {
  return run(async (cur) => {
    const p = await api<PageResult<Row>>(
      base.value + "?pageSize=20&page=" + next + (status.value ? "&status=" + status.value : "")
    );
    if (cur()) {
      rows.value = p.items;
      page.value = next;
      total.value = Number(p.total);
      detail.value = null;
      preview.value = "";
    }
  });
}
function open(id: string) {
  return run(async (cur) => {
    const [r, c] = await Promise.all([
      api<Row>(base.value + "/" + id),
      api<CaseContext>(base.value + "/" + id + "/case"),
    ]);
    if (cur()) {
      show(r);
      context.value = c;
    }
  });
}
function recordContact() {
  return run(async (cur) => {
    const c = context.value!,
      id = detail.value!.id;
    await command("case-contact:" + c.caseId, "/api/admin/cases/" + c.caseId + "/contact-records", {
      caseVersion: c.caseVersion,
      contactChannel: channel.value,
      summary: contact.value,
      references: [],
    });
    if (!cur()) return;
    const updated = await api<CaseContext>(base.value + "/" + id + "/case");
    if (cur()) {
      context.value = updated;
      contact.value = "";
    }
  });
}
function evidence(file: Evidence) {
  return run(async (cur) => {
    const r = await api<{ url: string }>(
      "/api/admin/custom-orders/" + detail.value!.orderId + "/materials/" + file.materialId + "/view"
    );
    if (cur()) preview.value = r.url;
  });
}
function submit() {
  return run(async (cur) => {
    const r = detail.value!;
    const body = ext.value
      ? {
          expectedVersion: r.version,
          decision: decision.value,
          note: remark.value,
        }
      : {
          expectedVersion: r.version,
          resolutionType: resolution.value,
          reason: remark.value,
          goodsRefundFen: goods.value,
          freightRefundFen: freight.value,
        };
    await command(
      "custom:" + r.id,
      base.value + "/" + r.id + (ext.value ? "/decision" : "/resolution"),
      body
    );
    if (!cur()) return;
    const [updated, c] = await Promise.all([
      api<Row>(base.value + "/" + r.id),
      api<CaseContext>(base.value + "/" + r.id + "/case"),
    ]);
    if (cur()) {
      show(updated);
      context.value = c;
      rows.value = rows.value
        .map((row) => (row.id === r.id ? updated : row))
        .filter((row) => !status.value || row.state === status.value);
    }
  });
}
watch(
  () => route.path,
  () => {
    reset();
    void read(1);
  },
  { immediate: true }
);
useDetailScroll(() => !!detail.value);
function resetFilters() {
  status.value = "";
  return read(1);
}
</script>
<template>
  <main class="trade-admin">
    <header class="desk-head">
      <h1>{{ ext ? "定制交付延期" : "定制售后" }}{{ detail ? "详情" : "" }}</h1>
      <el-button
        v-if="detail"
        :disabled="busy"
        @click="
          detail = null;
          context = null;
          preview = '';
        ">
        返回列表
      </el-button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <DeskPanel
      v-if="!detail"
      :title="ext ? '延期申请' : '售后申请'"
      :meta="busy || error ? undefined : '共 ' + total + ' 条'">
      <DeskFilters :busy="busy" @search="read(1)" @reset="resetFilters">
        <el-form-item label="办理状态">
          <el-select
            v-model="status"
            :disabled="busy"
            @change="read(1)"
            :empty-values="[null, undefined]"
            placeholder="全部"
            popper-class="desk-select-menu">
            <el-option value="" label="全部" />
            <el-option v-for="s in options" :key="s" :value="s" :label="labels[s]" />
          </el-select>
        </el-form-item>
      </DeskFilters>
      <DeskTable :data="rows" :empty-text="busy ? '正在读取…' : error ? '读取失败' : '暂无符合条件的申请'">
        <el-table-column label="申请编号" min-width="138" prop="id" />
        <el-table-column label="定制订单" min-width="94" prop="orderId" />
        <el-table-column v-if="ext" label="原交付日 / 申请交付日" min-width="94">
          <template #default="{ row: r }">{{ r.originalDate }} → {{ r.requestedDate }}</template>
        </el-table-column>
        <el-table-column label="申请内容" min-width="94">
          <template #default="{ row: r }">{{ r.reason || r.problem }}</template>
        </el-table-column>
        <el-table-column label="状态" min-width="94">
          <template #default="{ row: r }">{{ labels[r.state] }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
          <template #default="{ row: r }">
            <el-button :disabled="busy" @click="open(r.id)" size="small" link class="desk-row-link">
              查看
            </el-button>
          </template>
        </el-table-column>
      </DeskTable>

      <DeskPager :page="page" :total="total" :busy="busy" @turn="read(page + $event)" />
    </DeskPanel>
    <section v-if="detail" class="panel">
      <h2>{{ ext ? "延期申请" : "售后申请" }} · {{ labels[detail.state] }}</h2>
      <p>订单 {{ detail.orderId }}</p>
      <p v-if="ext">{{ detail.originalDate }} → {{ detail.requestedDate }}　{{ detail.reason }}</p>
      <p v-else>
        {{ detail.problem }} · 买家诉求
        {{ labels[detail.requestedSolution || ""] }}
      </p>
      <p>{{ detail.decisionNote || detail.resolutionNote }}</p>
      <el-button v-for="f in detail.evidence" :key="f.materialId" :disabled="busy" @click="evidence(f)">
        {{ f.name }}
      </el-button>
      <a v-if="preview" :href="preview" target="_blank" rel="noopener">打开材料</a>
      <template v-if="!ext">
        <p>
          可退商品 ¥{{ money(detail.goodsAvailableFen) }}　可退运费 ¥{{ money(detail.freightAvailableFen) }}
        </p>
        <p>本次核准商品 ¥{{ money(detail.goodsRefundFen) }}　运费 ¥{{ money(detail.freightRefundFen) }}</p>
        <p v-if="detail.refundId">原退款单 {{ detail.refundId }}</p>
        <p v-if="detail.replacementDeliveryId">返工交付记录 {{ detail.replacementDeliveryId }}</p>
      </template>
      <section v-if="context">
        <section v-if="context.factoryStatements.length">
          <h3>工厂提交的事实与凭证</h3>
          <div v-for="s in context.factoryStatements" :key="s.id">
            {{ s.at }}　{{ s.summary }}
            <el-button v-for="f in s.evidence" :key="f.materialId" @click="evidence(f)">
              {{ f.name }}
            </el-button>
          </div>
        </section>
        <h3>事项沟通</h3>
        <p v-for="n in context.notes" :key="n.id">{{ n.at }}　{{ n.summary }}</p>
        <form
          v-if="
            me?.permissions.includes('admin:case:contact-record') &&
            !['closed', 'cancelled'].includes(context.state)
          "
          @submit.prevent="recordContact">
          <label>
            联系渠道
            <el-select
              v-model="channel"
              :empty-values="[null, undefined]"
              placeholder="请选择"
              popper-class="desk-select-menu">
              <el-option value="phone" label="电话" />
              <el-option value="wechat" label="微信" />
              <el-option value="offline" label="线下" />
              <el-option value="other" label="其他" />
            </el-select>
          </label>
          <label>
            沟通记录
            <el-input v-model.trim="contact" required maxlength="500" type="textarea" />
          </label>
          <el-button :disabled="busy || !contact" native-type="submit">保存沟通记录</el-button>
        </form>
      </section>
      <form v-if="writable" @submit.prevent="submit">
        <label v-if="ext">
          审核结论
          <el-select
            v-model="decision"
            :empty-values="[null, undefined]"
            placeholder="请选择"
            popper-class="desk-select-menu">
            <el-option value="approved" label="批准延期" />
            <el-option value="rejected" label="驳回" />
          </el-select>
        </label>
        <template v-else>
          <label>
            办理方式
            <el-select
              v-model="resolution"
              :empty-values="[null, undefined]"
              placeholder="请选择"
              popper-class="desk-select-menu">
              <el-option
                v-for="k in [
                  'record_only',
                  'rework',
                  'partial_refund',
                  'full_refund',
                  'platform_intervention',
                ]"
                :disabled="!funds && k.includes('refund')"
                :key="k"
                :value="k"
                :label="labels[k]" />
            </el-select>
          </label>
          <template v-if="funds">
            <label>
              商品退款（分）
              <el-input
                v-model.number="goods"
                required
                type="number"
                min="0"
                step="1"
                :max="detail.goodsAvailableFen" />
            </label>
            <label>
              运费退款（分）
              <el-input
                v-model.number="freight"
                required
                type="number"
                min="0"
                step="1"
                :max="detail.freightAvailableFen" />
            </label>
          </template>
        </template>
        <label>
          办理依据（买家和工厂可见）
          <el-input v-model.trim="remark" required maxlength="1000" type="textarea" />
        </label>
        <el-button :disabled="busy || !remark" native-type="submit">确认办理</el-button>
      </form>
    </section>
  </main>
</template>
