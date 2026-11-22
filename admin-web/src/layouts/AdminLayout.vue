<script setup lang="ts">
import { isCurrent } from "../session/boundary";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
const route = useRoute();
import { me, menus, notice, logout } from "../session/state";
import { navigationGroups } from "./navigation";
import { router } from "../router";
const groups = computed(() => navigationGroups(menus.value, me.value?.permissions || []));
const section = computed(() => groups.value.find((g) => g.items.some((m) => m.routePath === route.path)));
const current = computed(() => section.value?.items.find((m) => m.routePath === route.path)?.menuName);
const sideMenu = ref<HTMLElement>();
// 直接打开深层路由时定位一次。之后由用户决定目录的滚动位置。
onMounted(() => {
  const nav = sideMenu.value;
  const active = nav?.querySelector<HTMLElement>("a.router-link-exact-active");
  if (!nav || !active) return;
  const offset = active.getBoundingClientRect().bottom - nav.getBoundingClientRect().bottom;
  if (offset > 0) nav.scrollTop += offset;
});
const search = ref("");
const popup = ref("");
const matches = computed(() =>
  groups.value.flatMap((g) => g.items).filter((m) => m.menuName.includes(search.value.trim()))
);
watch(
  () => route.fullPath,
  () => {
    search.value = "";
    popup.value = "";
  }
);
function onBlur(e: FocusEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) popup.value = "";
}
async function exit() {
  const owner = await logout();
  if (owner !== null && isCurrent(owner)) await router.replace("/login");
}
</script>
<template>
  <div class="app-shell">
    <aside class="app-side">
      <div class="app-brand">
        <span class="brand-mark">幕</span>
        幕间管理端
      </div>
      <nav ref="sideMenu" aria-label="管理端导航">
        <section v-for="group in groups" :key="group.name">
          <div class="nav-group">{{ group.name }}</div>
          <router-link v-for="item in group.items" :key="item.id" :to="item.routePath!" class="nav-item">
            <span>{{ item.menuName }}</span>
            <span aria-hidden="true">›</span>
          </router-link>
        </section>
      </nav>
      <div class="side-user">
        当前管理员
        <br />
        <b>{{ me?.nickname }} · {{ me?.roles.map((r) => r.roleName).join(" / ") }}</b>
      </div>
    </aside>
    <main class="app-main">
      <header class="app-top">
        <span class="crumb">管理端 / {{ section?.name || "账号" }} / {{ current || "本人信息" }}</span>
        <div
          class="top-actions"
          @keydown.esc="
            popup = '';
            search = '';
          "
          @focusout="onBlur">
          <el-input
            class="top-search"
            v-model="search"
            aria-label="搜索已授权菜单"
            placeholder="搜索已授权菜单"
            @focus="popup = 'search'"
            @input="popup = 'search'" />
          <div v-if="popup === 'search' && search.trim()" class="top-pop search-results">
            <router-link v-for="item in matches" :key="item.id" :to="item.routePath!">
              {{ item.menuName }}
            </router-link>
            <span v-if="!matches.length">未找到匹配的菜单</span>
          </div>
          <el-button
            text
            class="help"
            :aria-expanded="popup === 'help'"
            @click="popup = popup === 'help' ? '' : 'help'">
            帮助
          </el-button>
          <el-button
            circle
            class="avatar"
            aria-label="管理员账号"
            :aria-expanded="popup === 'account'"
            @click="popup = popup === 'account' ? '' : 'account'">
            {{ me?.nickname?.slice(0, 1) || "管" }}
          </el-button>
          <div v-if="popup === 'help'" class="top-pop">
            在左侧选择业务，或按菜单名称搜索。当前账号可见的入口由平台授权。
          </div>
          <div v-if="popup === 'account'" class="top-pop">
            <b>{{ me?.nickname }}</b>
            <router-link to="/?view=account">本人信息</router-link>
            <el-button text @click="exit">退出登录</el-button>
          </div>
        </div>
      </header>
      <div class="page">
        <el-alert v-if="notice" :title="notice" type="warning" :closable="false" class="notice" />
        <router-view />
      </div>
    </main>
  </div>
