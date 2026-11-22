<script setup lang="ts" generic="T extends Record<string, any>">
import DeskTable from "./DeskTable.vue";
import DeskPager from "./DeskPager.vue";
import DeskPanel from "./DeskPanel.vue";
defineProps<{
  title: string;
  columns: readonly string[];
  rows: T[];
  labels: Record<string, string>;
  total: string | number;
  page: number;
  busy: boolean;
  error?: string;
  loading?: boolean;
  rowKey: (row: T) => string;
  cell: (row: T, key: string) => string | number;
}>();
defineEmits<{ turn: [step: number] }>();
</script>
<template>
  <DeskPanel :title="title" :meta="loading || error ? undefined : '共 ' + total + ' 条'">
    <slot name="filters" />
    <DeskTable
      :data="rows"
      :row-key="rowKey"
      :empty-text="loading ? '正在读取…' : error ? '读取失败' : '暂无符合条件的记录'">
      <el-table-column v-for="key in columns" :key="key" :label="labels[key]" min-width="110">
        <template #default="{ row }">
          <span
            :class="{
              'desk-status': ['caseStatus', 'couponStatus', 'resultStatus', 'status'].includes(key),
            }">
            {{ cell(row, key) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="110" fixed="right" :show-overflow-tooltip="false">
        <template #default="{ row }"><slot name="actions" :row="row" /></template>
      </el-table-column>
    </DeskTable>
    <DeskPager :page="page" :total="total" :busy="busy || loading" @turn="$emit('turn', $event)" />
  </DeskPanel>
</template>
