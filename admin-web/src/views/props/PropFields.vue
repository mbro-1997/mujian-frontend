<script setup lang="ts">
import type { SkuRead, ImageLocator, Options } from "../../api/prop-types";
import { money, propImageContentUrl } from "../../api/props";
const p = defineProps<{ fields: SkuRead; options: Options | null; grid?: boolean; hideImages?: boolean }>();
const emit = defineEmits<{ view: [locator: ImageLocator] }>();
const label = (group: keyof Options, code: string) =>
  p.options?.[group].find((o) => o.code === code)?.label || code;
</script>
<template>
<dl class="fields" :class="{grid}">
    <div><dt>名称</dt>
    <dd>{{ fields.propName }}</dd></div>
    <div><dt>类型 / 风格</dt>
    <dd>
      {{ fields.typeLabel }} /
      {{ fields.styleLabels.join("、") }}
    </dd></div>
    <div><dt>尺寸描述</dt>
    <dd>{{ fields.sizeDesc }}</dd></div>
    <div><dt>长 × 宽 × 高</dt>
    <dd>
      {{ fields.lengthCm }} × {{ fields.widthCm }} × {{ fields.heightCm }} cm
    </dd></div>
    <div><dt>材质 / 阻燃</dt>
    <dd>
      {{ fields.materialDesc }} /
      {{ fields.fireResistantLabel }}
    </dd></div>
    <div><dt>重量</dt>
    <dd>{{ fields.weightKg }} kg</dd></div>
    <div><dt>包装体积系数</dt><dd>{{ fields.packagingFactorBps == null ? "待补充" : fields.packagingFactorBps / 10000 }}</dd></div>
    <div><dt>运输建议</dt>
    <dd>{{ fields.transportSuggestion }}</dd></div>
    <div><dt>日租金 / 押金</dt>
    <dd>
      ¥{{ money(fields.dailyRentPriceFen) }} / ¥{{
        money(fields.depositAmountFen)
      }}
    </dd></div>
    <div><dt>备注</dt>
    <dd>{{ fields.remark || "—" }}</dd></div>
    <div v-if="!hideImages"><dt>图片</dt>
    <dd class="images">
      <el-button v-for="(image, i) in fields.images" :key="i" @click="emit('view', image.locator)"><img
          v-if="image.preview"
          :src="propImageContentUrl(image.locator)"
          :alt="'图片' + (i + 1)"
        /><span v-else>查看原图 {{ i + 1 }}</span></el-button>
    </dd></div>
  </dl>
</template>
<style scoped>
.fields {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  gap: 16px;
  font-size: 14px;
  line-height: 1.6;
}
.fields dt {
  color: #777;
}
.fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.images {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.images button {
  width: 120px;
  height: 100px;
  background: #f3f4f6;
  border: 1px solid #ddd;
  cursor: pointer;
}
.images img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fields>div{display:contents}
.fields.grid{grid-template-columns:repeat(3,minmax(0,1fr));font-size:12px}
.fields.grid>div{display:block}.fields.grid dt{font-size:10px}.fields.grid dd{margin-top:4px}.fields.grid>div:last-child{grid-column:1/-1}
@media(max-width:800px){.fields.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
