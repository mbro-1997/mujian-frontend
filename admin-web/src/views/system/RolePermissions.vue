<script setup lang="ts">
import { computed } from "vue";
import DeskPanel from "../../components/DeskPanel.vue";
import type { Menu } from "../../session/state";

export type GrantNode = Pick<Menu, "id" | "menuName"> &
  Partial<Pick<Menu, "menuType" | "permissionCode" | "children" | "visible">>;
const props = defineProps<{
  roleName: string;
  nodes: GrantNode[];
  selection: string[];
  hasDirectory: boolean;
  editable: boolean;
}>();
const emit = defineEmits<{ "update:selection": [ids: string[]] }>();
const columns = [
  { key: "list", label: "列表" },
  { key: "detail", label: "详情" },
  { key: "action", label: "业务动作" },
  { key: "export", label: "导出" },
  { key: "sensitive", label: "敏感字段" },
] as const;
type ColumnKey = (typeof columns)[number]["key"];
type GrantRow = {
  id: string;
  name: string;
  column: ColumnKey | null;
  children: GrantRow[];
  totals: Record<ColumnKey, number>;
  granted: Record<ColumnKey, number>;
};

const selectedIds = computed(() => new Set(props.selection));
function columnFor(node: GrantNode): ColumnKey | null {
  if (node.menuType === "directory") return null;
  const action = node.permissionCode?.split(":").pop();
  if (action === "export" || action === "sensitive") return action;
  if (node.menuType === "menu") return node.visible === false ? "detail" : "list";
  return ["view", "read", "detail"].includes(action || "") ? "detail" : "action";
}
const actionNames: Record<string, string> = {
  review: "审核",
  sensitive: "查看敏感资料",
  manage: "管理",
  export: "导出",
  read: "查看",
  list: "列表",
  view: "查看详情",
};
function nodeRow(node: GrantNode): GrantRow {
  const children = (node.children || []).map(nodeRow);
  const column = columnFor(node);
  const totals = { list: 0, detail: 0, action: 0, export: 0, sensitive: 0 };
  const granted = { ...totals };
  for (const { key } of columns) {
    totals[key] = children.reduce((n, child) => n + child.totals[key], Number(key === column));
    granted[key] = children.reduce(
      (n, child) => n + child.granted[key],
      Number(key === column && selectedIds.value.has(node.id))
    );
  }
  const name = node.menuName.replace(
    / (review|sensitive|manage|export|read|list|view)$/,
    (_, code: string) => " · " + actionNames[code]
  );
  return { id: node.id, name, column, totals, granted, children };
}
const rows = computed(() => props.nodes.map(nodeRow));
function toggle(id: string, checked: boolean) {
  if (!props.editable) return;
  const next = new Set(props.selection);
  if (checked) next.add(id);
  else next.delete(id);
  emit("update:selection", [...next]);
}
</script>

<template>
  <div class="permission-layout">
    <DeskPanel title="角色">
      <div class="role-current">{{ roleName }}</div>
    </DeskPanel>
    <DeskPanel
      :title="roleName + ' · 菜单与按钮授权'"
      :meta="hasDirectory ? nodes.length + ' 个一级节点 · 已授权 / 总项' : undefined">
      <slot />
      <el-table :data="rows" row-key="id" empty-text="暂无可显示的授权节点" class="permission-matrix">
        <el-table-column :label="hasDirectory ? '菜单组' : '菜单节点编号'" min-width="205">
          <template #default="{ row }">
            <el-checkbox
              v-if="!row.column || !hasDirectory"
              :model-value="selectedIds.has(row.id)"
              :disabled="!editable"
              @change="toggle(row.id, $event === true)">
              {{ row.name }}
            </el-checkbox>
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>
        <template v-if="hasDirectory">
          <el-table-column
            v-for="col in columns"
            :key="col.key"
            :label="col.label"
            align="center"
            min-width="74">
            <template #default="{ row }">
              <el-checkbox
                v-if="row.column === col.key"
                :aria-label="row.name + ' · ' + col.label"
                :model-value="selectedIds.has(row.id)"
                :disabled="!editable"
                @change="toggle(row.id, $event === true)" />
              <span
                v-else-if="row.totals[col.key]"
                :class="['permission-count', { complete: row.granted[col.key] === row.totals[col.key] }]"
                :title="'已授权 ' + row.granted[col.key] + ' 项，共 ' + row.totals[col.key] + ' 项'">
                {{ row.granted[col.key] }} / {{ row.totals[col.key] }}
              </span>
              <span v-else class="no-grant">—</span>
            </template>
          </el-table-column>
        </template>
      </el-table>
    </DeskPanel>
  </div>
</template>

<style scoped>
.permission-layout {
  display: grid;
  grid-template-columns: minmax(148px, 19%) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.permission-layout > .desk-panel {
  margin: 0;
}
.role-current {
  margin: 8px;
  padding: 12px;
  border-radius: 4px;
  background: #fff8c4;
  color: #182230;
  font-weight: 650;
}
.permission-matrix {
  width: 100%;
}
.permission-matrix :deep(.el-checkbox) {
  max-width: 100%;
  margin-right: 0;
  height: auto;
  min-height: 28px;
}
.permission-matrix :deep(.el-checkbox__label) {
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.permission-matrix :deep(.el-table__row--level-0) {
  font-weight: 650;
}
.permission-matrix :deep(.el-table__expand-icon) {
  cursor: pointer;
}
.permission-count {
  display: inline-block;
  min-width: 36px;
  padding: 1px 5px;
  border-radius: 3px;
  color: #475467;
  background: #f4f6f8;
  font-variant-numeric: tabular-nums;
}
.permission-count.complete {
  background: #fff5b5;
  color: #514514;
}
.permission-layout :deep(.el-checkbox) {
  --el-checkbox-checked-bg-color: #ffe100;
  --el-checkbox-checked-input-border-color: #c5ab00;
  --el-checkbox-checked-icon-color: #111827;
}
.no-grant {
  color: #98a2b3;
}
@media (max-width: 950px) {
  .permission-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
