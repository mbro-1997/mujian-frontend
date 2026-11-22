<script setup lang="ts">
import { ElPagination } from "element-plus";
import "element-plus/es/components/pagination/style/css";
defineProps<{ page: number; total: number | string; busy?: boolean; pageSize?: number }>();
defineEmits<{ turn: [step: number] }>();
</script>
<template>
  <nav class="desk-pagination" aria-label="分页">
    <ElPagination
      size="small"
      background
      layout="prev, pager, next"
      prev-text="上一页"
      next-text="下一页"
      :pager-count="5"
      :page-size="pageSize ?? 20"
      :total="Number(total)"
      :current-page="page"
      :disabled="busy"
      @update:current-page="$emit('turn', $event - page)" />
  </nav>
</template>
