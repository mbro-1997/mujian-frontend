<script setup lang="ts">
import { ElConfigProvider } from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
</script>
<template><ElConfigProvider :locale="zhCn"><router-view /></ElConfigProvider></template>
<style>
:root {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC",
    "Microsoft YaHei", Arial, sans-serif;
  color: #111827;
  background: #f5f6f7;
  --el-color-primary: #111827;
  --el-color-primary-light-3: #4b5563;
  --el-color-primary-light-5: #6b7280;
  --el-color-primary-light-7: #9ca3af;
  --el-color-primary-light-9: #f3f4f6;
  --el-color-primary-dark-2: #030712;
}
body {
  margin: 0;
}
* {
  box-sizing: border-box;
}
h1 {
  font-size: 22px;
}
a {
  color: inherit;
  text-decoration: none;
}
.muted {
  color: #6b7280;
  line-height: 1.8;
}
.page {
  padding: 18px 20px 20px;
}
.notice {
  margin-bottom: 20px;
}
.brand-mark {
  width: 30px;
  height: 30px;
  color: #111827;
  background: #ffe100;
  border-radius: 6px;
  font-size: 13px;
  line-height: 30px;
  text-align: center;
}
.el-button--primary {
  --el-button-bg-color: #ffe100;
  --el-button-text-color: #111827;
  --el-button-border-color: #ffe100;
  --el-button-hover-bg-color: #ffeb55;
  --el-button-hover-text-color: #111827;
  --el-button-hover-border-color: #ffe100;
  --el-button-disabled-bg-color: #fff5ad;
  --el-button-disabled-border-color: #fff5ad;
  --el-button-disabled-text-color: #8c8251;
}
.el-button:focus-visible,
a:focus-visible {
  outline: 2px solid #9d8700;
  outline-offset: 3px;
}
@media (max-width: 600px) {
  .page {
    padding: 16px;
  }
}
</style>
