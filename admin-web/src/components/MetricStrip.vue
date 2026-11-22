<script setup lang="ts">
defineProps<{ items: { label: string; value?: string }[] }>();
</script>
<template>
  <dl class="metric-strip">
    <div v-for="item in items" :key="item.label">
      <dt>{{ item.label }}</dt>
      <dd :class="{ 'metric-note': item.value == null || ['未提供', '读取失败'].includes(item.value) }">
        {{ item.value ?? "—" }}
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.metric-strip dd.metric-note {
  color: #697586;
  font-size: 13px;
  line-height: 24px;
  font-weight: 500;
}
</style>
