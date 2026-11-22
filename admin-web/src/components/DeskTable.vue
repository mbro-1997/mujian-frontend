<script setup lang="ts" generic="T extends Record<string, any>">
// Element Plus applies this to value columns. Action columns opt out explicitly.
defineProps<{ data: T[]; emptyText: string }>();
</script>

<template>
  <el-table
    :data="data"
    :empty-text="emptyText"
    class="desk-data-table"
    show-overflow-tooltip
    :tooltip-options="{ placement: 'bottom-start', popperClass: 'desk-overflow-tip' }">
    <slot />
  </el-table>
</template>
