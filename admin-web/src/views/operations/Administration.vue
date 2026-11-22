<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskQueueMetrics from "../../components/DeskQueueMetrics.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import DeskRegister from "../../components/DeskRegister.vue";
import RolePermissions, { type GrantNode } from "../system/RolePermissions.vue";
import PlatformRules from "./PlatformRules.vue";
import OperationsOverview from "./OperationsOverview.vue";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api, ApiError, refreshCsrf, requestErrorText } from "../../api/http";
import { me } from "../../session/state";
import { useSessionView } from "../../session/view";
import {
  type Row,
  pages,
  labels,
  filterStates,
  listColumns,
  listNames,
  stateText,
  displayCell,
  names,
  ruleChoices,
  opts,
} from "./administration-display";
const route = useRoute(),
  section = computed(() => route.path.split("/").pop() || "dashboard"),
  config = computed(() => pages[section.value]),
  base = computed(() => "/api/admin/" + config.value.endpoint);
const allowed = (p: string) => me.value?.permissions.includes("admin:" + p) === true;
const rows = ref<Row[]>([]),
  detail = ref<Row | null>(null),
  filters = ref<Row>({}),
  page = ref(1),
  total = ref("0"),
  message = ref(""),
  busy = ref(false);
const form = ref<Row | null>(null),
  action = ref(""),
  target = ref(""),
  grantNodes = ref<GrantNode[]>([]),
  grantSelection = ref<string[]>([]),
  resultRefs = ref<Row[]>([]);
