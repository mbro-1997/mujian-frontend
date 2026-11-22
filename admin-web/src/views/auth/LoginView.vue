<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { api, refreshCsrf, isStale } from "../../api/http";
import { lastUsername, notice, login, authBusy, explain } from "../../session/state";
import { useSessionView } from "../../session/view";
import { router, safeReturn } from "../../router";
const password = ref(""),
  busy = ref(false),
  ready = ref(false);
const route = useRoute();
const view = useSessionView(() => {
  password.value = "";
  busy.value = false;
  ready.value = false;
});
const challenge = ref<{ captchaId: string; imageData: string } | null>(null),
  answer = ref("");
let generation = 0;
async function connect() {
  const owner = view.capture();
  const round = ++generation;
  try {
    ready.value = false;
    answer.value = "";
    challenge.value = null;
    await refreshCsrf();
    if (round !== generation || !view.current(owner)) return;
    const result = await api<{ captchaId: string; imageData: string }>("/api/admin/auth/captcha");
    if (round !== generation || !view.current(owner)) return;
    challenge.value = result;
    ready.value = true;
  } catch (e) {
    if (round === generation && view.current(owner) && !isStale(e)) explain(e);
  }
}
onMounted(connect);
async function submit() {
  if (busy.value || authBusy.value || !challenge.value || !answer.value.trim()) return;
  const value = password.value;
  sessionStorage.setItem("mj.lastUsername", lastUsername.value);
  // login在同步部分建立新代次并清空所有旧身份；随后记录本视图归属。
  const pending = login(
    lastUsername.value.trim().toLowerCase(),
    value,
    challenge.value.captchaId,
    answer.value
  );
  const owner = view.capture();
  busy.value = true;
  try {
    const completed = await pending;
    if (view.current(completed)) await router.replace(safeReturn(route.query.return));
  } catch (e) {
    if (view.current(owner) && !isStale(e)) {
      password.value = "";
      await connect();
    }
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
</script>
<template>
  <main class="login-page">
    <section class="login-brand">
      <div>
        <span class="brand-mark">幕</span>
        <h2>幕间管理端</h2>
        <p>统一处理客服、履约、物流费用、索赔仲裁、资金结算、资质审核和运营配置。</p>
        <p>管理员身份与租赁方、工厂方身份互斥。</p>
      </div>
      <div class="login-facts">
        <div>
          <b>统一案件</b>
          <br />
          人工任务集中查看
        </div>
        <div>
          <b>业务核验</b>
          <br />
          按实际权限执行
        </div>
        <div>
          <b>操作审计</b>
          <br />
          追溯业务操作
        </div>
      </div>
    </section>
    <section class="login-form">
      <div class="login-box">
        <h1>登录管理后台</h1>
        <p>使用管理员账号密码登录。首期使用平台管理员角色，后续可按角色扩展菜单权限。</p>
        <el-alert v-if="notice" :title="notice" type="warning" :closable="false" class="notice" />
        <el-form @submit.prevent="submit" label-position="top">
          <el-form-item label="管理员账号">
            <el-input
              v-model="lastUsername"
              placeholder="请输入用户名"
              autocomplete="username"
              maxlength="64" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="password"
              placeholder="请输入登录密码"
              type="password"
              autocomplete="current-password"
              show-password />
          </el-form-item>
          <el-form-item label="安全验证">
            <el-input v-model="answer" placeholder="请输入图形验证码" maxlength="32" autocomplete="off" />
            <button v-if="challenge" type="button" :disabled="busy" @click="connect" aria-label="更换验证码">
              <img :src="challenge.imageData" alt="登录验证码" />
            </button>
          </el-form-item>
          <el-button
            native-type="submit"
            type="primary"
            :loading="busy"
            :disabled="authBusy || !ready || !lastUsername || !password || !answer.trim()"
            class="submit">
            登录
          </el-button>
        </el-form>
        <p class="login-note">闲置 4 小时后需重新登录。连续失败后按安全策略临时限制登录。</p>
        <el-button v-if="!ready" @click="connect">重试连接</el-button>
      </div>
    </section>
  </main>
</template>
<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
  background: #f5f6f7;
}
.login-brand {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 54px;
  color: white;
  background: #111827;
}
.login-brand h2 {
  font-size: 34px;
  margin: 26px 0 0;
}
.login-brand p {
  max-width: 520px;
  margin: 16px 0 0;
  color: #aeb6c2;
  font-size: 13px;
  line-height: 1.75;
}
.login-brand .brand-mark {
  display: inline-block;
  width: 46px;
  height: 46px;
  font-size: 20px;
  line-height: 46px;
}
.login-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.login-facts div {
  padding: 12px;
  border: 1px solid #343c49;
  border-radius: 6px;
  font-size: 10px;
  line-height: 1.55;
}
.login-form {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.login-box {
  width: 390px;
  max-width: 100%;
  padding: 30px;
  background: white;
  border: 1px solid #e0e4e8;
  border-radius: 8px;
  box-shadow: 0 18px 44px rgba(17, 24, 39, 0.1);
}
.login-box h1 {
  font-size: 22px;
  margin: 0;
}
.login-box p {
  margin: 8px 0 20px;
  color: #6b7280;
  font-size: 10px;
  line-height: 1.6;
}
.login-box :deep(.el-form-item) {
  margin-bottom: 12px;
}
.login-box :deep(.el-form-item__label) {
  font-size: 10px;
  font-weight: 800;
  color: #555e6b;
  margin-bottom: 6px;
  height: auto;
  line-height: normal;
}
.login-box :deep(.el-input__wrapper) {
  height: 38px;
  padding: 0 11px;
  border-radius: 5px;
  box-shadow: 0 0 0 1px #d8dde4 inset;
  font-size: 10px;
}
.login-box :deep(.el-form-item__content:has(img)) {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
}
.login-box :deep(.el-form-item__content:has(img) .el-input) {
  min-width: 0;
  flex: 1;
}
.login-box button:has(img) {
  border: 1px solid #d8dde4;
  background: white;
  border-radius: 5px;
  display: flex;
  padding: 1px;
  cursor: pointer;
}
.login-box button img {
  max-width: 100px;
  height: 34px;
}
.submit {
  width: 100%;
  height: 40px;
  font-size: 12px;
  font-weight: 950;
}
.login-box .login-note {
  margin: 8px 0 0;
}
@media (max-width: 720px) {
  .login-page {
    grid-template-columns: minmax(0, 1fr);
  }
  .login-brand {
    padding: 28px;
  }
  .login-brand h2 {
    font-size: 28px;
  }
  .login-facts {
    margin-top: 24px;
  }
  .login-form {
    min-width: 0;
    padding: 24px 16px;
  }
}
</style>
