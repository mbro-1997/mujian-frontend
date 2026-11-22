<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskQueueMetrics from "../../components/DeskQueueMetrics.vue";
import DeskPager from "../../components/DeskPager.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import "element-plus/es/components/tag/style/css";
import "element-plus/es/components/checkbox/style/css";
import DeskPanel from "../../components/DeskPanel.vue";
import { displayTime } from "../verification/display-time";
import "element-plus/es/components/dialog/style/css";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { ElMessageBox, ElTag, ElCheckbox, ElDialog } from "element-plus";
import { api, refreshCsrf, isStale, errorText } from "../../api/http";
import { me, explain } from "../../session/state";
import { useSessionView } from "../../session/view";
import Fields from "./FactoryFields.vue";
import type {
  Invitation,
  InvitationResult,
  QueueItem,
  AdminFactory,
  AdminOnboarding,
  AdminChange,
  MaterialLocator,
  MaterialView,
  SensitiveResult,
  ChangeSensitiveResult,
  ReviewRecovery,
} from "../../api/factory-types";
const props = defineProps<{
  kind: "invitations" | "onboarding" | "changes" | "profiles";
}>();
function apiTime(value: string) {
  return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().replace("Z", "+08:00");
}
const configs = {
  invitations: {
    title: "工厂邀请码",
    path: "factory-invitations",
    permission: "factory-invite",
  },
  onboarding: {
    title: "工厂入驻审核",
    path: "factory-onboarding",
    permission: "factory-onboarding",
  },
  changes: {
    title: "工厂资料变更审核",
    path: "factory-profile-changes",
    permission: "factory-profile-change",
  },
  profiles: { title: "工厂查询", path: "factories", permission: "factory" },
};
const config = computed(() => configs[props.kind]),
  root = computed(() => "/api/admin/" + config.value.path);
const allow = (action: string) =>
  me.value?.permissions.includes("admin:" + config.value.permission + ":" + action) === true;
const rows = ref<Array<Invitation | QueueItem | AdminFactory>>([]),
  total = ref("0"),
  page = ref(1),
  keyword = ref(""),
  from = ref(""),
  to = ref(""),
  status = ref(props.kind === "onboarding" || props.kind === "changes" ? "pending" : ""),
  busy = ref(false),
  message = ref("");
const createOpen = ref(false);
const revokedSuffix = ref("");
const onboarding = ref<AdminOnboarding | null>(null),
  change = ref<AdminChange | null>(null),
  profile = ref<AdminFactory | null>(null),
  invite = ref<InvitationResult | null>(null),
  sensitive = ref<SensitiveResult | null>(null),
  changeSensitive = ref<ChangeSensitiveResult | null>(null),
  picture = ref<MaterialView | null>(null),
  remark = ref(""),
  confirmed = ref(false),
  createRemark = ref(""),
  expireAt = ref("");
type Command = {
  key: string;
  path: string;
  body: object;
  type: "create" | "revoke" | "review";
};
const command = ref<Command | null>(null),
  unknown = ref(false),
  refilling = ref<Omit<Command, "body"> | null>(null);
const pendingKey = () => "mj.factory.pending." + me.value?.userId + "." + props.kind;
function showInvitation(result: InvitationResult) {
  clearSensitive();
  createOpen.value = false;
  createRemark.value = "";
  expireAt.value = "";
  invite.value = result;
  if (result.codeAvailability === "available") {
    timer = setTimeout(clearSensitive, Math.max(0, Date.parse(result.recoverUntil || "") - Date.now()));
  }
}
let timer: ReturnType<typeof setTimeout> | undefined;
let detailRequest = 0;
let materialRequest = 0;
const clearSensitive = () => {
  materialRequest++;
  sensitive.value = null;
  changeSensitive.value = null;
  picture.value = null;
  invite.value = null;
  clearTimeout(timer);
};
const view = useSessionView(() => {
  detailRequest++;
  createOpen.value = false;
  revokedSuffix.value = "";
  rows.value = [];
  onboarding.value = null;
  change.value = null;
  profile.value = null;
  clearSensitive();
  command.value = null;
  refilling.value = null;
  unknown.value = false;
  remark.value = "";
  createRemark.value = "";
  expireAt.value = "";
  confirmed.value = false;
  busy.value = false;
});
const selected = computed(() => onboarding.value || change.value || profile.value),
  canReview = computed(() => allow("review") && (onboarding.value?.canReview || change.value?.canReview));
