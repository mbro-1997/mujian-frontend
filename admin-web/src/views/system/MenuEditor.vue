<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api, ApiError, refreshCsrf, requestErrorText } from "../../api/http";
import { useSessionView } from "../../session/view";
import { pageRegistry } from "../../router/registry";
import { ElTreeSelect } from "element-plus";
import "element-plus/es/components/tree-select/style/css";
import type { Menu } from "../../session/state";
const props = defineProps<{ id: string; nodes: Menu[] }>(),
  emit = defineEmits<{ saved: []; close: [] }>();
const defaults = {
  parentId: "",
  menuName: "",
  menuType: "menu",
  permissionCode: "",
  routePath: "",
  componentPath: "",
  iconName: "",
  visible: true,
  enabled: true,
  sortNo: 0,
};
type Model = typeof defaults;
const form = ref<Model>({ ...defaults }),
  token = ref(""),
  feedback = ref(""),
  pending = ref<{ url: string; body: object; key: string } | null>(null),
  busy = ref(false);
const view = useSessionView(() => {
  form.value = { ...defaults };
  pending.value = null;
  token.value = "";
});
const locked = computed(() => busy.value || !!pending.value || (!!props.id && !token.value));
let seq = 0;
watch(
  () => props.id,
  async (id) => {
    const turn = ++seq,
      owner = view.capture();
    form.value = { ...defaults };
    token.value = "";
    pending.value = null;
    feedback.value = "";
    if (!id) return;
    try {
      const d = await api<Model & { snapshotToken: string }>("/api/admin/system/menus/" + id);
      if (view.current(owner) && turn === seq) {
        form.value = {
          ...defaults,
          ...Object.fromEntries(
            Object.keys(defaults).map((k) => [k, d[k as keyof Model] ?? defaults[k as keyof Model]])
          ),
        };
        token.value = d.snapshotToken;
      }
    } catch (e) {
      if (view.current(owner) && turn === seq) feedback.value = requestErrorText(e);
    }
  },
  { immediate: true }
);
async function save() {
  if (busy.value) return;
  const owner = view.capture();
  if (!pending.value) {
    const m = form.value,
      entry = pageRegistry.find((v) => v.routePath === m.routePath);
    if (m.menuType === "menu" && !entry) {
      feedback.value = "请选择已注册路由";
      return;
    }
    const body = {
      ...m,
      parentId: m.parentId || null,
      permissionCode: m.permissionCode || null,
      iconName: m.iconName || null,
      routePath:
        m.menuType === "menu"
          ? entry?.routePath || null
          : m.menuType === "directory"
          ? m.routePath || null
          : null,
      componentPath: m.menuType === "menu" ? entry?.componentPath || null : null,
      ...(props.id ? { snapshotToken: token.value } : {}),
    };
    pending.value = {
      key: crypto.randomUUID(),
      body,
      url: "/api/admin/system/menus" + (props.id ? "/" + props.id + "/save" : ""),
    };
  }
  busy.value = true;
  try {
    await refreshCsrf();
    const p = pending.value;
    await api(p.url, "POST", p.body, true, p.key);
    if (view.current(owner)) {
      pending.value = null;
      emit("saved");
    }
  } catch (e) {
    if (view.current(owner)) {
      feedback.value = requestErrorText(e);
      if (e instanceof ApiError && e.outcome === "business-rejection") pending.value = null;
    }
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
</script>
<template>
  <section class="record-panel menu-editor">
    <h2>{{ id ? "编辑菜单" : "新增菜单" }}</h2>
    <el-form label-position="top" @submit.prevent="save">
      <div class="menu-fields">
        <el-form-item label="上级节点">
          <ElTreeSelect
            v-if="nodes.length"
            v-model="form.parentId"
            :data="nodes"
            node-key="id"
            :props="{ label: 'menuName' }"
            check-strictly
            clearable
            filterable
            :disabled="locked"
            placeholder="顶级目录" />
          <el-input
            v-else
            v-model.trim="form.parentId"
            :disabled="locked"
            placeholder="父节点编号，留空为顶级" />
        </el-form-item>
        <el-form-item label="节点类型">
          <el-select v-model="form.menuType" :disabled="locked" popper-class="desk-select-menu">
            <el-option value="directory" label="目录" />
            <el-option value="menu" label="页面" />
            <el-option value="button" label="按钮权限" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model.trim="form.menuName" required :disabled="locked" />
        </el-form-item>
        <el-form-item label="权限编码" :required="form.menuType === 'button'">
          <el-input
            v-model.trim="form.permissionCode"
            :required="form.menuType === 'button'"
            :disabled="locked" />
        </el-form-item>
        <el-form-item v-if="form.menuType === 'menu'" label="已注册路由" required class="wide-field">
          <el-select
            v-model="form.routePath"
            :disabled="locked"
            filterable
            placeholder="选择已注册页面"
            popper-class="desk-select-menu">
            <el-option
              v-for="p in pageRegistry"
              :key="p.routePath"
              :value="p.routePath"
              :label="p.routePath + ' · ' + p.componentPath" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.menuType === 'directory'" label="目录路径" class="wide-field">
          <el-input v-model.trim="form.routePath" :disabled="locked" />
        </el-form-item>
        <el-form-item label="图标"><el-input v-model="form.iconName" :disabled="locked" /></el-form-item>
        <el-form-item label="排序">
          <el-input type="number" min="0" v-model.number="form.sortNo" :disabled="locked" />
        </el-form-item>
        <el-form-item label="导航显示">
          <el-switch v-model="form.visible" :disabled="locked" aria-label="导航显示" />
        </el-form-item>
        <el-form-item label="启用节点">
          <el-switch v-model="form.enabled" :disabled="locked" aria-label="启用节点" />
        </el-form-item>
      </div>
      <el-alert v-if="feedback" :title="feedback" type="warning" :closable="false" />
      <div class="desk-form-actions">
        <el-button :disabled="!!pending || busy" @click="emit('close')">取消</el-button>
        <el-button type="primary" :disabled="busy || (!!id && !token)" native-type="submit">
          {{ pending ? "按原请求重试" : "确认保存" }}
        </el-button>
      </div>
    </el-form>
  </section>
</template>
<style scoped>
.menu-editor {
  max-width: 880px;
}
.menu-editor h2 {
  margin: 0 0 18px;
}
.menu-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 20px;
}
.wide-field {
  grid-column: 1/-1;
}
@media (max-width: 750px) {
  .menu-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
