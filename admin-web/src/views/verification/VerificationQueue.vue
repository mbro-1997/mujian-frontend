<script setup lang="ts">
import DeskPager from "../../components/DeskPager.vue";
import DeskFilters from "../../components/DeskFilters.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import { api, refreshCsrf, isStale, ApiError } from "../../api/http";
import { me, explain, notice } from "../../session/state";
import { useSessionView } from "../../session/view";
import { displayTime } from "./display-time";
import { filterPolicy, listQuery } from "./policy";
const props = defineProps<{ domain: "realname" | "student" }>();
type Application = {
  id: string;
  applicationNo: string;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  expireAt?: string | null;
  schoolName?: string;
  realNameMasked?: string;
  idCardMasked?: string;
  rejectReason: string | null;
};
type Row = Application & { nickname: string; userId: string };
type Detail = {
  application: Application;
  userId: string;
  nickname: string;
  phoneMasked: string;
  caseId: string;
  caseVersion: number;
  version: number;
  canReview: boolean;
  canViewSensitive: boolean;
  identityDocuments?: { fullName: string; fullIdCard: string; frontUrl: string; backUrl: string } | null;
  realnameStatus?: string;
  realNameMasked?: string | null;
  idCardMasked?: string | null;
  reviewedByAdminUserId: string | null;
  auditRemark: string | null;
};
type Sensitive = {
  phone?: string;
  expiresAt: string;
  auditId: string;
  images?: { position: number; url: string }[];
  realnameView?: { access: string; fullName?: string; fullIdCard?: string };
};
const route = useRoute(),
  router = useRouter(),
  title = computed(() => (props.domain === "realname" ? "实名认证审核" : "学生认证审核"));
const root = computed(() => "/api/admin/" + props.domain + "-verifications");
const id = computed(() => (typeof route.query.id === "string" ? route.query.id : ""));
const items = ref<Row[]>([]),
  total = ref("0"),
  page = ref(1),
  status = ref<string>(filterPolicy[props.domain].defaultStatus),
  keyword = ref(""),
  from = ref(""),
  to = ref(""),
  busy = ref(false),
  detail = ref<Detail | null>(null),
  sensitive = ref<Sensitive | null>(null),
  remark = ref(""),
  years = ref<number>(),
  unknown = ref(false),
  refilling = ref(false),
  message = ref("");