const baseChanged = computed(
  () => !!change.value && change.value.baseProfileVersion !== change.value.currentProfileVersion
);
const canApprove = computed(() => !!canReview.value && !baseChanged.value);
const fieldLabels: Record<string, string> = {
  factoryName: "工厂名称",
  unifiedSocialCreditCode: "统一社会信用代码",
  factoryAvatar: "工厂头像",
  businessLicense: "营业执照",
  factoryPhotos: "工厂实景",
  contactName: "联系人",
  contactPhone: "联系电话",
  factoryAddress: "工厂地址",
  mainBusiness: "主营业务",
  workerCount: "工人数",
  specialtyCategoryIds: "擅长品类",
  cases: "服务案例",
  remark: "备注",
};
const labels: Record<string, string> = {
  unused: "未使用",
  locked: "已锁定",
  used: "已使用",
  expired: "已过期",
  revoked: "已作废",
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  cancelled: "已取消",
  active: "正常",
  disabled: "已停用",
  suspended: "暂停",
};
const statuses = computed(() =>
  props.kind === "invitations"
    ? ["", "unused", "locked", "used", "expired", "revoked"]
    : props.kind === "profiles"
    ? ["", "active", "disabled", "suspended"]
    : ["pending", "approved", "rejected", "cancelled"]
);
function fail(e: unknown) {
  if (!isStale(e)) {
    const x = explain(e);
    message.value = (errorText[x.reason] || x.message) + (x.traceId ? " 追踪号：" + x.traceId : "");
  }
}
async function load() {
  const owner = view.capture();
  busy.value = true;
  try {
    const q = new URLSearchParams({ page: String(page.value), pageSize: "20" });
    if (status.value) q.set("status", status.value);
    if (keyword.value.trim()) q.set("keyword", keyword.value.trim());
    if (from.value) q.set("from", apiTime(from.value));
    if (to.value) q.set("to", apiTime(to.value));
    const data = await api<{ items: typeof rows.value; total: string }>(root.value + "?" + q);
    if (view.current(owner)) {
      rows.value = data.items;
      total.value = data.total;
      message.value = "";
    }
  } catch (e) {
    if (view.current(owner)) fail(e);
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
async function open(id: string) {
  const owner = view.capture();
  const request = ++detailRequest;
  clearSensitive();
  onboarding.value = null;
  change.value = null;
  profile.value = null;
  remark.value = "";
  confirmed.value = false;
  try {
    const data = await api<AdminOnboarding | AdminChange | AdminFactory>(root.value + "/" + id);
    if (!view.current(owner) || request !== detailRequest) return;
    if (props.kind === "onboarding") onboarding.value = data as AdminOnboarding;
    else if (props.kind === "changes") change.value = data as AdminChange;
    else profile.value = data as AdminFactory;
  } catch (e) {
    if (view.current(owner) && request === detailRequest) fail(e);
  }
}
function hide() {
  detailRequest++;
  clearSensitive();
  onboarding.value = null;
  change.value = null;
  profile.value = null;
}
async function showImage(locator: MaterialLocator) {
  const owner = view.capture();
  const request = ++materialRequest;
  try {
    await refreshCsrf();
    if (!view.current(owner) || request !== materialRequest) return;
    const data = await api<MaterialView>("/api/admin/factory-materials/view", "POST", locator);
    if (view.current(owner) && request === materialRequest) {
      picture.value = data;
      clearTimeout(timer);
      timer = setTimeout(
        clearSensitive,
        Math.min(120000, Math.max(0, Date.parse(data.expiresAt) - Date.now()))
      );
    }
  } catch (e) {
    if (view.current(owner) && request === materialRequest) fail(e);
  }
}
async function reveal() {
  if (!selected.value) return;
  const owner = view.capture();
  const request = ++materialRequest;
  try {
    await refreshCsrf();
    if (!view.current(owner) || request !== materialRequest) return;
    const data = await api<SensitiveResult | ChangeSensitiveResult>(
      root.value + "/" + selected.value.id + "/sensitive-view",
      "POST"
    );
    if (view.current(owner) && request === materialRequest) {
      if (props.kind === "changes") changeSensitive.value = data as ChangeSensitiveResult;
      else sensitive.value = data as SensitiveResult;
      clearTimeout(timer);
      timer = setTimeout(clearSensitive, 120000);
    }
  } catch (e) {
    if (view.current(owner) && request === materialRequest) fail(e);
  }
}
function originalKey(type: Command["type"], path: string) {
  if (refilling.value) {
    if (refilling.value.type !== type || refilling.value.path !== path)
      throw new Error("请按原操作目标和决定重填，不能复用编号执行其他操作");
    return refilling.value.key;
  }
  return crypto.randomUUID().replaceAll("-", "");
}
function resume() {
  const saved = sessionStorage.getItem(pendingKey());
  if (!saved) return;
  refilling.value = JSON.parse(saved);
  unknown.value = false;
  message.value = "请重新填写原操作内容，将继续使用原编号；已提交的原记录不会被覆盖。";
}
function remember(c: Command) {
  command.value = c;
  unknown.value = true;
  sessionStorage.setItem(pendingKey(), JSON.stringify({ key: c.key, path: c.path, type: c.type }));
}
function forget() {
  sessionStorage.removeItem(pendingKey());
  command.value = null;
  refilling.value = null;
  unknown.value = false;
}
async function send() {
  const c = command.value;
  if (!c) return;
  const owner = view.capture();
  busy.value = true;
  try {
    await refreshCsrf();
    const result = await api<InvitationResult | unknown>(c.path, "POST", c.body, false, c.key);
    if (!view.current(owner)) return;
    forget();
    if (c.type === "create") {
      showInvitation(result as InvitationResult);
    } else if (c.type === "revoke") {
      revokedSuffix.value = (result as Invitation).suffix;
    } else if (selected.value) await open(selected.value.id);
    await load();
  } catch (e) {
    if (view.current(owner)) {
      fail(e);
      const reason = (e as { reason?: string }).reason;
      if (
        (e as { outcome?: string }).outcome === "business-rejection" &&
        reason &&
        ![
          "NETWORK_UNKNOWN",
          "UNKNOWN_RESPONSE",
          "DATABASE_UNAVAILABLE",
          "SESSION_STORE_UNAVAILABLE",
          "UNEXPECTED_ERROR",
          "IDEMPOTENCY_KEY_REUSED",
          "TOO_MANY_REQUESTS",
        ].includes(reason)
      )
        forget();
      else {
        unknown.value = true;
        if (c.type === "create") createOpen.value = false;
      }
    }
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
async function create() {
  if (busy.value || unknown.value) return;
  try {
    remember({
      key: originalKey("create", root.value),
      type: "create",
      path: root.value,
      body: {
        expireAt: expireAt.value ? apiTime(expireAt.value) : null,
        remark: createRemark.value.trim() || null,
      },
    });
    await send();
  } catch (e) {
    fail(e);
  }
}
async function revoke(row: Invitation) {
  if (busy.value || unknown.value) return;
  const owner = view.capture();
  try {
    const { value } = await ElMessageBox.prompt(
      `请填写作废尾号 ${row.suffix} 的原因。提交过入驻申请的邀请码不可作废。`,
      "作废邀请码",
      {
        inputValidator: (v) => (!!v?.trim() && v.trim().length <= 255) || "请填写1～255字原因",
      }
    );
    if (!view.current(owner)) return;
    remember({
      key: originalKey("revoke", root.value + "/" + row.id + "/revoke"),
      type: "revoke",
      path: root.value + "/" + row.id + "/revoke",
      body: { reason: value.trim() },
    });
    await send();
  } catch (e) {
    if (e !== "cancel" && e !== "close" && view.current(owner)) fail(e);
  }
}
async function review(approve: boolean) {
  const detail = onboarding.value || change.value;
  if (!detail || !canReview.value || busy.value || unknown.value) return;
  if (approve && !canApprove.value) {
    message.value = "当前资料版本已变化，不能批准；可填写原因驳回后重新提交。";
    return;
  }
  if (!approve && !remark.value.trim()) {
    message.value = "请填写驳回原因";
    return;
  }
  const owner = view.capture();
  try {
    await ElMessageBox.confirm(
      approve ? "确认按当前资料执行批准？" : "确认驳回？申请人将能查看驳回原因并修改资料。",
      approve ? "批准申请" : "驳回申请"
    );
    if (!view.current(owner)) return;
    const body = approve
      ? {
          expectedVersion: detail.version,
          remark: remark.value.trim() || null,
          ...(change.value
            ? {
                baseProfileVersion: change.value.baseProfileVersion,
                sameLegalEntityConfirmed: confirmed.value,
              }
            : {}),
        }
      : { expectedVersion: detail.version, reason: remark.value.trim() };
    remember({
      key: originalKey("review", root.value + "/" + detail.id + (approve ? "/approve" : "/reject")),
      type: "review",
      path: root.value + "/" + detail.id + (approve ? "/approve" : "/reject"),
      body,
    });
    await send();
  } catch (e) {
    if (e !== "cancel" && e !== "close" && view.current(owner)) fail(e);
  }
}
async function recover() {
  const saved = sessionStorage.getItem(pendingKey());
  if (!saved) return;
  const c = JSON.parse(saved) as Omit<Command, "body">,
    owner = view.capture();
  busy.value = true;
  try {
    if (c.type === "revoke") {
      if (command.value) await send();
      else
        message.value =
          "作废结果未确认。请刷新邀请码状态；若仍可作废，请使用原编号 " +
          c.key +
          " 联系平台核对，不能另发新码。";
      return;
    }
    const data = await api<InvitationResult | ReviewRecovery>(
      c.type === "create"
        ? "/api/admin/factory-invitations/by-request/" + c.key
        : "/api/admin/factory-review-actions/by-request/" + c.key
    );
    if (!view.current(owner)) return;
    forget();
    if (c.type === "create") showInvitation(data as InvitationResult);
    await load();
  } catch (e) {
    if (view.current(owner)) fail(e);
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
function visibility() {
  if (document.hidden) clearSensitive();
}
onMounted(() => {
  unknown.value = !!sessionStorage.getItem(pendingKey());
  void load();
  document.addEventListener("visibilitychange", visibility);
});
onUnmounted(() => {
  clearSensitive();
  document.removeEventListener("visibilitychange", visibility);
});
useDetailScroll(() => !!selected.value);
function resetFilters() {
  keyword.value = "";
  from.value = "";
  to.value = "";
  status.value = statuses.value[0];
  page.value = 1;
  return load();
}
</script>
<template>
  <section class="factory-panel">
    <header>
      <div>
        <h1>{{ config.title }}{{ selected ? "详情" : "" }}</h1>
        <p>
          {{
            kind === "profiles"
              ? "查看工厂主体、主账号和经营状态。"
              : "以申请快照和当前资料为依据，所有审核与敏感查看均留痕。"
          }}
        </p>
      </div>
      <div>
        <el-button v-if="selected" @click="hide">返回列表</el-button>
        <template v-else>
          <el-button @click="load" :loading="busy">刷新</el-button>
          <el-button
            v-if="kind === 'invitations' && allow('manage')"
            type="primary"
            :disabled="busy || unknown"
            @click="createOpen = true">
            生成邀请码
          </el-button>
        </template>
      </div>
    </header>
    <el-alert v-if="message" :title="message" type="warning" :closable="false" />
    <el-alert
      v-if="unknown"
      title="存在结果尚未确认的操作。请查询原操作，不要生成新的操作编号。"
      type="warning"
      :closable="false">
      <el-button @click="recover" :disabled="busy">查询原操作</el-button>
      <el-button v-if="!command" @click="resume" :disabled="busy">重填原操作内容</el-button>
      <el-button v-if="command" @click="send" :disabled="busy">使用原编号重试</el-button>
    </el-alert>
    <el-dialog
      class="desk-dialog"
      align-center
      append-to-body
      v-if="kind === 'invitations' && allow('manage')"
      v-model="createOpen"
      :close-on-click-modal="false"
      :close-on-press-escape="!busy"
      :show-close="!busy"
      @closed="!refilling && !unknown && (createRemark = expireAt = '')"
      title="生成邀请码"
      width="min(480px, 92vw)">
      <el-form label-position="top" @submit.prevent="create">
        <el-form-item label="有效至">
          <el-date-picker v-model="expireAt" type="datetime" value-format="YYYY-MM-DDTHH:mm"
            format="YYYY-MM-DD HH:mm" placeholder="默认自生成时起 7 天" :disabled="busy" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="createRemark" type="textarea" :rows="3" maxlength="255" show-word-limit
            placeholder="选填" :disabled="busy" />
        </el-form-item>
        <el-alert v-if="message" :title="message" type="warning" :closable="false" />
      </el-form>
      <template #footer>
        <el-button :disabled="busy" @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="busy" @click="create">确认生成</el-button>
      </template>
    </el-dialog>
    <el-dialog v-if="invite" :model-value="true" title="邀请码生成结果" class="desk-dialog"
      align-center append-to-body width="min(480px, 92vw)" @close="clearSensitive">
      <strong v-if="invite.codeAvailability === 'available'">{{ invite.inviteCode }}</strong>
      <p v-else>邀请码明文已不可恢复，可查看后缀和到期时间。</p>
      <p>尾号 {{ invite.invitation.suffix }} · 到期 {{ displayTime(invite.invitation.expireAt) }}</p>
      <p v-if="invite.codeAvailability === 'available'">请及时复制并转交申请人，完整邀请码仅限时可见。</p>
      <template #footer><el-button type="primary" @click="clearSensitive">完成</el-button></template>
    </el-dialog>
    <el-dialog v-if="revokedSuffix" :model-value="true" title="邀请码已作废" class="desk-dialog"
      align-center append-to-body width="min(480px, 92vw)" @close="revokedSuffix = ''">
      <p>尾号 {{ revokedSuffix }} 的邀请码已作废，使用记录已保留。</p>
      <template #footer><el-button type="primary" @click="revokedSuffix = ''">返回列表</el-button></template>
    </el-dialog>
    <DeskQueueMetrics v-if="!selected" />
    <DeskPanel
      v-if="!selected"
      :title="kind === 'profiles' ? '工厂主体' : config.title + '列表'"
      :meta="busy || message ? undefined : '共 ' + total + (kind === 'profiles' ? ' 家' : ' 条')">
      <DeskFilters
        :busy="busy"
        @search="
          page = 1;
          load();
        "
        @reset="resetFilters">
        <el-form-item class="desk-status-filter" :label="kind === 'profiles' ? '工厂状态' : '状态'">
          <el-select placeholder="全部状态" v-model="status" popper-class="desk-select-menu">
            <el-option v-for="s in statuses" :key="s" :value="s" :label="labels[s] || '全部状态'" />
          </el-select>
        </el-form-item>
        <el-form-item :label="kind === 'profiles' ? '工厂名称' : '关键词'">
          <el-input
            v-model="keyword"
            clearable
            :placeholder="
              kind === 'profiles'
                ? '输入工厂名称'
                : kind === 'invitations'
                ? '输入邀请码尾号'
                : '申请编号或工厂名称'
            " />
        </el-form-item>
        <el-form-item
          v-if="kind !== 'invitations'"
          :label="kind === 'profiles' ? '创建时间' : '提交时间'"
          class="desk-time-interval">
          <el-date-picker
            v-model="from"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm"
            format="YYYY-MM-DD HH:mm"
            placeholder="开始时间"
            aria-label="开始时间"
            :value-on-clear="() => ''" />
          <span class="desk-interval-to">至</span>
          <el-date-picker
            v-model="to"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm"
            format="YYYY-MM-DD HH:mm"
            placeholder="截止时间（不含）"
            aria-label="截止时间（不含）"
            :value-on-clear="() => ''" />
        </el-form-item>
      </DeskFilters>
      <el-table
        show-overflow-tooltip
        :data="rows"
        v-loading="busy"
        :empty-text="message ? '记录暂无法显示' : '暂无符合条件的记录'">
        <template v-if="kind === 'invitations'">
          <el-table-column prop="suffix" label="邀请码后缀" />
          <el-table-column label="状态">
            <template #default="{ row }">{{ labels[row.inviteStatus] }}</template>
          </el-table-column>
          <el-table-column label="到期时间">
            <template #default="{ row }">{{ displayTime(row.expireAt) }}</template>
          </el-table-column>
          <el-table-column label="锁定账号">
            <template #default="{ row }">{{ row.lockedByUserId || "—" }}</template>
          </el-table-column>
          <el-table-column label="已提交申请">
            <template #default="{ row }">{{ row.hasSubmittedApplication ? "是" : "否" }}</template>
          </el-table-column>
        </template>
        <template v-else-if="kind === 'profiles'">
          <el-table-column prop="id" label="工厂 ID" />
          <el-table-column prop="materials.factoryName" label="工厂名称" min-width="145" />
          <el-table-column prop="ownerUserId" label="主账号 ID" />
          <el-table-column prop="materials.contactPhoneMasked" label="联系电话" min-width="112" />
          <el-table-column label="主营品类">
            <template #default="{ row }">
              {{ row.materials.specialtyCategoryNames.join("、") || "—" }}
            </template>
          </el-table-column>
          <el-table-column label="道具 SKU 数"><template #default>未提供</template></el-table-column>
          <el-table-column label="进行中订单"><template #default>未提供</template></el-table-column>
          <el-table-column label="工厂状态" width="86">
            <template #default="{ row }">
              <el-tag size="small" :type="row.factoryStatus === 'active' ? 'success' : 'info'">
                {{ labels[row.factoryStatus] }}
              </el-tag>
            </template>
          </el-table-column>
        </template>
        <template v-else>
          <el-table-column v-if="kind === 'onboarding'" prop="applicationNo" label="申请编号" />
          <el-table-column prop="factoryName" label="工厂名称" />
          <el-table-column prop="applicantNickname" label="申请人" />
          <el-table-column v-if="kind === 'onboarding'" prop="creditCodeMasked" label="信用代码摘要" />
          <el-table-column v-else label="本次修改项">
            <template #default="{ row }">
              {{ row.changedFields.map((k: string) => fieldLabels[k] || k).join("、") }}
            </template>
          </el-table-column>
          <el-table-column label="提交时间">
            <template #default="{ row }">{{ displayTime(row.submittedAt) }}</template>
          </el-table-column>
          <el-table-column label="审核状态">
            <template #default="{ row }">
              <span class="desk-status" :class="row.auditStatus">{{ labels[row.auditStatus] }}</span>
            </template>
          </el-table-column>
        </template>
        <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false">
          <template #default="{ row }">
            <el-button
              v-if="kind !== 'invitations'"
              link
              class="desk-row-link"
              size="small"
              @click="open(row.id)">
              {{ kind === "profiles" ? "查看资料" : "详情" }}
            </el-button>
            <el-button
              v-else-if="allow('manage') && row.canRevoke"
              plain
              size="small"
              @click="revoke(row)"
              :disabled="busy || unknown">
              作废
            </el-button>
            <span v-else>—</span>
          </template>
        </el-table-column>
      </el-table>
      <DeskPager
        :page="page"
        :total="total"
        :busy="busy"
        @turn="
          page += $event;
          load();
        " />
    </DeskPanel>
    <section v-if="selected" class="record-panel">
      <template v-if="selected">
        <p>记录编号 {{ selected.id }}</p>
        <el-button v-if="allow('sensitive')" @click="reveal">查看联系信息（留痕）</el-button>
        <template v-if="onboarding">
          <el-alert :title="labels[onboarding.auditStatus] || ''" :closable="false" />
          <p v-if="onboarding.rejectReason">驳回原因：{{ onboarding.rejectReason }}</p>
          <Fields :fields="onboarding.materials" :sensitive="sensitive || undefined" @view="showImage" />
          <h3>确认的规则版本</h3>
          <p v-for="rule in onboarding.acceptedRules" :key="rule.documentId">
            {{ rule.documentId }} · {{ rule.version }} · {{ rule.contentHash }}
          </p>
          <p v-if="!onboarding.caseId">申请已保存，审核案件等待补建。</p>
        </template>
        <template v-if="change">
          <el-alert :title="labels[change.auditStatus] || ''" :closable="false" />
          <p>
            基线版本 {{ change.baseProfileVersion }} · 当前版本
            {{ change.currentProfileVersion }}
          </p>
          <p>变更字段：{{ change.changedFields.map((k) => fieldLabels[k] || k).join("、") }}</p>
          <p v-if="change.rejectReason">驳回原因：{{ change.rejectReason }}</p>
          <div class="comparison">
            <section>
              <h3>申请时原资料</h3>
              <Fields :fields="change.before" :sensitive="changeSensitive?.before" @view="showImage" />
            </section>
            <section>
              <h3>申请修改资料</h3>
              <Fields :fields="change.proposed" :sensitive="changeSensitive?.proposed" @view="showImage" />
            </section>
            <section>
              <h3>当前生效资料</h3>
              <Fields :fields="change.current" :sensitive="changeSensitive?.current" @view="showImage" />
            </section>
          </div>
        </template>
        <template v-if="profile">
          <p>
            资料版本 {{ profile.profileVersion }} ·
            {{ labels[profile.factoryStatus] }}
          </p>
          <Fields :fields="profile.materials" :sensitive="sensitive || undefined" @view="showImage" />
        </template>
        <div v-if="canReview" class="review">
          <el-alert
            v-if="baseChanged"
            type="warning"
            :closable="false"
            title="当前资料版本已变化，不能批准；可驳回后由申请人基于新版本重新提交。" />
          <el-input
            type="textarea"
            v-model="remark"
            :maxlength="change ? 255 : 500"
            placeholder="审核备注 / 驳回原因" />
          <el-checkbox
            v-if="change && change.before.unifiedSocialCreditCode !== change.proposed.unifiedSocialCreditCode"
            v-model="confirmed">
            已核对信用代码变更仍属于同一法律主体（须填写备注）
          </el-checkbox>
          <el-button type="primary" @click="review(true)" :disabled="busy || unknown || !canApprove">
            批准
          </el-button>
          <el-button type="danger" @click="review(false)" :disabled="busy || unknown">驳回</el-button>
        </div>
      </template>
    </section>
    <el-dialog
      class="desk-dialog"
      align-center
      append-to-body
      :model-value="!!picture"
      @close="picture = null"
      title="授权材料（短时有效）">
      <img v-if="picture" :src="picture.url" alt="授权查看的工厂材料" class="material-image" />
    </el-dialog>
  </section>
</template>
<style scoped>
.factory-panel {
  min-width: 0;
}
.factory-panel header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.factory-panel h1 {
  margin: 8px 0;
  font-size: 24px;
}
.factory-panel header p,
.factory-panel small {
  color: #737b87;
}
.filters,
.paging {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 24px 0;
  flex-wrap: wrap;
}
.comparison {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}
.comparison section {
  padding: 16px;
  background: #fafafa;
}
.review {
  position: sticky;
  bottom: 0;
  background: white;
  padding: 20px;
  border-top: 1px solid #ddd;
}
.review .el-textarea {
  margin-bottom: 16px;
}
.material-image {
  max-width: 100%;
  max-height: 70vh;
}
.paging {
  justify-content: flex-end;
}
@media (max-width: 1100px) {
  .comparison {
    grid-template-columns: 1fr;
  }
}
</style>
