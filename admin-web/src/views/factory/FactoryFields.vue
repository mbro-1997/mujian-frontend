<script setup lang="ts">
import type {
  MaskedFields,
  MaterialLocator,
  SensitiveResult,
} from "../../api/factory-types";
defineProps<{ fields: MaskedFields; sensitive?: SensitiveResult }>();
const emit = defineEmits<{ view: [locator: MaterialLocator] }>();
</script>
<template>
  <dl class="factory-fields">
    <dt>工厂名称</dt>
    <dd>{{ fields.factoryName }}</dd>
    <dt>统一社会信用代码</dt>
    <dd>{{ fields.unifiedSocialCreditCode }}</dd>
    <dt>联系人</dt>
    <dd>{{ sensitive?.contactName ?? fields.contactNameMasked }}</dd>
    <dt>联系电话</dt>
    <dd>{{ sensitive?.contactPhone ?? fields.contactPhoneMasked }}</dd>
    <dt>工厂地址</dt>
    <dd>{{ fields.factoryAddress }}</dd>
    <dt>主营业务</dt>
    <dd>{{ fields.mainBusiness || "未填写" }}</dd>
    <dt>工人数</dt>
    <dd>{{ fields.workerCount }}</dd>
    <dt>擅长品类</dt>
    <dd>{{ fields.specialtyCategoryNames.join("、") }}</dd>
    <dt>备注</dt>
    <dd>{{ fields.remark || "未填写" }}</dd>
    <dt>资质及照片</dt>
    <dd>
      <el-button @click="emit('view', fields.factoryAvatar)">头像</el-button
      ><el-button @click="emit('view', fields.businessLicense)"
        >营业执照</el-button
      ><el-button
        v-for="(p, i) in fields.factoryPhotos"
        :key="i"
        @click="emit('view', p)"
        >实景 {{ i + 1 }}</el-button
      >
    </dd>
    <dt>服务案例</dt>
    <dd>
      <article v-for="(c, i) in fields.cases" :key="i">
        <strong>{{ c.title }}</strong>
        <p>{{ c.description }}</p>
        <el-button v-for="(p, j) in c.images" :key="j" @click="emit('view', p)"
          >案例图 {{ j + 1 }}</el-button
        >
      </article>
      <span v-if="!fields.cases.length">未填写案例</span>
    </dd>
  </dl>
</template>
<style scoped>
.factory-fields {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  font-size: 14px;
  line-height: 1.65;
  gap: 16px 12px;
}
.factory-fields dt {
  color: #777;
}
.factory-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.factory-fields article {
  padding: 12px;
  background: #f7f8fa;
  margin-bottom: 12px;
}
.factory-fields .el-button {
  margin: 4px;
}
</style>