const labels: Record<string, string> = {
  "": "全部",
  pending: "待审核",
  verified: "已通过",
  approved: "已通过",
  rejected: "已驳回",
  expired: "已过期",
  unverified: "未实名",
};
let timer: ReturnType<typeof setTimeout> | undefined;
const command = ref<{
  key: string;
  decision: string;
  body: Record<string, unknown>;
} | null>(null);
const pendingKey = () => `mj.review.${me.value?.userId}.${props.domain}.${id.value}`;
const recoveryId = computed(() => (unknown.value ? sessionStorage.getItem(pendingKey()) : ""));
function clearSensitive() {
  sensitive.value = null;
  if (timer) clearTimeout(timer);
  timer = undefined;
}
function reset() {
  clearSensitive();
  items.value = [];
  detail.value = null;
  remark.value = "";
  years.value = undefined;
  unknown.value = false;
  refilling.value = false;
  busy.value = false;
  command.value = null;
  message.value = "";
}
const view = useSessionView(reset);
let version = 0;
function current(owner: number, request: number) {
  return view.current(owner) && request === version;
}
async function load() {
  const owner = view.capture(),
    request = ++version;
  clearSensitive();
  busy.value = true;
  message.value = "";
  try {
    if (id.value) {
      const result = await api<Detail>(root.value + "/" + id.value);
      if (!current(owner, request)) return;
      detail.value = result;
      const wasUnknown = !!sessionStorage.getItem(pendingKey());
      unknown.value = wasUnknown;
      refilling.value = false;
      if (result.application.status !== "pending") {
        sessionStorage.removeItem(pendingKey());
        unknown.value = false;
        command.value = null;
        if (wasUnknown)
          message.value = "原申请已有审核结果，请核对当前状态与审核管理员；本次没有再次执行审核。";
      }
    } else {
      const q = listQuery(props.domain, status.value, page.value);
      if (keyword.value.trim()) q.set("keyword", keyword.value.trim());
      if (from.value)
        q.set(
          "submittedFrom",
          new Date(new Date(from.value).getTime() + 8 * 3600000).toISOString().replace("Z", "+08:00")
        );
      if (to.value)
        q.set(
          "submittedTo",
          new Date(new Date(to.value).getTime() + 8 * 3600000).toISOString().replace("Z", "+08:00")
        );
      const result = await api<{ items: Row[]; total: string }>(root.value + "?" + q);
      if (!current(owner, request)) return;
      items.value = result.items;
      total.value = result.total;
    }
    notice.value = "";
  } catch (e) {
    if (!current(owner, request) || isStale(e)) return;
    detail.value = null;
    items.value = [];
    explain(e);
  } finally {
    if (current(owner, request)) busy.value = false;
  }
}
async function authorizeStudent() {
  if (props.domain !== "student" || busy.value || !detail.value?.canViewSensitive) return;
  const owner = view.capture(),
    request = version;
  busy.value = true;
  clearSensitive();
  try {
    await refreshCsrf();
    const result = await api<Sensitive>("/api/admin/student-verifications/" + id.value + "/sensitive-view", "POST", {});
    if (!current(owner, request)) return;
    sensitive.value = result;
    timer = setTimeout(clearSensitive, Math.max(0, Date.parse(result.expiresAt) - Date.now()));
  } catch (e) {
    if (current(owner, request) && !isStale(e)) explain(e);
  } finally {
    if (current(owner, request)) busy.value = false;
  }
}
async function decide(decision: "approve" | "reject") {
  if (busy.value || (unknown.value && !refilling.value) || !detail.value?.canReview) return;
  if (decision === "approve" && props.domain === "student" && !years.value) {
    message.value = "请选择一年至五年的认证有效期";
    return;
  }
  if (decision === "reject" && !remark.value.trim()) {
    message.value = "驳回时必须填写原因";
    return;
  }
  const owner = view.capture(),
    request = version;
  message.value = "";
  busy.value = true;
  try {
    await ElMessageBox.confirm(
      decision === "approve"
        ? props.domain === "student"
          ? `确认通过本条学生申请，并从审核通过时刻起生效 ${years.value} 个日历年？`
          : "确认审核通过本条原申请？"
        : "确认驳回本条原申请？审核原因将展示给用户。",
      "确认审核",
      { confirmButtonText: "确认", cancelButtonText: "取消" }
    );
  } catch {
    return;
  } finally {
    if (current(owner, request)) busy.value = false;
  }
  if (!current(owner, request)) return;
  const d = detail.value!;
  command.value = {
    key: sessionStorage.getItem(pendingKey()) || crypto.randomUUID().replaceAll("-", ""),
    decision,
    body: {
      caseId: d.caseId,
      expectedVersion: d.version,
      expectedCaseVersion: d.caseVersion,
      remark: remark.value.trim() || null,
      ...(props.domain === "student" && decision === "approve" ? { validYears: years.value } : {}),
    },
  };
  await send();
}
async function send() {
  if (!command.value || busy.value) return;
  const owner = view.capture(),
    request = version;
  busy.value = true;
  message.value = "";
  const saved = command.value;
  const recoveringKey = sessionStorage.getItem(pendingKey());
  refilling.value = false;
  sessionStorage.setItem(pendingKey(), saved.key);
  unknown.value = true;
  try {
    await refreshCsrf();
    await api(root.value + "/" + id.value + "/" + saved.decision, "POST", saved.body, false, saved.key);
    if (!current(owner, request)) return;
    sessionStorage.removeItem(pendingKey());
    unknown.value = false;
    command.value = null;
    message.value = "审核结果已保存";
    await load();
  } catch (e) {
    if (!current(owner, request) || isStale(e)) return;
    explain(e);
    message.value = "操作结果尚未确认。请刷新原申请，或以原编号、原内容重试。"; // Do not fabricate rollback from a network/500/503 response.
    if (
      e instanceof ApiError &&
      [
        "IDEMPOTENCY_KEY_REUSED",
        "REALNAME_ALREADY_REVIEWED",
        "STUDENT_ALREADY_REVIEWED",
        "VERSION_CONFLICT",
      ].includes(e.reason)
    ) {
      busy.value = false;
      await load();
      return;
    }
    if (
      !recoveringKey &&
      e instanceof ApiError &&
      ["REQUEST_INVALID", "PERMISSION_DENIED", "CSRF_INVALID", "ACCOUNT_ACTION_RESTRICTED"].includes(e.reason)
    ) {
      sessionStorage.removeItem(pendingKey());
      unknown.value = false;
      command.value = null;
    }
  } finally {
    if (current(owner, request)) busy.value = false;
  }
}
function resumeDecision() {
  if (busy.value || !unknown.value || command.value || !detail.value?.canReview) return;
  refilling.value = true;
  remark.value = "";
  years.value = undefined;
  message.value = "请重新核对材料并填写审核内容，将沿用原请求编号；若原操作已经落库，则查询原申请结果。";
}
function filter() {
  page.value = 1;
  load();
}
function identityPhotoSource(signedUrl: string) {
  if (!import.meta.env.DEV) return signedUrl;
  const url = new URL(signedUrl);
  return "/__realname-photo/" + url.host + url.pathname + url.search;
}
function open(row: Row) {
  router.push({ path: route.path, query: { id: row.id } });
}
function hidden() {
  if (document.hidden) clearSensitive();
}
watch([() => props.domain, id], ([domain], [previousDomain]) => {
  version++;
  reset();
  if (domain !== previousDomain) {
    status.value = filterPolicy[domain].defaultStatus;
    keyword.value = "";
    from.value = "";
    to.value = "";
    page.value = 1;
  }
  load();
});
watch(() => me.value?.permissions.join(","), () => {
  clearSensitive();
  if (props.domain !== "realname" || !id.value) return;
  if (!me.value?.permissions.includes("admin:realname:read")) {
    version++;
    reset();
  } else if (!me.value.permissions.includes("admin:realname:sensitive")) {
    // 丢弃权限变更前仍在返回途中的明文详情。
    if (busy.value) void load();
    else if (detail.value) detail.value = { ...detail.value, identityDocuments: null, canViewSensitive: false };
  }
});
onMounted(() => {
  load();
  document.addEventListener("visibilitychange", hidden);
});
onUnmounted(() => {
  version++;
  clearSensitive();
  document.removeEventListener("visibilitychange", hidden);
});
useDetailScroll(() => !!id.value);
function resetFilters() {
  keyword.value = "";
  from.value = "";
  to.value = "";
  status.value = filterPolicy[props.domain].defaultStatus;
  return filter();
}
</script>
<template>
  <div class="heading">
    <div>
      <h1>{{ title }}{{ id ? "详情" : "" }}</h1>
      <p v-if="props.domain === 'student'">人工核验原提交资料；敏感材料查看留审计，认证结果以原申请为准。</p>
    </div>
    <el-button v-if="id" @click="router.push(route.path)">返回列表</el-button>
  </div>
  <div v-if="message" role="status" class="notice">{{ message }}</div>
  <section v-if="!id" class="panel">
    <header>
      <strong>{{ props.domain === "realname" ? "实名申请" : "学生认证申请" }}</strong>
      <span>共 {{ total }} 条</span>
    </header>
    <DeskFilters :busy="busy" @search="filter" @reset="resetFilters">
      <el-form-item label="审核状态">
        <el-select
          v-model="status"
          :empty-values="[null, undefined]"
          aria-label="审核状态"
          popper-class="desk-select-menu">
          <el-option
            v-for="s in filterPolicy[props.domain].statuses"
            :key="s"
            :label="labels[s]"
            :value="s" />
        </el-select>
      </el-form-item>
      <el-form-item label="搜索申请">
        <el-input
          v-model="keyword"
          :placeholder="props.domain === 'student' ? '用户 / 申请编号 / 学校' : '用户 / 申请编号'"
          aria-label="搜索申请" />
      </el-form-item>
      <el-form-item label="提交自">
        <el-date-picker
          v-model="from"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm"
          format="YYYY-MM-DD HH:mm"
          placeholder="选择日期和时间" />
      </el-form-item>
      <el-form-item label="提交至">
        <el-date-picker
          v-model="to"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm"
          format="YYYY-MM-DD HH:mm"
          placeholder="选择日期和时间" />
      </el-form-item>
    </DeskFilters>
    <el-table
      show-overflow-tooltip
      :data="items"
      v-loading="busy"
      :empty-text="notice ? '申请暂无法显示，请重试' : '暂无符合条件的申请'">
      <el-table-column prop="applicationNo" label="申请编号" min-width="145" />
      <el-table-column prop="nickname" label="用户" min-width="100" />
      <el-table-column
        :prop="props.domain === 'student' ? 'schoolName' : 'realNameMasked'"
        :label="props.domain === 'student' ? '学校' : '姓名'"
        min-width="130" />
      <el-table-column v-if="domain === 'student'" label="有效截止时刻">
        <template #default="{ row }">{{ displayTime(row.expireAt) || "—" }}</template>
      </el-table-column>
      <el-table-column prop="submittedAt" label="提交时间" min-width="148">
        <template #default="s">{{ displayTime(s.row.submittedAt) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="s">
          <span class="chip" :class="s.row.status">{{ labels[s.row.status] }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="110">
        <template #default="s">
          <el-button link class="desk-row-link" size="small" @click="open(s.row)">审核详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <DeskPager
      :page="page"
      :total="total"
      :busy="busy"
      @turn="
        (step) => {
          page += step;
          load();
        }
      " />
  </section>
  <div v-else-if="detail" class="detail-grid">
    <section class="panel">
      <header>
        <strong>用户提交材料</strong>
        <span class="chip" :class="detail.application.status">{{ labels[detail.application.status] }}</span>
      </header>
      <div class="summary">
        <strong>{{ detail.application.applicationNo }}</strong>
        <p>{{ detail.nickname }} · {{ detail.phoneMasked }}</p>
      </div>
      <dl>
        <dt>用户编号</dt>
        <dd>{{ detail.userId }}</dd>
        <template v-if="props.domain === 'student'">
          <dt>学校名称</dt>
          <dd>{{ detail.application.schoolName }}</dd>
          <dt>实名认证</dt>
          <dd>
            {{ labels[detail.realnameStatus || "unverified"] }} ·
            {{ detail.realNameMasked || "—" }}
          </dd>
          <dt>有效截止时刻</dt>
          <dd>{{ displayTime(detail.application.expireAt) || "尚未设置" }}</dd>
        </template>
        <template v-else>
          <dt>姓名</dt>
          <dd>{{ detail.identityDocuments?.fullName ?? detail.application.realNameMasked }}</dd>
          <dt>身份证号码</dt>
          <dd>{{ detail.identityDocuments?.fullIdCard ?? detail.application.idCardMasked }}</dd>
        </template>
        <dt>提交时间</dt>
        <dd>{{ displayTime(detail.application.submittedAt) }}</dd>
        <dt>审核时间</dt>
        <dd>{{ displayTime(detail.application.reviewedAt) || "尚未审核" }}</dd>
        <dt>审核管理员</dt>
        <dd>{{ detail.reviewedByAdminUserId || "尚未审核" }}</dd>
        <dt>审核备注</dt>
        <dd>
          {{ detail.auditRemark || detail.application.rejectReason || "尚未填写" }}
        </dd>
      </dl>
      <div class="materials">
        <h3>{{ props.domain === "realname" ? "证件正反面" : "学生证材料" }}</h3>
        <template v-if="props.domain === 'realname'">
          <div v-if="detail.identityDocuments" :key="detail.application.id" class="images">
            <img :src="identityPhotoSource(detail.identityDocuments.frontUrl)" alt="身份证正面" referrerpolicy="no-referrer" />
            <img :src="identityPhotoSource(detail.identityDocuments.backUrl)" alt="身份证反面" referrerpolicy="no-referrer" />
          </div>
          <p v-else>当前账号无证件照片查看权限。</p>
        </template>
        <div v-else-if="!sensitive" class="locked">
          <p>私有照片，授权后临时查看。完整资料不会随列表或详情加载。</p>
          <el-button :disabled="!detail.canViewSensitive || busy" @click="authorizeStudent">
            {{ detail.canViewSensitive ? "授权查看敏感资料" : "无敏感资料查看权限" }}
          </el-button>
        </div>
        <template v-else>
          <div class="notice">
            本次查看已审计，授权截止
            {{ displayTime(sensitive.expiresAt) }}。离开页面后自动清除。
          </div>
          <p v-if="sensitive.phone">联系电话：{{ sensitive.phone }}</p>
          <p v-if="sensitive.realnameView?.access === 'granted'">
            关联实名：{{ sensitive.realnameView.fullName }} ·
            {{ sensitive.realnameView.fullIdCard }}
          </p>
          <p v-else-if="sensitive.realnameView">
            关联实名：{{ sensitive.realnameView.access === "not_authorized" ? "未获额外授权" : "暂无资料" }}
          </p>
          <div class="images">
            <img
              v-for="image in sensitive.images"
              :key="image.position"
              :src="image.url"
              :alt="'学生证材料 ' + image.position"
              referrerpolicy="no-referrer" />
          </div>
          <el-button @click="clearSensitive">结束查看</el-button>
        </template>
      </div>
      <div class="notice">资料仅用于认证审核；人工审核不代表联网或人脸核验。已提交历史材料保留。</div>
    </section>
    <aside class="panel review">
      <header><strong>审核操作</strong></header>
      <div class="review-body">
        <div v-if="unknown" class="notice">
          原操作结果尚未确认，请先查询。原请求编号：{{ recoveryId }}。
          <el-button @click="load" :loading="busy">刷新原申请</el-button>
          <el-button :disabled="!command || busy" @click="send">原编号重试</el-button>
          <el-button v-if="!command && detail.canReview" :disabled="busy" @click="resumeDecision">
            重新填写并沿用原编号
          </el-button>
        </div>
        <template v-if="detail.canReview && (!unknown || refilling)">
          <label v-if="props.domain === 'student'">
            认证有效期（通过时必选）
            <el-select v-model="years" placeholder="请选择" aria-label="认证有效期">
              <el-option
                v-for="n in [1, 2, 3, 4, 5]"
                :key="n"
                :label="['一年', '二年', '三年', '四年', '五年'][n - 1]"
                :value="n" />
            </el-select>
            <small>从实际审核通过时刻增加所选日历年；达到截止时刻失效。驳回不设置有效期。</small>
          </label>
          <label>
            审核意见（驳回必填）
            <el-input
              v-model="remark"
              type="textarea"
              :rows="5"
              maxlength="255"
              show-word-limit
              placeholder="填写核验结果或具体补充要求" />
          </label>
          <div class="actions">
            <el-button @click="decide('reject')" :disabled="busy">驳回</el-button>
            <el-button type="primary" @click="decide('approve')" :disabled="busy">审核通过</el-button>
          </div>
        </template>
        <p v-else-if="!unknown">
          {{
            detail.application.status === "pending"
              ? "当前账号无审核权限或申请人受限。"
              : "本申请已完成审核，原材料不可修改。"
          }}
        </p>
        <el-button @click="load" :loading="busy">刷新详情</el-button>
      </div>
    </aside>
  </div>
  <section v-else class="panel empty">
    <p>{{ busy ? "正在读取原申请…" : "详情暂无法显示" }}</p>
    <el-button @click="load" :loading="busy">重试</el-button>
  </section>
</template>
<style scoped>
.heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.crumb {
  font-size: 11px;
  color: #7b8490;
}
.heading h1 {
  font-size: 22px;
  margin: 8px 0;
}
.heading p {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
}
.panel {
  background: white;
  border: 1px solid #e0e4e8;
  border-radius: 8px;
  overflow: hidden;
}
.panel header {
  padding: 16px 18px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}
.panel header span {
  font-size: 12px;
}
.filters {
  padding: 14px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  background: #fafbfc;
}
.filters .el-select {
  width: 120px;
}
.filters .el-input {
  width: 190px;
}
.filters label {
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.filters input {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  height: 30px;
  max-width: 170px;
}
.panel footer {
  padding: 18px;
  display: flex;
  gap: 14px;
  align-items: center;
}
.chip {
  padding: 5px 10px;
  border-radius: 20px;
  background: #f1f3f5;
  color: #68717f;
  font-size: 11px;
  white-space: nowrap;
}
.chip.pending {
  background: #fff3be;
  color: #796500;
}
.chip.verified,
.chip.approved {
  background: #d9f6e5;
  color: #19734a;
}
.chip.rejected {
  background: #fde5e5;
  color: #a32632;
}
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
}
.summary {
  background: #fafbfc;
  padding: 18px;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.summary p {
  color: #6b7280;
  margin-bottom: 0;
}
dl {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 18px 12px;
  padding: 18px;
  font-size: 13px;
}
dt {
  color: #6b7280;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.materials {
  border-top: 1px solid #eee;
  padding: 18px;
}
.materials h3 {
  font-size: 15px;
}
.locked {
  padding: 25px;
  background: #f7f8fa;
  text-align: center;
  border: 1px dashed #d9dee5;
  font-size: 12px;
  color: #6b7280;
}
.notice {
  padding: 12px 15px;
  background: #fff8cf;
  border: 1px solid #eee1a2;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.7;
  margin: 12px;
}
.images {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0;
}
.images img {
  width: 100%;
  max-height: 330px;
  object-fit: contain;
  background: #f4f5f6;
}
.review {
  align-self: start;
}
.review-body {
  padding: 18px;
}
.review-body label {
  display: block;
  font-size: 13px;
  margin: 12px 0 24px;
}
.review-body .el-select,
.review-body .el-textarea {
  margin-top: 10px;
  width: 100%;
}
.review-body small {
  display: block;
  color: #6b7280;
  line-height: 1.6;
  margin-top: 8px;
}
.actions {
  display: flex;
  gap: 8px;
  margin: 18px 0;
}
.empty {
  padding: 40px;
  text-align: center;
}
:deep(.el-table) {
  font-size: 12px;
}
:deep(.el-table th.el-table__cell) {
  background: #f7f8fa;
}
:deep(.el-table td.el-table__cell) {
  padding: 16px 0;
}
@media (max-width: 1000px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
  .filters input {
    max-width: 145px;
  }
}
</style>
