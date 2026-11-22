<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";
import DeskQueueMetrics from "../../components/DeskQueueMetrics.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import DeskPanel from "../../components/DeskPanel.vue";
import OpenArbitration from "./OpenArbitration.vue";
import "../trading/trading.css";
import { onMounted, ref } from "vue";
import { useSessionView } from "../../session/view";
import { me } from "../../session/state";
import { api, ApiError, refreshCsrf } from "../../api/http";
import { money, query, time, tradeError } from "../../api/trading";
import type { PageResult } from "../../api/trading-types";

interface Risk {
  id: string;
  sourceOrderId: string;
  affectedOrderId: string;
  skuId: string;
  snId: string | null;
  status: string;
  createdAt: string;
  caseId: string | null;
  caseVersion: number | null;
}
interface Reference {
  relationType: string;
  relationId: string;
}
const bands = {
  not_due: "尚未逾期",
  within_24h: "逾期 24 小时内",
  within_48h: "逾期超过 24 小时至 48 小时",
  within_72h: "逾期超过 48 小时至 72 小时",
  beyond_72h: "逾期超过 72 小时",
};
interface RiskDetail {
  overdueReview: {
    currentDueDate: string;
    assessedAt: string;
    atResolution: boolean;
    band: keyof typeof bands;
    depositPaidFen: number;
    ceilingPercent: number;
    ceilingFen: number;
  };
  risk: Risk;
  references: Reference[];
  contacts: { id: string; channel: string; summary: string; createdAt: string; references: Reference[] }[];
}
const channels: Record<string, string> = { phone: "电话", wechat: "微信", offline: "当面", other: "其他" };
const detail = ref<RiskDetail | null>(null);
const summary = ref(""),
  channel = ref("phone"),
  selected = ref<Reference[]>([]);
const pending = ref<{
  key: string;
  caseId: string;
  body: { caseVersion: number; contactChannel: string; summary: string; references: Reference[] };
} | null>(null);
function clearDetail() {
  detail.value = null;
  summary.value = "";
  channel.value = "phone";
  selected.value = [];
  pending.value = null;
}
const statuses: Record<string, string> = {
  pending: "待处理",
  processing: "处理中",
  resolved: "已解决",
  closed: "已关闭",
};
const source = ref(""),
  affected = ref(""),
  status = ref(""),
  page = ref(1),
  total = ref("0");
const rows = ref<Risk[]>([]),
  busy = ref(false),
  message = ref("");
