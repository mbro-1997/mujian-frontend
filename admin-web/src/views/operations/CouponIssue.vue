<script setup lang="ts">
import { computed, ref } from "vue";
import { api, ApiError, refreshCsrf } from "../../api/http";
import { me } from "../../session/state";
import { useSessionView } from "../../session/view";
type Receipt = {
  distributionId: string;
  targetCount: string;
  issuedQuantity: string;
  completedAt: string;
};
type Input = {
  templateId: string;
  mode: string;
  quantityPerUser: number;
  reason: string;
  userIds?: string[];
  audienceFilter?: { businessRole: string; accountStatus: string };
};
const templateId = ref(""),
  mode = ref("selected_users"),
  userIds = ref(""),
  quantity = ref(1),
  reason = ref("");
const notice = ref(""),
  busy = ref(false),
  result = ref<Receipt | null>(null);
const storageKey = computed(() => "mj.couponIssue." + me.value?.userId);
type Pending = { key: string; input: Input };
const pending = ref<Pending | null>(null);
try {
  pending.value = JSON.parse(sessionStorage.getItem(storageKey.value) || "null");
} catch {
  /* 旧浏览器无草稿。 */
}
const view = useSessionView(() => {
  pending.value = null;
  result.value = null;
  notice.value = "";
});
const confirming = ref(false);
function returnToIssueForm() {
  result.value = null;
  templateId.value = "";
  mode.value = "selected_users";
  userIds.value = "";
  quantity.value = 1;
  reason.value = "";
}
function prepare() {
  const users = Array.from(
    new Set(
      userIds.value
        .trim()
        .split(/[\s,，]+/)
        .filter(Boolean)
    )
  ).sort();
  const id = /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/;
  if (
    !id.test(templateId.value) ||
    !reason.value.trim() ||
    !Number.isInteger(quantity.value) ||
    quantity.value < 1 ||
    (mode.value === "selected_users" && (!users.length || users.some((x) => !id.test(x))))
  ) {
    notice.value = "请核对模板、目标用户、发放说明和每人数量";
    return;
  }
  result.value = null;
  notice.value = "";
  confirming.value = true;
}
async function submit() {
  if (busy.value) return;
  if (!pending.value) {
    if (!confirming.value) return;
    const input: Input = {
      templateId: templateId.value,
      mode: mode.value,
      quantityPerUser: quantity.value,
      reason: reason.value.trim(),
    };
    if (mode.value === "selected_users")
      input.userIds = Array.from(
        new Set(
          userIds.value
            .trim()
            .split(/[\s,，]+/)
            .filter(Boolean)
        )
      ).sort();
    else
      input.audienceFilter = {
        businessRole: "demander",
        accountStatus: "active",
      };
    pending.value = { key: crypto.randomUUID(), input };
    sessionStorage.setItem(storageKey.value, JSON.stringify(pending.value));
  }
  editable.value = false;
  const operation = pending.value,
    owner = view.capture();
  busy.value = true;
  confirming.value = false;
  try {
    await refreshCsrf();
    const receipt = await api<Receipt>(
      "/api/admin/coupon-distributions/issue",
      "POST",
      operation.input,
      true,
      operation.key
    );
    if (!view.current(owner)) return;
    result.value = receipt;
    pending.value = null;
    sessionStorage.removeItem(storageKey.value);
    notice.value = "";
  } catch (error) {
    if (!view.current(owner)) return;
    const code = error instanceof ApiError ? error.reason : "NETWORK_UNKNOWN";
    if (
      ["TARGET_USER_INVALID", "NO_ELIGIBLE_USERS", "TEMPLATE_NOT_ISSUABLE", "ISSUE_ROLLED_BACK"].includes(
        code
      )
    ) {
      notice.value = (
        {
          TARGET_USER_INVALID: "指定名单包含不可发用户",
          NO_ELIGIBLE_USERS: "暂无符合条件的用户",
          TEMPLATE_NOT_ISSUABLE: "模板当前不可发",
          ISSUE_ROLLED_BACK: "本次事务已回滚",
        } as Record<string, string>
      )[code]!;
      editable.value = true;
    } else
      notice.value =
        code === "ISSUE_CONTENT_MISMATCH"
          ? "该编号对应的内容不同，请核对历史批次"
          : code === "REQUEST_OWNER_MISMATCH"
          ? "该编号属于另一位管理员"
          : "结果待核对，已保留原编号与内容";
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
const editable = ref(false);
function newIntent() {
  if (!editable.value) return;
  pending.value = null;
  editable.value = false;
  sessionStorage.removeItem(storageKey.value);
}
</script>
<template>
  <section class="business-view">
    <header class="desk-head">
      <h1>{{ result ? "成功发放记录" : "主动发放优惠券" }}</h1>
      <el-button v-if="result" @click="returnToIssueForm">返回发放入口</el-button>
    </header>
    <p v-if="!me?.permissions.includes('admin:coupon:issue')" role="status">当前账号无发券权限。</p>
    <form v-else-if="!result" class="record-panel" @submit.prevent="prepare">
      <h2>发放设置</h2>
      <fieldset :disabled="busy || !!pending || confirming">
        <label>
          模板版本 ID
          <el-input v-model.trim="templateId" required />
        </label>
        <label>
          发放对象
          <el-select
            :disabled="busy || !!pending || confirming"
            v-model="mode"
            :empty-values="[null, undefined]"
            placeholder="请选择"
            popper-class="desk-select-menu">
            <el-option value="selected_users" label="指定租赁方" />
            <el-option value="all_users" label="全部有效租赁方" />
          </el-select>
        </label>
        <label v-if="mode === 'selected_users'">
          用户 ID（每行一个）
          <el-input v-model="userIds" rows="4" type="textarea" />
        </label>
        <label>
          每人数量
          <el-input v-model.number="quantity" type="number" min="1" max="2147483647" required />
        </label>
        <label>
          发放说明
          <el-input v-model="reason" maxlength="500" required type="textarea" />
        </label>
      </fieldset>
      <div class="desk-form-actions">
        <el-button type="primary" native-type="submit" :disabled="busy || !!pending || confirming">
          核对发放信息
        </el-button>
      </div>
    </form>
    <div v-if="confirming" class="record-panel">
      <h2>确认发放</h2>
      <p>
        模板 {{ templateId }} · {{ mode === "all_users" ? "全部有效租赁方" : "指定名单" }} · 每人
        {{ quantity }} 张
      </p>
      <p>{{ reason }}</p>
      <el-button @click="confirming = false">返回修改</el-button>
      <el-button type="primary" :disabled="busy" @click="submit">确认发放</el-button>
    </div>
    <div v-if="pending" class="record-panel">
      <p>请求编号 {{ pending.key }} · 每人 {{ pending.input.quantityPerUser }} 张</p>
      <el-button :disabled="busy" @click="submit">按原请求确认结果</el-button>
      <el-button v-if="editable" @click="newIntent">修改后新建操作</el-button>
    </div>
    <p role="status">{{ notice }}</p>
    <div v-if="result" class="record-panel">
      <h2>发放成功</h2>
      <p>{{ result.targetCount }} 人，共 {{ result.issuedQuantity }} 张</p>
      <p>批次 {{ result.distributionId }} · {{ result.completedAt }}</p>
    </div>
  </section>
</template>
