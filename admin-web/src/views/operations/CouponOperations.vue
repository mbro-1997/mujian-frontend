<script setup lang="ts">
import { ElMessageBox } from "element-plus";
import DeskFilters from "../../components/DeskFilters.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import { computed, ref, watch } from "vue";
import DeskRegister from "../../components/DeskRegister.vue";
import CouponReconciliation from "./CouponReconciliation.vue";
import { useRoute } from "vue-router";
import { api, ApiError, refreshCsrf, requestErrorText } from "../../api/http";
import { me, menus } from "../../session/state";
import { navigationGroups } from "../../layouts/navigation";
import { useSessionView } from "../../session/view";
import { type Row, pages, labels, enums, columns, cell, show } from "./coupon-display";
const route = useRoute(),
  section = computed(() => route.path.split("/").pop() as keyof typeof pages);
const config = computed(() => pages[section.value]),
  endpoint = computed(() => "/api/admin/" + config.value.endpoint);
const relatedPages = computed(() =>
  navigationGroups(menus.value, me.value?.permissions || [])
    .flatMap((g) => g.items)
    .filter(
      (item) => item.routePath === "/operations/coupon-issue" || item.routePath === "/operations/activities"
    )
);
const writable = computed(() => me.value?.permissions.includes(config.value.managePermission) || false);
const rows = ref<Row[]>([]),
  selected = ref<Row | null>(null),
  form = ref<Row | null>(null),
  copying = ref(false),
  scopeText = ref("");
const fetching = ref(false);
const message = ref(""),
  page = ref(1),
  total = ref("0"),
  busy = ref(false),
  query = ref("");
const unresolved = ref<{ key: string; url: string; body: Row } | null>(null);
const pendingKey = computed(() => "mj.couponConfig." + me.value?.userId + "." + section.value);
function restore() {
  try {
    unresolved.value = JSON.parse(sessionStorage.getItem(pendingKey.value) || "null");
  } catch {
    unresolved.value = null;
  }
}
const view = useSessionView(() => {
  rows.value = [];
  selected.value = null;
  form.value = null;
  unresolved.value = null;
  message.value = "";
});
const dates = new Set(["validStartAt", "validEndAt", "startsAt", "endsAt"]),
  numbers = new Set(["validDays", "faceAmountFen", "discountRateBps", "thresholdRentAmountFen"]);
const draft = (): Row =>
  section.value === "templates"
    ? {
        templateCode: "",
        templateName: "",
        couponType: "fixed_amount",
        faceAmountFen: null,
        discountRateBps: null,
        thresholdRentAmountFen: 0,
        applicableScopeType: "all",
        factoryIds: [],
        validityType: "relative_days",
        validDays: null,
        validStartAt: null,
        validEndAt: null,
      }
    : section.value === "activities"
    ? {
        templateId: "",
        condition: "all_active",
        startsAt: null,
        endsAt: null,
        reason: "",
      }
    : { eventType: "first_realname_verified", templateId: "" };
