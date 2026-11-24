<script setup lang="ts">
import { ElImage } from "element-plus";
import "element-plus/es/components/image/style/css";
import type { ImageRead, ImageLocator } from "../../api/prop-types";
import { propImageContentUrl } from "../../api/props";

defineProps<{ images: ImageRead[]; canView: boolean }>();
defineEmits<{ view: [locator: ImageLocator] }>();
</script>

<template>
  <p v-if="!images.length" class="asset-note">暂无图片</p>
  <div v-else class="asset-images">
    <figure v-for="({ locator, preview }, index) in images" :key="locator.index">
      <button
        v-if="canView"
        type="button"
        :aria-label="'查看图片 ' + (index + 1) + ' 原图'"
        @click="$emit('view', locator)"
      >
        <ElImage v-if="preview" :src="propImageContentUrl(locator)" :alt="'道具图片 ' + (index + 1)" fit="contain">
          <template #placeholder>加载中…</template>
          <template #error>预览加载失败</template>
        </ElImage>
        <span v-else>预览暂不可用</span>
      </button>
      <span v-else class="asset-image-restricted">无图片查看权限</span>
      <figcaption>图片 {{ index + 1 }}</figcaption>
    </figure>
  </div>
</template>