const extraGrant = ref("");
const returnDraftToList = ref(false);
function addGrantNode() {
  const id = extraGrant.value.trim();
  if (!/^[a-f0-9]{32}$/i.test(id)) {
    message.value = "请输入完整的菜单节点编号";
    return;
  }
  if (!grantNodes.value.some((node) => node.id === id)) grantNodes.value.push({ id, menuName: id });
  if (!grantSelection.value.includes(id)) grantSelection.value.push(id);
  extraGrant.value = "";
  message.value = "";
}
const pending = ref<{ url: string; body: Row; key: string } | null>(null);
const pendingKey = computed(() => "mj.adminCommand." + me.value?.userId + "." + section.value);
const recoverAccount = ref(false);
function persist() {
  if (!pending.value) return;
  const saved = { ...pending.value, body: { ...pending.value.body } };
  delete saved.body.password;
  sessionStorage.setItem(pendingKey.value, JSON.stringify({ operation: saved, label: action.value }));
}
function restore() {
  recoverAccount.value = false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(pendingKey.value) || "null");
    if (!saved) return;
    action.value = saved.label;
    pending.value = saved.operation;
    form.value = {};
    if (action.value === "登记管理员") {
      form.value = { password: "" };
      recoverAccount.value = true;
    }
  } catch {
    pending.value = null;
  }
}
const view = useSessionView(() => {
  rows.value = [];
  detail.value = null;
  form.value = null;
  pending.value = null;
  grantNodes.value = [];
  grantSelection.value = [];
  message.value = "";
});
const loading = ref(false);
let serial = 0;
function suffix() {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters.value)) if (v !== "" && v != null) q.set(k, String(v));
  return q;
}
async function load() {
  const token = ++serial,
    owner = view.capture();
  message.value = "";
  loading.value = true;
  try {
    let data: Row;
    const single = ["dashboard", "role-grants"].includes(section.value);
    if (single) {
      data = await api<Row>(base.value);
      if (token !== serial || !view.current(owner)) return;
      if (section.value === "role-grants") {
        const nodes = allowed("menu:manage")
          ? await api<GrantNode[]>("/api/admin/system/menus")
          : data.menuIds.map((id: string) => ({
              id,
              menuName: id,
              children: [],
            }));
        if (token === serial && view.current(owner)) {
          grantNodes.value = nodes;
          grantSelection.value = [...data.menuIds];
          detail.value = data;
        }
      } else detail.value = data;
    } else {
      const q = suffix();
      q.set("page", String(page.value));
      data = await api<Row>(base.value + "?" + q);
      if (token === serial && view.current(owner)) {
        rows.value = data.items;
        total.value = data.total;
      }
    }
  } catch (e) {
    if (token === serial && view.current(owner)) {
      message.value = requestErrorText(e, "查询失败");
      rows.value = [];
      detail.value = null;
    }
  } finally {
    if (token === serial && view.current(owner)) loading.value = false;
  }
}
watch(
  section,
  () => {
    detail.value = null;
    form.value = null;
    pending.value = null;
    page.value = 1;
    rows.value = [];
    filters.value = Object.fromEntries(config.value.filters.map((key) => [key, ""]));
    extraGrant.value = "";
    restore();
    void load();
  },
  { immediate: true }
);
async function inspect(row: Row, openDraft = false) {
  const token = ++serial,
    owner = view.capture();
  try {
    const value = await api<Row>(base.value + "/" + (row.id || row.userId));
    if (token === serial && view.current(owner)) {
      detail.value = value;
      form.value = null;
      if (openDraft && section.value === "rules" && value.status === "draft" && allowed("rule:manage")) {
        editRule();
        returnDraftToList.value = true;
      }
    }
  } catch (e) {
    if (token === serial && view.current(owner)) message.value = requestErrorText(e);
  }
}
const ruleDefaults = {
  ruleCode: "",
  ruleTitle: "",
  ruleVersion: "",
  ruleScope: "all_user",
  contentType: "markdown",
  contentText: "",
  contentUrl: "",
  isRequired: false,
  forceReaccept: false,
};
function cancelForm() {
  if (pending.value || busy.value) return;
  form.value = null;
  if (returnDraftToList.value) detail.value = null;
  returnDraftToList.value = false;
}
function begin(label: string, url: string, fields: Row) {
  if (pending.value) return;
  returnDraftToList.value = false;
  action.value = label;
  target.value = url;
  form.value = { ...fields };
  resultRefs.value = [];
}
function editRule(copy = false) {
  const model: Row = { ...ruleDefaults };
  for (const k of Object.keys(model)) model[k] = detail.value?.[k] ?? model[k];
  if (copy) {
    model.ruleVersion = "";
    begin("新建规则草稿", base.value, model);
  } else begin("保存草稿", base.value + "/" + detail.value?.id + "/save", model);
}
function build() {
  const b = { ...form.value };
  if (b.contentType) {
    if (b.contentType === "url") b.contentText = null;
    else b.contentUrl = null;
  }
  if ("demand" in b) {
    b.source = b.sourceId ? { sourceId: b.sourceId, sourceType: b.sourceType } : null;
    delete b.sourceId;
    delete b.sourceType;
    b.contextId = b.contextId || null;
  }
  if (action.value === "登记管理员") b.username = String(b.username).trim().toLowerCase();
  if (action.value === "保存授权") b.menuIds = [...grantSelection.value];
  if (action.value === "解决案件") {
    b.version = detail.value?.version;
    b.resultRefs = resultRefs.value.map((x) => ({ ...x }));
  }
  if (target.value.endsWith("/save") || target.value.endsWith("/publish") || target.value.endsWith("/status"))
    b.snapshotToken = detail.value?.snapshotToken;
  return b;
}
async function save() {
  if (busy.value || !form.value) return;
  const owner = view.capture(),
    which = section.value;
  if (!pending.value) {
    pending.value = {
      url: target.value,
      key: crypto.randomUUID(),
      body: build(),
    };
    persist();
  }
  if (recoverAccount.value) {
    pending.value.body.password = form.value.password;
  }
  const p = pending.value;
  busy.value = true;
  try {
    await refreshCsrf();
    const updated = await api<Row>(p.url, "POST", p.body, true, p.key);
    if (view.current(owner) && which === section.value) {
      sessionStorage.removeItem(pendingKey.value);
      pending.value = null;
      form.value = null;
      detail.value = action.value === "发补偿券" ? detail.value : updated;
      await load();
      message.value = "已保存";
    }
  } catch (e) {
    if (view.current(owner) && which === section.value) {
      message.value = requestErrorText(e, "结果待核对");
      if (e instanceof ApiError && e.outcome === "business-rejection") {
        pending.value = null;
        sessionStorage.removeItem(pendingKey.value);
        if (recoverAccount.value) {
          form.value = null;
          recoverAccount.value = false;
        }
      }
    }
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
async function download() {
  const owner = view.capture();
  try {
    const res = await fetch(base.value + "/export?" + suffix(), {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok || !res.headers.get("content-type")?.includes("text/csv"))
      throw new Error("导出失败，请核对权限");
    const blob = await res.blob();
    if (!view.current(owner)) return;
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = config.value.title + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    if (view.current(owner)) message.value = requestErrorText(e);
  }
}
useDetailScroll(() => section.value !== "dashboard" && (!!detail.value || !!form.value));
function resetFilters() {
  filters.value = Object.fromEntries(config.value.filters.map((key) => [key, ""]));
  page.value = 1;
  return load();
}
</script>
<template>
  <OperationsOverview
    v-if="section === 'dashboard'"
    :data="detail"
    :message="message"
    :cases="allowed('case:list')"
    @retry="load" />
  <section v-else :class="section === 'rules' ? 'rules-workspace' : 'business-view'">
    <PlatformRules
      v-if="section === 'rules' && !form"
      :rows="rows"
      :detail="detail"
      :filters="filters"
      :page="page"
      :total="total"
      :loading="loading"
      :message="message"
      :manage="allowed('rule:manage')"
      :locked="busy || !!pending"
      @reset="resetFilters"
      @search="
        page = 1;
        load();
      "
      @turn="
        (step) => {
          page += step;
          load();
        }
      "
      @inspect="inspect"
      @back="
        detail = null;
        message = '';
      "
      @create="begin('新建规则草稿', base, ruleDefaults)"
      @copy="editRule(true)"
      @edit="editRule()"
      @publish="begin('发布规则', base + '/' + detail?.id + '/publish', {})" />
    <template v-if="section !== 'rules'">
      <header class="desk-head">
        <h1>
          {{
            section === "role-grants"
              ? "角色与菜单权限"
              : form
              ? action
              : config.title + (detail ? "详情" : "")
          }}
        </h1>
        <el-button
          v-if="section === 'role-grants' && detail && !form && allowed('role:manage')"
          type="primary"
          :disabled="loading || busy || !!pending"
          @click="begin('保存授权', base + '/' + detail.roleId + '/save', { reason: '' })">
          保存菜单授权
        </el-button>
        <el-button
          v-if="detail && !form && section !== 'role-grants'"
          class="desk-btn"
          @click="detail = null">
          返回列表
        </el-button>
        <div class="actions" v-if="!detail && !form">
          <el-button
            v-if="section === 'cases' && allowed('customer-service:create')"
            @click="
              begin('登记客服案件', '/api/admin/customer-service-cases', {
                userId: '',
                demand: '',
                mainConflict: '',
                contextId: '',
                sourceType: 'rental_order',
                sourceId: '',
              })
            ">
            登记客服案件
          </el-button>
          <el-button
            v-if="section === 'accounts' && allowed('account:manage')"
            @click="
              begin('登记管理员', base, {
                userId: '',
                username: '',
                password: '',
                reason: '',
              })
            ">
            登记管理员
          </el-button>
          <el-button
            v-if="
              (section === 'audits' && allowed('audit:export')) ||
              (section === 'users' && allowed('user:export'))
            "
            @click="download">
            导出 CSV
          </el-button>
        </div>
      </header>
      <p v-if="message" role="status">{{ message }}</p>
      <el-button v-if="section === 'role-grants' && !detail && message" :disabled="loading" @click="load">
        重新读取授权
      </el-button>
      <DeskQueueMetrics v-if="!detail && !form" />
      <DeskRegister
        v-if="listColumns[section] && !detail && !form"
        :columns="listColumns[section]"
        :labels="labels"
        :rows="rows"
        :title="listNames[section]"
        :busy="busy"
        :loading="loading"
        :error="message"
        :total="total"
        :page="page"
        :row-key="(r) => r.id || r.userId"
        :cell="displayCell"
        @turn="
          (step) => {
            page += step;
            load();
          }
        ">
        <template #filters>
          <DeskFilters
            :busy="loading"
            @search="
              page = 1;
              load();
            "
            @reset="resetFilters">
            <el-form-item :label="labels[k]" v-for="k in config.filters" :key="k">
              <el-select
                v-if="k === 'enabled'"
                v-model="filters[k]"
                :empty-values="[null, undefined]"
                placeholder="全部"
                popper-class="desk-select-menu">
                <el-option value="" label="全部" />
                <el-option value="true" label="启用" />
                <el-option value="false" label="停用" />
              </el-select>
              <el-select
                v-else-if="filterStates[k]"
                v-model="filters[k]"
                :empty-values="[null, undefined]"
                placeholder="全部"
                popper-class="desk-select-menu">
                <el-option value="" label="全部" />
                <el-option v-for="(caption, code) in filterStates[k]" :value="code" :label="caption" />
              </el-select>
              <el-input v-else v-model.trim="filters[k]" clearable />
            </el-form-item>
          </DeskFilters>
        </template>
        <template #actions="{ row }">
          <el-button
            v-if="section !== 'cases' || allowed('case:view')"
            :disabled="!!pending"
            @click="inspect(row)"
            size="small"
            link
            class="desk-row-link">
            详情
          </el-button>
        </template>
      </DeskRegister>
      <RolePermissions
        v-if="section === 'role-grants' && detail"
        :role-name="stateText[detail.roleCode] || detail.roleCode"
        :nodes="grantNodes"
        v-model:selection="grantSelection"
        :has-directory="allowed('menu:manage')"
        :editable="allowed('role:manage') && !pending && !busy">
        <div v-if="!allowed('menu:manage') && allowed('role:manage')" class="desk-query">
          <el-input
            v-model.trim="extraGrant"
            placeholder="菜单节点编号"
            aria-label="菜单节点编号"
            :disabled="!!pending" />
          <el-button :disabled="!!pending" @click="addGrantNode">加入授权范围</el-button>
        </div>
      </RolePermissions>
      <section v-else-if="detail && !form" class="record-panel">
        <div>
          <h2>记录信息</h2>
          <dl class="fact-list">
            <template v-for="k in names(detail).filter((x) => x !== 'menuIds')" :key="k">
              <dt>{{ labels[k] }}</dt>
              <dd>{{ displayCell(detail, k) }}</dd>
            </template>
          </dl>
          <el-button
            v-if="section === 'accounts' && allowed('account:manage')"
            @click="
              begin('修改账号状态', base + '/' + detail.id + '/status', {
                enabled: !detail.enabled,
                reason: '',
              })
            ">
            {{ detail.enabled ? "停用" : "启用" }}
          </el-button>

          <template v-if="section === 'cases'">
            <el-button
              v-if="
                detail.caseType === 'customer_service' &&
                !['closed', 'cancelled'].includes(detail.caseStatus) &&
                allowed('customer-service:resolve')
              "
              @click="
                begin('解决案件', '/api/admin/customer-service-cases/' + detail.id + '/resolve', {
                  resolutionSummary: '',
                })
              ">
              解决案件
            </el-button>
            <el-button
              v-if="allowed('coupon:issue')"
              @click="
                begin('发补偿券', base + '/' + detail.id + '/compensation-coupons', {
                  templateId: '',
                  beneficiaryUserId: '',
                  reason: '',
                })
              ">
              独立发补偿券
            </el-button>
          </template>
        </div>
      </section>
    </template>
    <p v-if="section === 'rules' && form && message" role="alert">{{ message }}</p>
    <el-dialog
      v-if="section === 'role-grants' && form"
      :model-value="true"
      title="保存菜单授权"
      width="min(480px, 94vw)"
      align-center
      append-to-body
      class="desk-dialog"
      :close-on-click-modal="false"
      :close-on-press-escape="!pending && !busy"
      :show-close="!pending && !busy"
      @close="!pending && !busy && (form = null)">
      <el-form label-position="top" @submit.prevent>
        <p>
          {{ stateText[detail?.roleCode] || detail?.roleCode }} · 已选择
          {{ pending?.body.menuIds?.length ?? grantSelection.length }} 个节点
        </p>
        <el-form-item label="操作原因" required>
          <el-input
            :model-value="pending?.body.reason ?? form.reason"
            @update:model-value="form.reason = $event"
            type="textarea"
            :rows="3"
            :disabled="!!pending || busy"
            placeholder="请填写本次调整授权的原因" />
        </el-form-item>
        <el-alert v-if="message" :title="message" type="warning" :closable="false" />
      </el-form>
      <template #footer>
        <el-button v-if="!pending" :disabled="busy" @click="cancelForm">取消</el-button>
        <el-button type="primary" :loading="busy" :disabled="!pending && !form.reason?.trim()" @click="save">
          {{ pending ? "按原请求核对结果" : "确认保存" }}
        </el-button>
      </template>
    </el-dialog>
    <form v-else-if="form" @submit.prevent="save">
      <h2>{{ action }}</h2>
      <fieldset :disabled="busy || (!!pending && !recoverAccount)">
        <template v-for="(_, k) in form" :key="k">
          <label
            v-if="
              !(
                (k === 'contentUrl' && form.contentType !== 'url') ||
                (k === 'contentText' && form.contentType === 'url')
              )
            ">
            {{ labels[k] }}
            <el-switch
              v-if="typeof form[k] === 'boolean'"
              v-model="form[k]"
              :aria-label="labels[k]"
              :disabled="busy || (!!pending && !recoverAccount)" />
            <el-select
              :disabled="busy || (!!pending && !recoverAccount)"
              v-else-if="opts[k]"
              v-model="form[k]"
              :empty-values="[null, undefined]"
              placeholder="请选择"
              popper-class="desk-select-menu">
              <el-option
                v-for="s in opts[k]"
                :key="s"
                :value="s"
                :label="ruleChoices[s] || stateText[s] || s" />
            </el-select>
            <el-input
              v-else-if="['demand', 'mainConflict', 'contentText', 'resolutionSummary', 'reason'].includes(k)"
              v-model="form[k]"
              required
              type="textarea" />
            <el-input
              v-else
              :type="k === 'password' ? 'password' : 'text'"
              :autocomplete="k === 'password' ? 'new-password' : 'off'"
              v-model="form[k]"
              :required="!['contextId', 'sourceId'].includes(k)" />
          </label>
        </template>
        <div v-if="action === '解决案件'">
          <div v-for="(v, index) in resultRefs" :key="index">
            <el-select
              :disabled="busy || (!!pending && !recoverAccount)"
              v-model="v.sourceType"
              :empty-values="[null, undefined]"
              placeholder="请选择"
              popper-class="desk-select-menu">
              <el-option
                v-for="s in [
                  'refund_order',
                  'user_coupon',
                  'arbitration_decision',
                  'rental_order',
                  'custom_order',
                  'order_issue',
                  'claim',
                  'custom_after_sale',
                ]"
                :key="s"
                :value="s"
                :label="ruleChoices[s] || stateText[s] || s" />
            </el-select>
            <el-input v-model.trim="v.sourceId" placeholder="已发生的结果编号" required />
            <el-button @click="resultRefs.splice(index, 1)">移除</el-button>
          </div>
          <el-button @click="resultRefs.push({ sourceType: 'refund_order', sourceId: '' })">
            添加结果引用
          </el-button>
        </div>
      </fieldset>
      <div class="desk-form-actions">
        <el-button type="primary" :disabled="busy" native-type="submit">
          {{ pending ? "按原请求核对结果" : "确认" + action }}
        </el-button>
        <el-button v-if="!pending" :disabled="busy" @click="cancelForm">取消</el-button>
      </div>
    </form>
  </section>
</template>
<style scoped>
.rules-workspace > form {
  background: #fff;
  border: 1px solid #e0e4e8;
  border-radius: 7px;
  padding: 16px;
}
.rules-workspace fieldset {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.rules-workspace label {
  display: grid;
  gap: 5px;
  font-size: 12px;
}
.rules-workspace textarea {
  min-height: 95px;
}
</style>
