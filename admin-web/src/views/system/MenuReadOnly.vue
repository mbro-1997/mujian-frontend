<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import { ref, onMounted, computed, watch } from "vue";
import { useSessionView } from "../../session/view";
import { api, isStale } from "../../api/http";
import { explain, menuSearch, me, notice, type Menu } from "../../session/state";
import { router } from "../../router";
const typeLabels: Record<string, string> = {
  directory: "目录",
  menu: "菜单",
  button: "按钮",
};
import MenuEditor from "./MenuEditor.vue";
const editor = ref<string | null>(null);
const data = ref<Menu[]>([]),
  busy = ref(false),
  type = ref(""),
  status = ref("");
const view = useSessionView(() => {
  data.value = [];
  editor.value = null;
  busy.value = false;
});
const filtered = computed(() => {
  const search = menuSearch.value.trim();
  const find = (list: Menu[]): Menu[] =>
    list.flatMap((n) => {
      const children = find(n.children);
      return ((!search || n.menuName.includes(search) || (n.permissionCode || "").includes(search)) &&
        (!type.value || n.menuType === type.value) &&
        (!status.value || String(n.enabled) === status.value)) ||
        children.length
        ? [{ ...n, children }]
        : [];
    });
  return find(data.value);
});
const expandedKeys = computed(() => {
  if (!menuSearch.value.trim() && !type.value && !status.value) return [];
  function branches(nodes: Menu[]): string[] {
    return nodes.flatMap((node) => (node.children.length ? [node.id, ...branches(node.children)] : []));
  }
  return branches(filtered.value);
});
watch(menuSearch, (v) => sessionStorage.setItem("mj.menuSearch", v));
async function load() {
  if (busy.value) return;
  const owner = view.capture();
  busy.value = true;
  try {
    const result = await api<Menu[]>("/api/admin/system/menus");
    if (!view.current(owner)) return;
    data.value = result;
    notice.value = "";
  } catch (e) {
    if (!view.current(owner) || isStale(e)) return;
    data.value = [];
    explain(e);
    if (!me.value)
      await router.replace({
        path: "/login",
        query: { return: "/system/menus" },
      });
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
onMounted(load);
function resetFilters() {
  menuSearch.value = "";
  type.value = "";
  status.value = "";
  return load();
}
</script>
<template>
  <div class="page-head">
    <div>
      <h1>菜单权限</h1>
      <p class="muted">管理目录、页面和按钮标识；左侧菜单不保存业务数量</p>
    </div>
    <el-button v-if="me?.permissions.includes('admin:menu:manage') && editor === null" @click="editor = ''">
      新增菜单
    </el-button>
  </div>
  <section v-show="editor === null" class="panel">
    <div class="panel-head">
      <strong>菜单与按钮树</strong>
      <span>当前有效配置</span>
    </div>
    <DeskFilters :busy="busy" @search="load" @reset="resetFilters">
      <el-form-item label="节点类型">
        <el-select
          v-model="type"
          aria-label="节点类型"
          placeholder="全部类型"
          clearable
          popper-class="desk-select-menu">
          <el-option label="目录" value="directory" />
          <el-option label="菜单" value="menu" />
          <el-option label="按钮" value="button" />
        </el-select>
      </el-form-item>
      <el-form-item label="启用状态">
        <el-select
          v-model="status"
          aria-label="启用状态"
          placeholder="全部状态"
          clearable
          popper-class="desk-select-menu">
          <el-option label="启用" value="true" />
          <el-option label="停用" value="false" />
        </el-select>
      </el-form-item>
      <el-form-item label="筛选菜单">
        <el-input v-model="menuSearch" placeholder="菜单名称 / 权限标识" aria-label="筛选菜单" clearable />
      </el-form-item>
    </DeskFilters>
    <el-table
      show-overflow-tooltip
      scrollbar-always-on
      v-loading="busy"
      :data="filtered"
      row-key="id"
      :empty-text="notice ? '当前配置无法显示' : '暂无匹配节点'"
      :expand-row-keys="expandedKeys">
      <el-table-column prop="menuName" label="名称" min-width="180" />
      <el-table-column label="类型" width="90">
        <template #default="s">
          <span :class="['type-tag', s.row.menuType]">{{ typeLabels[s.row.menuType] }}</span>
        </template>
      </el-table-column>
      <el-table-column label="路由 / 权限标识" min-width="280">
        <template #default="s">
          <span class="path">
            {{ [s.row.routePath, s.row.permissionCode].filter(Boolean).join(" · ") || "—" }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="显示" width="70">
        <template #default="s">{{ s.row.visible ? "是" : "否" }}</template>
      </el-table-column>
      <el-table-column prop="sortNo" label="排序" width="70" />
      <el-table-column label="状态" width="90">
        <template #default="s">
          <span :class="['status', s.row.enabled ? 'enabled' : 'disabled']">
            {{ s.row.enabled ? "启用" : "停用" }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false">
        <template #default="s">
          <el-button
            v-if="me?.permissions.includes('admin:menu:manage')"
            link
            class="desk-row-link"
            size="small"
            @click="editor = s.row.id">
            编辑
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="panel-note">隐藏仅影响导航显示；停用会影响权限。保存前请核对节点及授权范围。</div>
  </section>
  <MenuEditor
    v-if="editor !== null"
    :id="editor"
    :nodes="data"
    @saved="
      editor = null;
      load();
    "
    @close="editor = null" />
</template>
<style scoped>
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 13px;
}
.page-head h1 {
  margin: 0;
  font-size: 22px;
}
.page-head p {
  font-size: 10px;
  line-height: 1.5;
  margin: 5px 0 0;
}
.read-only {
  flex-shrink: 0;
  white-space: nowrap;
  background: #edf0f3;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 11px;
  color: #6b7280;
}
.panel {
  background: white;
  border: 1px solid #e0e4e8;
  border-radius: 7px;
  min-height: 640px;
  overflow: hidden;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  min-height: 44px;
  padding: 0 13px;
  font-weight: 900;
  border-bottom: 1px solid #e5e7eb;
  font-size: 12px;
}
.panel-head span {
  color: #6b7280;
  font-size: 10px;
}
.filter-bar {
  display: flex;
  gap: 7px;
  padding: 9px 12px;
  background: #fafbfc;
  border-bottom: 1px solid #e5e7eb;
}
.filter-bar .el-select {
  width: 108px;
  flex-shrink: 0;
}
.filter-bar .el-input {
  width: 140px;
}
.type-tag,
.status {
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  font-size: 9px;
  font-weight: 900;
  white-space: nowrap;
}
.type-tag {
  background: #edf0f3;
  color: #4b5563;
}
.type-tag.directory {
  background: #111827;
  color: #ffe100;
}
.status.enabled {
  background: #d1fadf;
  color: #067647;
}
.status.disabled {
  background: #fee2e2;
  color: #a31621;
}
.path {
  overflow-wrap: anywhere;
}
.panel-note {
  padding: 9px 10px;
  margin: 12px;
  color: #4d4500;
  background: #fff8bf;
  border: 1px solid #eedc57;
  border-radius: 5px;
  font-size: 9px;
  font-weight: 750;
  line-height: 1.55;
}
.filter-bar :deep(.el-input__wrapper),
.filter-bar :deep(.el-select__wrapper) {
  min-height: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 4px;
  box-shadow: 0 0 0 1px #d8dde4 inset;
  font-size: 9px;
}
.filter-bar .el-button {
  height: 28px;
  padding: 0 12px;
  font-size: 10px;
  font-weight: 900;
}
.panel :deep(.el-table) {
  font-size: 9px;
  color: #111827;
}
.panel :deep(.el-table .cell) {
  padding: 0 8px;
  line-height: 1.45;
}
.panel :deep(.el-table th.el-table__cell) {
  height: 31px;
  padding: 0;
  background: #f7f8fa;
  color: #6b7280;
}
.panel :deep(.el-table td.el-table__cell) {
  height: 48px;
  padding: 7px 0;
  font-weight: 650;
  border-bottom-color: #edf0f2;
}
@media (max-width: 850px) {
  .filter-bar {
    flex-wrap: wrap;
  }
  .filter-bar .el-input {
    max-width: none;
    width: 100%;
  }
  .panel {
    min-height: 400px;
  }
}
</style>