function edit(row?: Row, copy = false) {
  if (unresolved.value) return;
  copying.value = copy;
  selected.value = row || null;
  const model = draft();
  if (row) for (const k of Object.keys(model)) model[k] = row[k] ?? null;
  form.value = model;
  scopeText.value = ((model.factoryIds as string[]) || []).join("\n");
}
const filterKey = computed(
  () =>
    ({
      templates: "keyword",
      activities: "status",
      rewards: "eventType",
      facts: "userId",
      batches: "requestId",
      coupons: "userId",
    }[section.value])
);
const filterOptions = computed(() =>
  section.value === "activities"
    ? Object.fromEntries(["draft", "active", "completed", "cancelled"].map((key) => [key, enums.status[key]]))
    : enums[filterKey.value]
);
const transitions = computed(() => {
  const s = selected.value?.status;
  if (section.value === "templates")
    return s === "draft"
      ? ["publish"]
      : s === "active"
      ? ["pause", "end"]
      : s === "paused"
      ? ["resume", "end"]
      : [];
  if (section.value === "activities")
    return s === "draft" ? ["publish", "cancel"] : s === "active" ? ["cancel"] : [];
  return section.value === "rewards" ? (s === "draft" ? ["activate"] : s === "active" ? ["end"] : []) : [];
});
let round = 0;
async function inspect(row: Row) {
  if (unresolved.value || busy.value) return;
  const token = ++round,
    owner = view.capture();
  selected.value = null;
  form.value = null;
  message.value = "";
  try {
    const record =
      section.value === "facts"
        ? row
        : await api<Row>(endpoint.value + "/" + encodeURIComponent(String(row.id)));
    if (token === round && view.current(owner)) selected.value = record;
  } catch (error) {
    if (token === round && view.current(owner)) message.value = requestErrorText(error, "详情读取失败");
  }
}
async function load() {
  const token = ++round,
    owner = view.capture();
  message.value = "";
  fetching.value = true;
  try {
    const q = new URLSearchParams({ page: String(page.value) });
    if (query.value) q.set(filterKey.value, query.value);
    const r = await api<{ items: Row[]; total: string }>(endpoint.value + "?" + q);
    if (token === round && view.current(owner)) {
      rows.value = r.items;
      total.value = r.total;
    }
  } catch (e) {
    if (token === round && view.current(owner)) message.value = requestErrorText(e, "读取失败");
  } finally {
    if (token === round && view.current(owner)) fetching.value = false;
  }
}
watch(
  section,
  () => {
    selected.value = null;
    form.value = null;
    total.value = "0";
    restore();
    query.value = "";
    page.value = 1;
    rows.value = [];
    void load();
  },
  { immediate: true }
);
function buildBody(): Row {
  const v = { ...form.value };
  if (section.value === "templates") {
    v.factoryIds =
      v.applicableScopeType === "factory"
        ? scopeText.value
            .trim()
            .split(/[\s,，]+/)
            .filter(Boolean)
        : [];
    if (v.couponType === "fixed_amount") v.discountRateBps = null;
    else v.faceAmountFen = null;
    if (v.validityType === "fixed_range") v.validDays = null;
    else {
      v.validStartAt = null;
      v.validEndAt = null;
    }
  }
  for (const k of dates) {
    if (v[k]) {
      const d = String(v[k]);
      v[k] = d.includes("+") ? d : (d.length === 16 ? d + ":00" : d).slice(0, 19) + ".000+08:00";
    }
  }
  if (selected.value && !copying.value) {
    if (section.value === "activities") v.version = selected.value.version!;
    else v.snapshotToken = selected.value.snapshotToken!;
  }
  return v;
}
async function send(action?: string) {
  if (busy.value || !writable.value) return;
  if (!unresolved.value) {
    const row = form.value && copying.value ? null : selected.value;
    const suffix = row ? "/" + row.id + "/" + (action || "save") : "";
    const body = action
      ? section.value === "activities"
        ? { version: row!.version! }
        : { snapshotToken: row!.snapshotToken! }
      : buildBody();
    unresolved.value = {
      key: crypto.randomUUID(),
      url: endpoint.value + suffix,
      body: body as Row,
    };
    sessionStorage.setItem(pendingKey.value, JSON.stringify(unresolved.value));
  }
  const op = unresolved.value,
    owner = view.capture(),
    which = section.value;
  busy.value = true;
  try {
    await refreshCsrf();
    const r = await api<Row>(op.url, "POST", op.body, true, op.key);
    if (!view.current(owner) || section.value !== which) return;
    selected.value = r;
    form.value = null;
    unresolved.value = null;
    sessionStorage.removeItem(pendingKey.value);
    await load();
  } catch (e) {
    if (view.current(owner) && section.value === which) {
      message.value = requestErrorText(e, "结果待核对");
      if (e instanceof ApiError && e.outcome === "business-rejection") {
        unresolved.value = null;
        sessionStorage.removeItem(pendingKey.value);
      }
    }
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
const actionName: Record<string, string> = {
  publish: "发布",
  pause: "暂停",
  resume: "恢复",
  end: "结束",
  activate: "启用",
  cancel: "取消活动",
};
async function confirmTransition(action: string) {
  const row = selected.value;
  if (!row || !writable.value || busy.value || unresolved.value) return;
  const owner = view.capture();
  const label = actionName[action];
  try {
    await ElMessageBox.confirm(`确认${label}当前${config.value.title}？`, `${label}${config.value.title}`, {
      confirmButtonText: `确认${label}`, cancelButtonText: "取消", type: "warning",
    });
  } catch { return; }
  if (view.current(owner) && selected.value === row && transitions.value.includes(action)) await send(action);
}
useDetailScroll(() => form.value && selected.value ? 2 : selected.value || form.value ? 1 : 0);
function resetFilters() {
  query.value = "";
  page.value = 1;
  return load();
}
</script>
<template>
  <section class="business-view">
    <header class="desk-head">
      <h1>{{ config.title }}{{ selected && !form ? "详情" : "" }}</h1>
      <el-button
        v-if="selected || form"
        class="desk-btn"
        :disabled="busy || !!unresolved"
        @click="
          selected = null;
          form = null;
        ">
        返回列表
      </el-button>
      <div v-else>
        <template v-if="section === 'templates'">
          <router-link
            v-for="item in relatedPages"
            class="desk-btn route-button"
            :to="item.routePath!"
            :key="item.id">
            {{ item.menuName }}
          </router-link>
        </template>
        <el-button v-if="writable" class="desk-btn primary" @click="edit()" type="primary">
          新建草稿
        </el-button>
      </div>
    </header>
    <p v-if="message" role="status">{{ message }}</p>
    <DeskRegister
      v-if="!selected && !form"
      :title="config.title + '列表'"
      :columns="columns[section]"
      :labels="labels"
      :rows="rows"
      :row-key="(r) => String(r.id)"
      :cell="cell"
      :total="total"
      :page="page"
      :busy="busy || !!unresolved"
      :loading="fetching"
      :error="message"
      @turn="
        (step) => {
          page += step;
          load();
        }
      ">
      <template #filters>
        <DeskFilters
          :busy="fetching"
          @search="
            page = 1;
            load();
          "
          @reset="resetFilters">
          <el-form-item :label="labels[filterKey] || '模板名称'">
            <el-select
              v-if="filterOptions"
              v-model="query"
              :empty-values="[null, undefined]"
              placeholder="全部"
              popper-class="desk-select-menu">
              <el-option value="" label="全部" />
              <el-option v-for="(s, k) in filterOptions" :value="k" :label="s" />
            </el-select>
            <el-input v-else v-model.trim="query" clearable />
          </el-form-item>
        </DeskFilters>
      </template>
      <template #actions="{ row }">
        <el-button
          :disabled="busy || !!unresolved || fetching"
          @click="inspect(row)"
          size="small"
          link
          class="desk-row-link">
          详情
        </el-button>
      </template>
    </DeskRegister>
    <CouponReconciliation
      v-if="section === 'coupons'"
      :coupon-id="selected ? String(selected.id) : undefined"
      :status="selected ? String(selected.couponStatus) : undefined"
      :usage-ids="Array.isArray(selected?.usageIds) ? selected.usageIds : []"
      @invalidated="
        selected = null;
        load();
      " />
    <section v-if="selected && !form" class="record-panel">
      <h2>{{ config.title }}信息</h2>
      <dl class="fact-list">
        <template v-for="(v, k) in selected" :key="k">
          <template v-if="labels[k]">
            <dt>{{ labels[k] }}</dt>
            <dd>{{ show(k, v) }}</dd>
          </template>
        </template>
      </dl>
      <template v-if="writable">
        <el-button v-if="selected.status === 'draft'" @click="edit(selected)">修改草稿</el-button>
        <el-button
          v-if="section === 'templates' && selected.status !== 'draft'"
          :disabled="busy || !!unresolved"
          @click="edit(selected, true)">
          复制为新版本
        </el-button>
        <el-button
          v-for="action in transitions"
          :key="action"
          :disabled="busy || !!unresolved"
          @click="confirmTransition(action)">
          {{ actionName[action] }}
        </el-button>
      </template>
    </section>
    <form v-if="form" @submit.prevent="send()">
      <h2>{{ copying ? "复制为新版本" : selected ? "修改草稿" : "新建草稿" }}</h2>
      <fieldset :disabled="busy || !!unresolved">
        <template v-for="(_, k) in form" :key="k">
          <label
            v-if="
              !(
                (k === 'discountRateBps' && form.couponType === 'fixed_amount') ||
                (k === 'faceAmountFen' && form.couponType === 'percentage') ||
                (k === 'factoryIds' && form.applicableScopeType === 'all') ||
                (k === 'validDays' && form.validityType === 'fixed_range') ||
                ((k === 'validStartAt' || k === 'validEndAt') && form.validityType === 'relative_days')
              )
            ">
            {{ labels[k] }}
            <el-select
              :disabled="busy || !!unresolved"
              v-if="enums[k]"
              v-model="form[k]"
              :empty-values="[null, undefined]"
              placeholder="请选择"
              popper-class="desk-select-menu">
              <el-option v-for="(name, value) in enums[k]" :key="value" :value="value" :label="name" />
            </el-select>
            <el-input v-else-if="k === 'factoryIds'" v-model="scopeText" type="textarea" />
            <el-input v-else-if="numbers.has(k)" v-model.number="form[k]" type="number" required />
            <el-date-picker
              v-else-if="dates.has(k)"
              type="datetime"
              :model-value="String(form[k] || '')"
              @update:model-value="form[k] = $event"
              value-format="YYYY-MM-DDTHH:mm:ss.SSS[+08:00]"
              format="YYYY-MM-DD HH:mm:ss"
              :disabled="busy || !!unresolved"
              :clearable="false"
              required
              placeholder="选择日期和时间" />
            <el-input
              v-else
              :model-value="String(form[k] ?? '')"
              @update:model-value="form[k] = $event"
              required />
            <small v-if="k === 'discountRateBps'">
              100 BP = 租金减免 1%
              <span v-if="typeof form[k] === 'number'">，当前{{ show(k, form[k]) }}</span>
            </small>
          </label>
        </template>
      </fieldset>
      <div class="desk-form-actions">
        <el-button :disabled="busy || !!unresolved" @click="form = null">取消</el-button>
        <el-button type="primary" native-type="submit" :disabled="busy || !!unresolved">保存草稿</el-button>
      </div>
    </form>
    <el-button v-if="unresolved" :disabled="busy" @click="send()">按原请求核对结果</el-button>
  </section>
</template>
