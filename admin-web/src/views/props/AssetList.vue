<script setup lang="ts">
import type { OwnedSku, Options } from "../../api/prop-types";
import { names } from "../../api/props";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";

defineProps<{
  rows: OwnedSku[];
  options: Options | null;
  styles: string[];
  busy: boolean;
  error: string;
  page: number;
  total: string;
}>();
const factory = defineModel<string>("factory", { required: true });
const keyword = defineModel<string>("keyword", { required: true });
const assetType = defineModel<string>("assetType", { required: true });
const status = defineModel<string>("status", { required: true });
const type = defineModel<string>("type", { required: true });
const factoryId = defineModel<string>("factoryId", { required: true });
defineEmits<{
  search: [];
  reset: [];
  turn: [step: number];
  open: [row: OwnedSku];
  rent: [row?: OwnedSku];
  "update:styles": [codes: string[]];
}>();
</script>
<template>
  <section class="asset-panel asset-register">
    <div class="asset-panel-head">
      <b>道具资产</b>
      <el-button size="small" @click="$emit('rent')">全部租期</el-button>
    </div>
    <el-form
      class="asset-query-grid"
      aria-label="资产筛选"
      label-suffix="："
      label-width="74px"
      @submit.prevent="$emit('search')">
      <el-form-item label="工厂">
        <el-input v-model.trim="factory" maxlength="128" clearable placeholder="请输入工厂名称" />
      </el-form-item>
      <el-form-item label="SKU">
        <el-input v-model.trim="keyword" maxlength="128" clearable placeholder="请输入 SKU 或 SN" />
      </el-form-item>
      <el-form-item label="资产类型">
        <el-select v-model="assetType" clearable placeholder="全部" popper-class="asset-select-menu">
          <el-option label="A 类" value="A_ASSET" />
          <el-option label="B 类" value="B_CONSUMABLE" />
        </el-select>
      </el-form-item>
      <el-form-item label="SKU 状态">
        <el-select v-model="status" clearable placeholder="全部" popper-class="asset-select-menu">
          <el-option
            v-for="s in ['draft', 'online', 'offline', 'disabled']"
            :key="s"
            :value="s"
            :label="names[s]" />
        </el-select>
      </el-form-item>
      <el-form-item label="风格">
        <el-select
          :model-value="styles"
          @update:model-value="$emit('update:styles', $event)"
          multiple
          :multiple-limit="3"
          collapse-tags
          collapse-tags-tooltip
          clearable
          placeholder="全部风格"
          popper-class="asset-select-menu">
          <el-option
            v-for="o in options?.styles"
            :key="o.code"
            :label="o.label"
            :value="o.code"
            :disabled="!styles.includes(o.code) && styles.length >= 3" />
        </el-select>
      </el-form-item>
      <el-form-item label="道具类别">
        <el-select v-model="type" clearable placeholder="全部" popper-class="asset-select-menu">
          <el-option v-for="o in options?.types" :key="o.code" :label="o.label" :value="o.code" />
        </el-select>
      </el-form-item>
      <el-form-item label="工厂编号">
        <el-input v-model.trim="factoryId" clearable placeholder="请输入工厂编号" />
      </el-form-item>
      <div class="asset-query-action">
        <el-button class="asset-submit" type="primary" native-type="submit" :loading="busy">查询</el-button>
        <el-button :disabled="busy" @click="$emit('reset')">重置</el-button>
      </div>
    </el-form>
    <DeskTable
      row-key="id"
      :data="rows"
      class="asset-register-table"
      :empty-text="busy ? '正在读取资产…' : error ? '资产读取失败' : '暂无符合条件的资产'">
      <el-table-column prop="skuCode" label="SKU" min-width="140" />
      <el-table-column prop="fields.propName" label="道具" min-width="98" />
      <el-table-column prop="factoryName" label="工厂" min-width="88" />
      <el-table-column label="类型" width="62">
        <template #default="{ row }">{{ row.assetType === "A_ASSET" ? "A 类" : "B 类" }}</template>
      </el-table-column>
      <el-table-column label="SKU 状态" width="83">
        <template #default="{ row }">{{ names[row.skuStatus] }}</template>
      </el-table-column>
      <el-table-column label="库存总量" min-width="84">
        <template #default="{ row }">
          {{ row.inventorySummary ? row.inventorySummary.totalQuantity + " 件" : "尚未形成库存" }}
        </template>
      </el-table-column>
      <el-table-column label="当前可用" min-width="84">
        <template #default="{ row }">
          {{ row.inventorySummary ? row.inventorySummary.availableQuantity + " 件" : "—" }}
        </template>
      </el-table-column>
      <el-table-column label="操作" :show-overflow-tooltip="false" width="140" fixed="right">
        <template #default="{ row }">
          <div class="asset-row-actions">
            <el-button
              type="primary"
              link
              class="desk-row-link"
              size="small"
              :disabled="busy"
              @click="$emit('open', row)">
              详情
            </el-button>
            <el-button size="small" :disabled="busy" @click="$emit('rent', row)">租期</el-button>
          </div>
        </template>
      </el-table-column>
    </DeskTable>
    <DeskPager :page="page" :total="total" :busy="busy" @turn="$emit('turn', $event)" />
  </section>
</template>
