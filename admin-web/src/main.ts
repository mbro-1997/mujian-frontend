import "element-plus/es/components/checkbox/style/css";
import "element-plus/es/components/checkbox-group/style/css";
import "element-plus/es/components/switch/style/css";
import "element-plus/es/components/dialog/style/css";
import "element-plus/es/components/date-picker/style/css";
import "./layouts/desktop.css";
import { createApp } from "vue";
import {
  ElCheckbox,
  ElCheckboxGroup,
  ElSwitch,
  ElDialog,
  ElDatePicker,
  ElAlert,
  ElButton,
  ElCard,
  ElForm,
  ElFormItem,
  ElInput,
  ElTable,
  ElTableColumn,
  ElSelect,
  ElOption,
  ElLoading,
} from "element-plus";
import "element-plus/es/components/alert/style/css";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/card/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/form-item/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/table/style/css";
import "element-plus/es/components/table-column/style/css";
import "element-plus/es/components/select/style/css";
import "element-plus/es/components/option/style/css";
import "element-plus/es/components/loading/style/css";
import App from "./App.vue";
import { router } from "./router";
import { installActivityReporting } from "./session/activity";
const app = createApp(App);
for (const component of [
  ElCheckbox,
  ElCheckboxGroup,
  ElSwitch,
  ElDialog,
  ElDatePicker,
  ElAlert,
  ElButton,
  ElCard,
  ElForm,
  ElFormItem,
  ElInput,
  ElTable,
  ElTableColumn,
  ElSelect,
  ElOption,
])
  app.use(component);
app.use(ElLoading).use(router).mount("#app");
installActivityReporting();
