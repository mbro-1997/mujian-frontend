<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";
import DeskPanel from "../../components/DeskPanel.vue";
type Row = Record<string, any>;
defineProps<{
  rows: Row[];
  detail: Row | null;
  filters: Row;
  page: number;
  total: string;
  loading: boolean;
  message: string;
  manage: boolean;
  locked: boolean;
}>();
defineEmits<{
  search: [];
  reset: [];
  turn: [number];
  inspect: [Row, boolean];
  back: [];
  create: [];
  copy: [];
  edit: [];
  publish: [];
}>();
const scope: Record<string, string> = {
  all_user: "全部用户",
  demander: "租赁方",
  supplier: "工厂方",
  admin: "管理员",
};
const status: Record<string, string> = {
  active: "已发布",
  draft: "草稿",
  archived: "已归档",
};
const effective = (r: Row) => (r.status === "draft" ? "未生效" : "未提供");
function readableBody(row: Row) {
  if (row.contentType !== "html") return row.contentText || row.contentUrl;
  // 只提取文字。来自规则文档的 HTML 不进入活动 DOM。
  const holder = document.createElement("template");
  holder.innerHTML = row.contentText || "";
  holder.content.querySelectorAll("script,style,template").forEach((node) => node.remove());
  holder.content.querySelectorAll("p,li,h1,h2,h3,h4,section,div,br,tr").forEach((node) => node.after("\n"));
  return holder.content.textContent?.trim();
}
</script>
<template>
  <div class="desk">
    <div class="desk-head">
      <div>
        <h1>{{ detail ? "规则版本详情" : "平台规则文档管理" }}</h1>
        <p>
          {{
            detail
              ? "按业务发生时的版本保留正文和确认要求。"
              : "已发布版本保留原正文，重大更新可要求用户重新确认。"
          }}
        </p>
      </div>
      <div>
        <el-button v-if="detail" class="desk-btn" @click="$emit('back')">返回版本列表</el-button>
        <el-button
          v-if="manage && !detail"
          class="desk-btn primary"
          :disabled="locked"
          @click="$emit('create')"
          type="primary">
          新增规则版本
        </el-button>
        <el-button
          v-else-if="manage && detail?.status !== 'draft'"
          class="desk-btn primary"
          :disabled="locked"
          @click="$emit('copy')"
          type="primary">
          基于此版本新建草稿
        </el-button>
      </div>
    </div>
    <p v-if="message" role="status">
      {{ message }}
      <el-button v-if="!detail" class="desk-btn" @click="$emit('search')">重新读取</el-button>
    </p>
    <template v-if="!detail">
      <DeskPanel title="规则文档" :meta="loading || message ? undefined : '共 ' + total + ' 个版本'">
        <DeskFilters :busy="loading" @search="$emit('search')" @reset="$emit('reset')">
          <el-form-item label="适用范围">
            <el-select
              disabled
              aria-label="适用范围"
              title="当前接口未提供适用范围筛选"
              :empty-values="[null, undefined]"
              placeholder="全部"
              popper-class="desk-select-menu"
              model-value="">
              <el-option value="" label="全部" />
            </el-select>
          </el-form-item>
          <el-form-item label="发布状态">
            <el-select
              v-model="filters.status"
              aria-label="发布状态"
              :empty-values="[null, undefined]"
              placeholder="全部"
              popper-class="desk-select-menu">
              <el-option value="" label="全部" />
              <el-option v-for="(label, key) in status" :value="key" :label="label" />
            </el-select>
          </el-form-item>
          <el-form-item label="强制重确认">
            <el-select
              disabled
              aria-label="强制重确认"
              title="当前接口未提供强制重确认筛选"
              :empty-values="[null, undefined]"
              placeholder="全部"
              popper-class="desk-select-menu"
              model-value="">
              <el-option value="" label="全部" />
            </el-select>
          </el-form-item>
          <el-form-item label="规则编码">
            <el-input
              v-model.trim="filters.ruleCode"
              placeholder="规则编码"
              aria-label="规则编码"
              maxlength="64"
              clearable />
          </el-form-item>
        </DeskFilters>
        <div class="desk-scroll">
          <DeskTable
            :data="rows"
            :empty-text="loading ? '正在读取…' : message ? '读取失败' : '暂无符合条件的规则版本'">
            <el-table-column label="规则编码" min-width="145" prop="ruleCode" />
            <el-table-column label="规则名称" min-width="158" prop="ruleTitle" />
            <el-table-column label="当前版本" min-width="94" prop="ruleVersion" />
            <el-table-column label="适用范围" min-width="94">
              <template #default="{ row: r }">{{ scope[r.ruleScope] }}</template>
            </el-table-column>
            <el-table-column label="状态" min-width="94">
              <template #default="{ row: r }">
                <span class="desk-status" :class="r.status">{{ status[r.status] }}</span>
              </template>
            </el-table-column>
            <el-table-column label="强制重确认" min-width="94">
              <template #default="{ row: r }">{{ r.forceReaccept ? "是" : "否" }}</template>
            </el-table-column>
            <el-table-column label="生效时间" min-width="130">
              <template #default="{ row: r }">{{ effective(r) }}</template>
            </el-table-column>
            <el-table-column label="最近更新人" min-width="94">
              <template #default>未提供</template>
            </el-table-column>
            <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
              <template #default="{ row: r }">
                <el-button
                  :disabled="locked"
                  @click="$emit('inspect', r, manage && r.status === 'draft')"
                  size="small"
                  plain>
                  {{ manage && r.status === "draft" ? "编辑" : "版本" }}
                </el-button>
              </template>
            </el-table-column>
          </DeskTable>
        </div>

        <DeskPager :page="page" :total="total" :busy="loading" @turn="$emit('turn', $event)" />
      </DeskPanel>
    </template>
    <template v-else>
      <DeskPanel :title="detail.ruleTitle" :meta="status[detail.status]">
        <div class="desk-body">
          <strong>{{ detail.ruleCode }} · {{ detail.ruleVersion }}</strong>
          <br />
          {{ scope[detail.ruleScope] }}
        </div>
        <dl class="desk-facts">
          <div
            v-for="[k, v] in [
              ['规则编码', detail.ruleCode],
              ['版本号', detail.ruleVersion],
              ['发布人', '未提供'],
              ['生效时间', effective(detail)],
              ['需重新确认', detail.forceReaccept ? '是' : '否'],
              ['累计确认', '未提供'],
            ]"
            :key="k">
            <dt>{{ k }}</dt>
            <dd>{{ v }}</dd>
          </div>
        </dl>
      </DeskPanel>
      <DeskPanel title="规则正文">
        <div class="desk-body rule-body">
          {{ readableBody(detail) }}
        </div>
      </DeskPanel>
      <div class="desk-body" v-if="manage && detail.status === 'draft'">
        <el-button class="desk-btn" :disabled="locked" @click="$emit('edit')">编辑草稿</el-button>
        <el-button class="desk-btn primary" :disabled="locked" @click="$emit('publish')" type="primary">
          发布规则
        </el-button>
      </div>
    </template>
  </div>
</template>
<style scoped>
.rule-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
