<script setup lang="ts">
import { ElDatePicker } from "element-plus";
import "element-plus/es/components/date-picker/style/css";
withDefaults(defineProps<{ start: string; end: string; prefix?: string }>(), {
  prefix: "",
});
const emit = defineEmits<{
  "update:start": [value: string];
  "update:end": [value: string];
}>();
</script>

<template>
  <el-form-item
    v-for="side in ['start', 'end'] as const"
    :key="side"
    :label="prefix + (side === 'start' ? '开始日期' : '结束日期')"
  >
    <ElDatePicker
      :model-value="side === 'start' ? start : end"
      type="date"
      value-format="YYYY-MM-DD"
      placeholder="选择日期"
      popper-class="asset-select-menu"
      @update:model-value="
        (value) =>
          side === 'start'
            ? emit('update:start', value || '')
            : emit('update:end', value || '')
      "
    />
  </el-form-item>
</template>
