<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";
import type { ReviewRow, ReviewPendingCounts } from "../../api/prop-types";
import { names, time } from "../../api/props";
import DeskPanel from "../../components/DeskPanel.vue";
import MetricStrip from "../../components/MetricStrip.vue";
const props = defineProps<{
  rows: ReviewRow[];
  counts: ReviewPendingCounts | null;
  busy: boolean;
  message: string;
  page: number;
  total: string;
}>();
defineEmits<{ search: []; reset: []; turn: [number]; open: [ReviewRow] }>();
const status = defineModel<string>("status", { required: true }),
  category = defineModel<string>("category", { required: true }),
  factory = defineModel<string>("factory", { required: true }),
  asset = defineModel<string>("asset", { required: true }),
  keyword = defineModel<string>("keyword", { required: true }),
  source = defineModel<string>("source", { required: true }),
  factoryId = defineModel<string>("factoryId", { required: true });
const metrics = {
  total: "待审核",
  sku: "SKU 资料",
  inventory: "库存调整",
  skuStatus: "上下架",
};
function categoryName(r: ReviewRow) {
  if (r.sourceType !== "sku_audit") return "库存调整";
  return ["create", "update"].includes(r.actionType) ? "SKU 资料" : "上下架 / 状态";
}
function summary(r: ReviewRow) {
  const parts = [names[r.actionType] || r.actionType];
  if (r.initialQuantity != null) parts.push("初始 " + r.initialQuantity + " 件");
  if (r.quantity != null) parts.push(r.quantity + " 件");
  if (r.quantityDelta != null) parts.push("数量变化 " + r.quantityDelta + " 件");
  if (r.applyRemark) parts.push(r.applyRemark);
  return parts.join(" · ");
}
</script>
<template>
  <div class="desk">
    <MetricStrip
      :items="
        Object.entries(metrics).map(([key, label]) => ({
          label,
          value: props.counts?.[key as keyof ReviewPendingCounts],
        }))
      " />
    <DeskPanel title="审核申请" :meta="counts && !message ? '共 ' + total + ' 条' : undefined">
      <DeskFilters :busy="busy" @search="$emit('search')" @reset="$emit('reset')">
        <el-form-item label="审核类型">
          <el-select
            v-model="category"
            aria-label="审核类型"
            :empty-values="[null, undefined]"
            placeholder="全部"
            popper-class="desk-select-menu">
            <el-option value="" label="全部" />
            <el-option value="sku" label="SKU 资料" />
            <el-option value="inventory" label="库存调整" />
            <el-option value="sku_status" label="上下架 / 状态" />
          </el-select>
        </el-form-item>
        <el-form-item label="审核状态">
          <el-select
            v-model="status"
            aria-label="审核状态"
            :empty-values="[null, undefined]"
            placeholder="请选择"
            popper-class="desk-select-menu">
            <el-option value="all" label="全部" />
            <el-option
              v-for="s in ['pending', 'approved', 'rejected', 'cancelled']"
              :value="s"
              :label="names[s]" />
          </el-select>
        </el-form-item>
        <el-form-item label="工厂名称">
          <el-input v-model.trim="factory" aria-label="工厂名称" placeholder="工厂名称" clearable />
        </el-form-item>
        <el-form-item label="资产类型">
          <el-select
            v-model="asset"
            aria-label="资产类型"
            :empty-values="[null, undefined]"
            placeholder="A / B 类"
            popper-class="desk-select-menu">
            <el-option value="" label="A / B 类" />
            <el-option value="A_ASSET" label="A 类" />
            <el-option value="B_CONSUMABLE" label="B 类" />
          </el-select>
        </el-form-item>
        <el-form-item label="SKU 或道具名称">
          <el-input
            v-model.trim="keyword"
            aria-label="SKU 或道具名称"
            placeholder="SKU / 道具名称"
            maxlength="128"
            clearable />
        </el-form-item>
        <el-form-item label="申请来源">
          <el-select
            v-model="source"
            aria-label="申请来源"
            :empty-values="[null, undefined]"
            placeholder="全部申请来源"
            popper-class="desk-select-menu">
            <el-option value="" label="全部申请来源" />
            <el-option
              v-for="s in ['sku_audit', 'sn_adjustment', 'stock_adjustment']"
              :value="s"
              :label="names[s]" />
          </el-select>
        </el-form-item>
        <el-form-item label="工厂编号">
          <el-input v-model.trim="factoryId" aria-label="工厂编号" placeholder="工厂编号" clearable />
        </el-form-item>
      </DeskFilters>
      <div class="desk-scroll">
        <DeskTable
          :data="rows"
          :empty-text="busy ? '正在读取…' : message ? '读取失败' : '暂无符合条件的审核申请'">
          <el-table-column label="申请编号" min-width="142" prop="id" />
          <el-table-column label="审核类型" min-width="94">
            <template #default="{ row: r }">{{ categoryName(r) }}</template>
          </el-table-column>
          <el-table-column label="道具 / SKU" min-width="140">
            <template #default="{ row: r }">
              {{ r.propName }}
              <small>{{ r.skuCode }}</small>
            </template>
          </el-table-column>
          <el-table-column label="工厂" min-width="94" prop="factoryName" />
          <el-table-column label="资产类型" min-width="94">
            <template #default="{ row: r }">{{ r.assetType === "A_ASSET" ? "A 类" : "B 类" }}</template>
          </el-table-column>
          <el-table-column label="申请内容" min-width="145">
            <template #default="{ row: r }">{{ summary(r) }}</template>
          </el-table-column>
          <el-table-column label="提交时间" min-width="138">
            <template #default="{ row: r }">{{ time(r.submittedAt) }}</template>
          </el-table-column>
          <el-table-column label="状态" min-width="94">
            <template #default="{ row: r }">
              <span class="desk-status" :class="r.auditStatus">{{ names[r.auditStatus] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
            <template #default="{ row: r }">
              <el-button :disabled="busy" @click="$emit('open', r)" size="small" link class="desk-row-link">
                详情
              </el-button>
            </template>
          </el-table-column>
        </DeskTable>
      </div>

      <DeskPager :page="page" :total="total" :busy="busy" @turn="$emit('turn', $event)" />
    </DeskPanel>
  </div>
</template>
