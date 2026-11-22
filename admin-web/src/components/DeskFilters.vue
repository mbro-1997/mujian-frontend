<script setup lang="ts">
defineProps<{
  busy?: boolean;
  submitLabel?: string;
}>();

defineEmits<{
  search: [];
  reset: [];
}>();
</script>

<template>
  <el-form class="desk-query" label-suffix="：" @submit.prevent="!busy && $emit('search')">
    <slot />
    <div class="desk-query-actions">
      <el-button type="primary" native-type="submit" :disabled="busy">{{ submitLabel || '查询' }}</el-button>
      <el-button native-type="button" :disabled="busy" @click="$emit('reset')">重置</el-button>
    </div>
  </el-form>
</template>
