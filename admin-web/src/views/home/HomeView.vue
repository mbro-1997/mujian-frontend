<script setup lang="ts">
import { computed } from 'vue';
import { me, menus } from '../../session/state';
import { navigationGroups } from '../../layouts/navigation';
import DeskPanel from '../../components/DeskPanel.vue';
const groups=computed(()=>navigationGroups(menus.value,me.value?.permissions || []));
</script>
<template>
  <div class="business-view"><header class="desk-head"><h1>本人信息</h1></header>
    <DeskPanel title="账号资料"><dl class="desk-facts">
      <div><dt>管理员</dt><dd>{{me?.nickname}}</dd></div><div><dt>登录账号</dt><dd>{{me?.username}}</dd></div>
      <div><dt>当前角色</dt><dd>{{me?.roles.map(r=>r.roleName).join('、')}}</dd></div>
    </dl></DeskPanel>
    <DeskPanel title="已授权菜单"><div class="desk-body"><p v-for="group in groups" :key="group.name"><b>{{group.name}}</b>　<router-link v-for="item in group.items" :key="item.id" :to="item.routePath!" class="profile-route">{{item.menuName}}</router-link></p>
      <p v-if="!groups.length">暂无可访问的业务菜单</p><details><summary>权限标识（{{me?.permissions.length || 0}}）</summary><p>{{me?.permissions.join('、')}}</p></details>
    </div></DeskPanel>
  </div>
</template>
<style scoped>.profile-route{display:inline-block;text-decoration:underline;margin:0 12px 4px 0}</style>
