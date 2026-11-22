<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api/http";
import { me } from "../session/state";
import { useSessionView } from "../session/view";
import MetricStrip from "./MetricStrip.vue";

type Metric = [label: string, criteria?: string];
type Queue = [endpoint: string, metrics: Metric[]];
const queues: Record<string, Queue> = {
  "/workbench/cases": [
    "dashboard",
    [
      ["待处理", "pending"],
      ["等待用户", "waitingUser"],
      ["等待工厂", "waitingFactory"],
      ["今日到期", "dueToday"],
    ],
  ],
  "/factory/profiles": [
    "factories",
    [
      ["正常工厂", "status=active"],
      ["暂停服务", "status=suspended"],
      ["收付通正常"],
      ["今日新增", "createdToday"],
    ],
  ],
  "/accounts/users": ["users", [["租赁方用户"], ["正常账号", "status=active"], ["受限账号"], ["今日新增"]]],
  "/trading/merchants": [
    "factory-wechat-accounts",
    [
      ["已开通", "accountStatus=active"],
      ["审核中", "accountStatus=reviewing"],
      ["需补充资料", "accountStatus=need_action"],
      ["已冻结", "accountStatus=frozen"],
    ],
  ],
  "/fulfillment/issues": ["issues", [["待处理"], ["暂停履约"], ["继续履约留证"], ["今日到期"]]],
  "/fulfillment/risks": [
    "fulfillment-risks",
    [["未处理风险", "status=pending"], ["受影响后续订单"], ["涉及 A 类 SN"], ["今日已解除"]],
  ],
  "/fulfillment/returns": [
    "return-checks",
    [
      ["12 小时预警", "status=warning"],
      ["距自动关闭不足 24 小时"],
      ["索赔已发起", "status=claim_submitted"],
      ["今日自动关闭"],
    ],
  ],
  "/fulfillment/expenses": [
    "transport-expenses",
    [
      ["已提交待审核", "status=submitted"],
      ["超预算记录", "overBudget=true"],
      ["已退回补证", "status=returned"],
      ["今日核准"],
    ],
  ],
  "/fulfillment/claims": [
    "claims",
    [
      ["已提交待审核", "status=submitted"],
      ["要求补证", "status=supplement_required"],
      ["等待用户确认", "status=waiting_user_response"],
      ["用户已申诉", "status=user_appealed"],
    ],
  ],
  "/fulfillment/receivables": [
    "compensation-receivables",
    [["待缴笔数", "status=pending"], ["待缴金额"], ["支付中", "status=paying"], ["今日缴清"]],
  ],
  "/system/audits": [
    "system/audits",
    [
      ["今日高风险操作"],
      ["执行成功", "resultStatus=success"],
      ["执行失败", "resultStatus=failed"],
      ["异常登录"],
    ],
  ],
};
const route = useRoute(),
  queue = computed(() => queues[route.path]);
const result = ref<Record<string, string>>({});
const session = useSessionView(() => {
  result.value = {};
});
watch(
  queue,
  async (config, _, onCleanup) => {
    let active = true;
    onCleanup(() => {
      active = false;
    });
    result.value = {};
    if (!config) return;
    const owner = session.capture(),
      [endpoint, metrics] = config;
    const current = () => active && session.current(owner);
    if (endpoint === "dashboard") {
      if (!me.value?.permissions.includes("admin:dashboard:view")) return;
      try {
        const data = await api<Record<string, string>>("/api/admin/dashboard");
        if (current()) result.value = data;
      } catch {
        if (current()) result.value = {};
      }
      return;
    }
    // total 由服务端在同一业务集合中计数。未开放的统计保留缺值。
    await Promise.all(
      metrics.map(async ([, criteria]) => {
        if (!criteria) return;
        try {
          const params = new URLSearchParams(criteria);
          if (criteria === "createdToday") {
            const beijingDay = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
            params.delete(criteria);
            params.set("from", beijingDay + "T00:00:00.000+08:00");
          }
          params.set("page", "1");
          params.set("pageSize", "1");
          const data = await api<{ total: string }>("/api/admin/" + endpoint + "?" + params);
          if (current()) result.value[criteria] = data.total;
        } catch {
          if (current()) result.value[criteria] = "读取失败";
        }
      })
    );
  },
  { immediate: true }
);
</script>
<template>
  <MetricStrip
    v-if="queue"
    :items="queue[1].map(([label, key]) => ({ label, value: key ? result[key] : '未提供' }))" />
</template>
