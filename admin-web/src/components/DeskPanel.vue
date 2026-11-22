<script setup lang="ts">
defineProps<{ title: string; meta?: string }>();
</script>
<template>
  <section class="desk-panel">
    <header class="desk-panel-head">
      <strong>{{ title }}</strong
      ><small v-if="meta">{{ meta }}</small>
    </header>
    <slot />
  </section>
</template>