const session = useSessionView(() => {
  clearDetail();
  rows.value = [];
  total.value = "0";
  message.value = "";
  busy.value = false;
});
async function load(next = 1) {
  if (busy.value || pending.value) return;
  const owner = session.capture();
  busy.value = true;
  message.value = "";
  try {
    const data = await api<PageResult<Risk>>(
      "/api/admin/fulfillment-risks?" +
        query({
          sourceOrderId: source.value.trim(),
          affectedOrderId: affected.value.trim(),
          status: status.value,
          page: next,
          pageSize: 20,
        })
    );
    if (session.current(owner)) {
      clearDetail();
      rows.value = data.items;
      total.value = data.total;
      page.value = data.page;
    }
  } catch (e) {
    if (session.current(owner)) {
      rows.value = [];
      message.value = tradeError(e);
    }
  } finally {
    if (session.current(owner)) busy.value = false;
  }
}
async function openDetail(id: string) {
  if (busy.value || pending.value) return;
  const owner = session.capture();
  clearDetail();
  busy.value = true;
  message.value = "";
  try {
    const data = await api<RiskDetail>("/api/admin/fulfillment-risks/" + id);
    if (session.current(owner)) detail.value = data;
  } catch (e) {
    if (session.current(owner)) message.value = tradeError(e);
  } finally {
    if (session.current(owner)) busy.value = false;
  }
}
async function appendContact() {
  const risk = detail.value?.risk;
  if (busy.value || !risk?.caseId || risk.caseVersion === null || !summary.value.trim()) return;
  const owner = session.capture();
  const intent = pending.value ?? {
    key: crypto.randomUUID(),
    caseId: risk.caseId,
    body: {
      caseVersion: risk.caseVersion,
      contactChannel: channel.value,
      summary: summary.value.trim(),
      references: [...selected.value],
    },
  };
  pending.value = intent;
  busy.value = true;
  message.value = "";
  try {
    await refreshCsrf();
    if (!session.current(owner)) return;
    await api(
      "/api/admin/cases/" + intent.caseId + "/contact-records",
      "POST",
      intent.body,
      false,
      intent.key
    );
    if (!session.current(owner)) return;
    pending.value = null;
    summary.value = "";
    selected.value = [];
    const data = await api<RiskDetail>("/api/admin/fulfillment-risks/" + risk.id);
    if (session.current(owner)) {
      detail.value = data;
      rows.value = rows.value.map((row) => (row.id === risk.id ? data.risk : row));
    }
  } catch (e) {
    if (!session.current(owner)) return;
    if (e instanceof ApiError && e.outcome === "business-rejection") {
      pending.value = null;
      if (e.reason === "VERSION_CONFLICT" || e.reason === "CASE_CLOSED") {
        try {
          const data = await api<RiskDetail>("/api/admin/fulfillment-risks/" + risk.id);
          if (session.current(owner)) detail.value = data;
        } catch (refreshError) {
          if (session.current(owner)) {
            clearDetail();
            message.value = tradeError(refreshError);
          }
          return;
        }
      } else if (["PERMISSION_DENIED", "LOGIN_REQUIRED", "RESOURCE_NOT_FOUND"].includes(e.reason))
        clearDetail();
    }
    if (session.current(owner)) message.value = tradeError(e);
  } finally {
    if (session.current(owner)) busy.value = false;
  }
}
onMounted(() => load());
useDetailScroll(() => !!detail.value);
function resetFilters() {
  source.value = "";
  affected.value = "";
  status.value = "";
  return load(1);
}
</script>
<template>
  <main class="trade-admin">
    <header class="desk-head">
      <h1>{{ detail ? "履约风险详情" : "履约风险列表" }}</h1>
      <el-button v-if="detail" :disabled="busy || !!pending" @click="clearDetail">返回列表</el-button>
    </header>
    <div class="sub">逾期未归还影响后续已付订单时，系统登记对应的道具和实物。</div>
    <p v-if="message" role="alert">{{ message }}</p>
    <DeskQueueMetrics v-if="!detail" />
    <DeskPanel
      v-if="!detail"
      title="逾期未归还风险"
      :meta="busy || message ? undefined : '共 ' + total + ' 条'">
      <DeskFilters :busy="busy" @search="load(1)" @reset="resetFilters">
        <el-form-item label="逾期来源订单">
          <el-input v-model="source" placeholder="逾期来源订单 ID" aria-label="逾期来源订单" clearable />
        </el-form-item>
        <el-form-item label="受影响订单">
          <el-input v-model="affected" placeholder="受影响订单 ID" aria-label="受影响订单" clearable />
        </el-form-item>
        <el-form-item label="风险状态">
          <el-select
            v-model="status"
            aria-label="风险状态"
            :empty-values="[null, undefined]"
            placeholder="全部状态"
            popper-class="desk-select-menu">
            <el-option value="" label="全部状态" />
            <el-option v-for="(label, key) in statuses" :value="key" :key="key" :label="label" />
          </el-select>
        </el-form-item>
      </DeskFilters>

      <DeskTable :data="rows" :empty-text="busy ? '正在读取…' : message ? '读取失败' : '暂无匹配的履约风险'">
        <el-table-column label="风险编号" min-width="138" prop="id" />
        <el-table-column label="逾期来源订单" min-width="138" prop="sourceOrderId" />
        <el-table-column label="受影响订单" min-width="94" prop="affectedOrderId" />
        <el-table-column label="SKU / SN" min-width="138">
          <template #default="{ row: r }">{{ r.skuId }} · {{ r.snId || "按数量核对" }}</template>
        </el-table-column>
        <el-table-column label="影响时间" min-width="108">
          <template #default>未提供</template>
        </el-table-column>
        <el-table-column label="风险登记时间" min-width="138">
          <template #default="{ row: r }">{{ time(r.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="当前状态" min-width="94">
          <template #default="{ row: r }">{{ statuses[r.status] }}</template>
        </el-table-column>
        <el-table-column label="建议动作" min-width="94">
          <template #default>未提供</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
          <template #default="{ row: r }">
            <el-button
              :disabled="busy || !!pending"
              @click="openDetail(r.id)"
              size="small"
              link
              class="desk-row-link">
              详情
            </el-button>
          </template>
        </el-table-column>
      </DeskTable>

      <DeskPager :page="page" :total="total" :busy="busy" @turn="load(page + $event)" />
    </DeskPanel>
    <section v-if="detail" class="panel">
      <OpenArbitration
        v-if="detail.risk.status !== 'resolved' && me?.permissions.includes('admin:arbitration:decide')"
        :order-id="detail.risk.sourceOrderId"
        :source-id="detail.risk.id"
        source-type="overdue_impact" />
      <h2>风险联系记录</h2>
      <p>来源订单 {{ detail.risk.sourceOrderId }} · 受影响订单 {{ detail.risk.affectedOrderId }}</p>
      <section aria-label="逾期审核依据">
        <h3>{{ bands[detail.overdueReview.band] }}</h3>
        <p>
          当前有效归还日 {{ detail.overdueReview.currentDueDate }} ·
          {{ detail.overdueReview.atResolution ? "风险解除时点" : "查询时点" }}
          {{ time(detail.overdueReview.assessedAt) }}
        </p>
        <p>
          押金扣款上限 {{ detail.overdueReview.ceilingPercent }}%（¥{{
            money(detail.overdueReview.ceilingFen)
          }}），按来源订单实收押金 ¥{{ money(detail.overdueReview.depositPaidFen) }} 计算。
        </p>
        <p>
          请核对实际交回记录、未告知归还的原因和责任证据；实际可扣金额还受剩余押金约束。记录预警或联系结果均不产生扣款、应收或逾期租金。
        </p>
        <p v-if="detail.overdueReview.band === 'beyond_72h'">可按证据提请平台介入或仲裁。</p>
      </section>
      <p v-if="!detail.contacts.length">暂无联系记录</p>
      <article v-for="note in detail.contacts" :key="note.id">
        <strong>{{ channels[note.channel] }}</strong>
        · {{ time(note.createdAt) }}
        <p>{{ note.summary }}</p>
        <p v-for="reference in note.references" :key="reference.relationType + reference.relationId">
          {{ reference.relationId }}
        </p>
      </article>
      <form
        v-if="
          detail.risk.caseId &&
          ['pending', 'processing'].includes(detail.risk.status) &&
          me?.permissions.includes('admin:case:contact-record')
        "
        @submit.prevent="appendContact">
        <fieldset :disabled="busy || !!pending">
          <legend>追加联系记录</legend>
          <label>
            联系方式
            <el-select
              :disabled="busy || !!pending"
              v-model="channel"
              :empty-values="[null, undefined]"
              placeholder="请选择"
              popper-class="desk-select-menu">
              <el-option v-for="(name, key) in channels" :key="key" :value="key" :label="name" />
            </el-select>
          </label>
          <label>
            沟通结果
            <el-input v-model="summary" required maxlength="1000" type="textarea" />
          </label>
          <el-checkbox-group v-model="selected">
            <el-checkbox
              v-for="reference in detail.references"
              :key="reference.relationType + reference.relationId"
              :value="reference">
              {{
                reference.relationType === "fulfillment_risk"
                  ? "履约风险"
                  : reference.relationId === detail.risk.sourceOrderId
                  ? "来源订单"
                  : "受影响订单"
              }}
              {{ reference.relationId }}
            </el-checkbox>
          </el-checkbox-group>
        </fieldset>
        <el-button class="primary" :disabled="busy || !summary.trim()" native-type="submit" type="primary">
          {{ pending ? "按原请求核实记录" : "保存联系记录" }}
        </el-button>
      </form>
    </section>
  </main>
</template>
