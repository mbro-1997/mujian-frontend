<script setup lang="ts">
import DeskTable from '../../components/DeskTable.vue';
import MetricStrip from "../../components/MetricStrip.vue";
import DeskPanel from "../../components/DeskPanel.vue";
import { displayTime } from "../verification/display-time";
import { errorText } from "../../api/http";
defineProps<{
  data: Record<string, any> | null;
  message: string;
  cases: boolean;
}>();
defineEmits<{ retry: [] }>();
const metrics = {
  pending: "待处理案件",
  waitingUser: "等待用户",
  waitingFactory: "等待工厂",
  dueToday: "今日到期",
};
const states: Record<string, string> = {
  pending: "待处理",
  waiting_user: "等待用户",
  waiting_factory: "等待工厂",
  closed: "已结案",
  cancelled: "已撤销",
};
const sourceStates: Record<string, string> = {
  pending: "待处理",
  submitted: "已提交",
  approved: "已通过",
  rejected: "已驳回",
  processing: "处理中",
  resolved: "已解决",
  pending_review: "待审核",
  open: "已登记",
};
</script>
<template>
  <div class="desk">
    <div class="desk-head">
      <div>
        <h1>运营总览</h1>
        <p>人工事项按案件统计，来源业务状态独立展示。</p>
      </div>
      <router-link v-if="cases" class="desk-link" to="/workbench/cases">进入统一案件</router-link>
    </div>
    <p v-if="message" role="alert">
      {{ message }}
      <el-button @click="$emit('retry')">重试</el-button>
    </p>
    <template v-if="data">
      <MetricStrip
        :items="
          Object.entries(metrics).map(([key, label]) => ({
            label,
            value: data![key],
          }))
        " />
      <DeskPanel title="需要关注" :meta="'按案件去重 · ' + displayTime(data.asOf)">
        <div class="desk-scroll">
          <DeskTable :data="data.attentionItems" empty-text="暂无需要关注的案件">
            <el-table-column label="事项" min-width="94" prop="title" />
            <el-table-column label="来源模块 / 对象" min-width="138">
              <template #default="{ row: r }">{{ r.sourceModule }} · {{ r.sourceId || '未关联' }}</template>
            </el-table-column>
            <el-table-column label="案件状态" min-width="94">
              <template #default="{ row: r }">
                <span class="desk-status" :class="r.caseStatus">
                  {{ states[r.caseStatus] || r.caseStatus }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="来源业务状态" min-width="138">
              <template #default="{ row: r }">
                {{ sourceStates[r.sourceStatus] || r.sourceStatus || '未提供' }}
              </template>
            </el-table-column>
            <el-table-column label="截止日期" min-width="138">
              <template #default="{ row: r }">{{ displayTime(r.deadlineAt) || '未设置' }}</template>
            </el-table-column>
          </DeskTable>
        </div>
      </DeskPanel>
      <DeskPanel title="渠道自动预警 · 不计入人工案件数量">
        <div class="desk-body">
          <template v-if="data.channelAlerts.length">
            <p v-for="a in data.channelAlerts" :key="a.reasonCode">
              {{ errorText[a.reasonCode] || a.reasonCode }} · {{ a.count }} 条
            </p>
          </template>
          <span v-else>当前无渠道预警</span>
        </div>
      </DeskPanel>
    </template>
    <p v-else-if="!message" role="status">正在读取运营总览…</p>
  </div>
</template>