</template>
<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 238px minmax(0, 1fr);
  min-height: 100vh;
}
.app-side {
  display: flex;
  flex-direction: column;
  padding: 18px 14px;
  color: #d1d5db;
  background: #111827;
}
.app-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 2px 9px 22px;
  color: white;
  font-size: 17px;
  font-weight: 950;
}
.nav-group {
  margin-top: 7px;
  padding: 7px 10px 4px;
  color: #7e8794;
  font-size: 9px;
  font-weight: 950;
  letter-spacing: 0.08em;
}
.nav-item {
  display: flex;
  align-items: center;
  min-height: 31px;
  margin-bottom: 2px;
  padding: 0 10px 0 18px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
}
.nav-item::before {
  width: 4px;
  height: 4px;
  margin-right: 8px;
  content: "";
  background: #596270;
  border-radius: 50%;
}
.nav-item.router-link-exact-active {
  color: #111827;
  background: #ffe100;
}
.side-user {
  margin-top: auto;
  padding: 12px 10px 2px;
  border-top: 1px solid #323946;
  font-size: 9px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.app-main {
  min-width: 0;
}
.app-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 60px;
  padding: 0 22px;
  background: white;
  border-bottom: 1px solid #e1e4e8;
}
.crumb {
  color: #5f6773;
  font-size: 10px;
  font-weight: 750;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 10px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

@media (max-width: 700px) {
  .app-shell {
    grid-template-columns: 1fr;
  }
  .app-side {
    padding: 16px;
  }
  .app-brand {
    padding-bottom: 12px;
  }
  nav {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .nav-group,
  .side-user {
    display: none;
  }
  .app-top {
    padding: 12px 16px;
  }
  .top-actions > span {
    display: none;
  }
}

@media (min-width: 701px) {
  .app-shell {
    height: 100dvh;
    min-height: 0;
  }
  .app-side {
    min-height: 0;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: #4b5563 transparent;
  }
  .app-main {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .app-top {
    flex: none;
  }
  .page {
    overflow: auto;
    min-height: 0;
    flex: 1;
  }
}
.nav-item span:first-child {
  margin-right: auto;
}
.top-actions {
  position: relative;
}
.top-search {
  width: 240px;
  height: 32px;
  --el-input-bg-color: #f3f4f6;
  --el-input-border-color: #e1e4e8;
  --el-input-border-radius: 5px;
}
.avatar,
.help,
.top-pop button {
  border: 0;
  cursor: pointer;
  font: inherit;
}
.top-actions .el-button + .el-button {
  margin-left: 0;
}
.avatar {
  padding: 0;
  width: 29px;
  height: 29px;
  border-radius: 50%;
  background: #111827;
  color: white;
}
.help,
.top-pop button {
  background: none;
}
.help {
  padding-inline: 4px;
}
.top-pop {
  position: absolute;
  z-index: 30;
  right: 0;
  top: 100%;
  width: 230px;
  max-height: 45vh;
  overflow: auto;
  padding: 12px;
  line-height: 1.6;
  background: white;
  border: 1px solid #d8dde4;
  border-radius: 6px;
  font-size: 12px;
  box-shadow: 0 6px 16px #11182718;
}
.search-results {
  left: 0;
}
.top-pop a,
.top-pop button {
  display: block;
  padding: 5px;
  text-align: left;
}
.side-user b {
  color: white;
}
@media (max-width: 700px) {
  nav {
    max-height: 30vh;
    overflow: auto;
  }
  .top-search {
    width: 135px;
  }
  .app-brand {
    padding-bottom: 4px;
  }
}
@media (min-width: 701px) {
  .app-side {
    overflow: hidden;
  }
  .app-side nav {
    overflow-y: auto;
    min-height: 0;
    scrollbar-width: thin;
    scrollbar-color: #4b5563 transparent;
    flex: 1;
  }
  .side-user,
  .app-brand {
    flex: none;
  }
}
</style>
