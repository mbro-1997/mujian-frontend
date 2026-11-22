<script setup lang="ts">
import { ElImage, ElTag } from "element-plus";
import "element-plus/es/components/image/style/css";
import "element-plus/es/components/tag/style/css";
import type { Qr } from "../../api/prop-types";
import { names } from "../../api/props";
defineProps<{ qr: Qr; manage: boolean }>();
defineEmits<{ register: []; issue: []; refresh: []; retry: [] }>();
</script>

<template>
  <section class="qr-record">
    <header><strong>{{ qr.propName }}</strong><ElTag size="small" :type="qr.status === 'bound' ? 'success' : 'info'">{{ qr.status === 'bound' ? '已绑定' : '已停用' }}</ElTag></header>
    <div class="qr-content">
      <div v-if="qr.status === 'bound'" class="qr-preview">
        <ElImage v-if="qr.imageStatus === 'ready' && qr.image" :src="qr.image.url" alt="微信小程序码" fit="contain">
          <template #error>标签图片加载失败</template>
        </ElImage>
        <span v-else>{{ qr.imageStatus === 'failed' ? '图片生成失败' : qr.imageStatus === 'ready' ? '暂无可用图片' : '标签图片生成中…' }}</span>
      </div>
      <dl>
        <dt>SKU 编码</dt><dd>{{ qr.skuCode }}</dd>
        <template v-if="qr.snCode"><dt>SN 编号</dt><dd>{{ qr.snCode }}</dd></template>
        <dt>标签编码</dt><dd>{{ qr.qrCode }}</dd>
        <template v-if="qr.instanceStatus"><dt>实物状态</dt><dd>{{ names[qr.instanceStatus] }}</dd></template>
      </dl>
    </div>
    <footer>
      <el-button @click="$emit('refresh')">刷新码状态</el-button>
      <template v-if="qr.status === 'bound'">
        <el-button v-if="qr.canRetryImage" @click="$emit('retry')">重试图片</el-button>
        <el-button v-if="manage" @click="$emit('register')">登记二维码异常</el-button>
        <el-button v-if="qr.imageStatus === 'ready' && qr.image" type="primary" tag="a" :href="qr.image.url" target="_blank" rel="noopener">查看 / 下载原标签</el-button>
      </template>
      <el-button v-else-if="manage" type="primary" @click="$emit('issue')">独立正常发码</el-button>
    </footer>
  </section>
</template>

<style scoped>
.qr-record header, .qr-record footer { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
.qr-record header strong { font-size:16px; overflow-wrap:anywhere; }
.qr-content { display:flex; align-items:center; flex-wrap:wrap; gap:20px; margin:16px 0 20px; }
.qr-preview { display:grid; place-items:center; width:148px; height:148px; border:1px solid #e3e7ec; border-radius:6px; background:#fff; }
.qr-preview .el-image { width:134px; height:134px; display:grid; place-items:center; }
.qr-content dl { flex:1 1 225px; min-width:0; margin:0; display:grid; grid-template-columns:auto minmax(0,1fr); gap:10px 12px; font-size:13px; line-height:1.5; }
.qr-content dt { color:#596574; }
.qr-content dd { margin:0; color:#202938; overflow-wrap:anywhere; }
.qr-record footer { justify-content:flex-end; padding-top:14px; border-top:1px solid #e3e7ec; }
.qr-record footer .el-button { margin:0; text-decoration:none; }
</style>
