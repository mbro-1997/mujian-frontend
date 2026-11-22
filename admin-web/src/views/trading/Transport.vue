<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";
import { useDetailScroll } from "../../layouts/detail-scroll";
import DeskPanel from "../../components/DeskPanel.vue";
import "./trading.css";
import { ref, reactive, computed, onMounted } from "vue";
import { ElMessageBox } from "element-plus";
import { api, ApiError } from "../../api/http";
import { me } from "../../session/state";
import { useSessionView } from "../../session/view";
import { query, money, time, labels, command, recover, hasPending, tradeError } from "../../api/trading";
import type { PageResult, Vehicle, PriceRule, Receipt, ExtraFee } from "../../api/trading-types";
const permitted = computed(() => me.value?.permissions.includes("admin:trade:transport:manage"));
const tab = ref<"vehicles" | "rules">("vehicles"),
  vehicles = ref<Vehicle[]>([]),
  rules = ref<PriceRule[]>([]),
  options = ref<Vehicle[]>([]);
const page = ref(1),
  total = ref("0"),
  keyword = ref(""),
  city = ref(""),
  status = ref(""),
  vehicleFilter = ref(""),
  busy = ref(false),
  message = ref(""),
  editing = ref(false),
  id = ref(""),
  version = ref(0),
  ruleStatus = ref("draft"),
  endAt = ref("");
const vehicleBlank = {
  tierCode: "",
  tierName: "",
  cargoLengthMm: "",
  cargoWidthMm: "",
  cargoHeightMm: "",
  effectiveVolumeCm3: "",
  safePayloadGram: "",
  sortNo: "0",
  status: "enabled",
};
const ruleBlank = {
  ruleVersion: "",
  cityCode: "",
  vehicleTierId: "",
  distanceMinMeter: "0",
  distanceMaxMeter: "",
  includedDistanceMeter: "",
  guideMinFen: "",
  guideMaxFen: "",
  ownVehicleSettleFen: "",
  extraKmFen: "",
  effectiveAt: "",
  expireAt: "",
};
const savedForm = ref(""),
  latestVersion = ref<number | null>(null);
const vehicleForm = reactive({ ...vehicleBlank }),
  ruleForm = reactive({ ...ruleBlank });
const feeForm = reactive({ highway: "", parking: "", handling: "", waiting: "" });
const vehicleFields: Array<{ key: keyof typeof vehicleBlank; label: string }> = [
  { key: "tierCode", label: "车型编码" },
  { key: "tierName", label: "车型名称" },
  { key: "cargoLengthMm", label: "车厢长（毫米）" },
  { key: "cargoWidthMm", label: "车厢宽（毫米）" },
  { key: "cargoHeightMm", label: "车厢高（毫米）" },
  { key: "effectiveVolumeCm3", label: "有效容积（立方厘米）" },
  { key: "safePayloadGram", label: "安全载重（克）" },
  { key: "sortNo", label: "匹配顺序" },
];
const ruleFields: Array<{
  key: keyof typeof ruleBlank;
  label: string;
  optional?: boolean;
  date?: boolean;
}> = [
  { key: "ruleVersion", label: "规则版号" },
  { key: "cityCode", label: "城市编码" },
  { key: "distanceMinMeter", label: "距离下界（米，含）" },
  { key: "distanceMaxMeter", label: "距离上界（米，不含）", optional: true },
  { key: "includedDistanceMeter", label: "基础包含距离（米）" },
  { key: "guideMinFen", label: "指导下限（元）" },
  { key: "guideMaxFen", label: "指导上限（元）" },
  { key: "ownVehicleSettleFen", label: "自有车基础价（元）" },
  { key: "extraKmFen", label: "超程每公里（元）", optional: true },
  { key: "effectiveAt", label: "生效时间（上海）", date: true },
  { key: "expireAt", label: "失效时间（上海，不含）", optional: true, date: true },
];
const feeFields: Array<{ key: keyof typeof feeForm; label: string }> = [
  { key: "highway", label: "高速" },
  { key: "parking", label: "停车" },
  { key: "handling", label: "搬运" },
  { key: "waiting", label: "等待" },
];
const endpoint = computed(
  () => "/api/admin/" + (tab.value === "vehicles" ? "transport-vehicles" : "transport-price-rules")
);
const slot = computed(() => tab.value + ":" + (id.value || "new"));
const formSnapshot = () => JSON.stringify({ vehicle: vehicleForm, rule: ruleForm, fees: feeForm });
const dirty = computed(() => formSnapshot() !== savedForm.value);
const unresolved = computed(() => hasPending(slot.value));
const readOnly = computed(() => tab.value === "rules" && ruleStatus.value !== "draft");
const view = useSessionView(() => {
  vehicles.value = [];
  rules.value = [];
  options.value = [];
  editing.value = false;
  id.value = "";
  Object.assign(vehicleForm, vehicleBlank);
  Object.assign(ruleForm, ruleBlank);
  Object.assign(feeForm, { highway: "", parking: "", handling: "", waiting: "" });
  busy.value = false;
  message.value = "";
});
function failure(error: unknown) {
  if (error instanceof ApiError && error.reason === "VERSION_CONFLICT") void readLatestVersion();
  message.value = error instanceof Error && !(error instanceof ApiError) ? error.message : tradeError(error);
}
async function readLatestVersion() {
  if (!id.value) return;
  const owner = view.capture();
  try {
    const row = await api<Vehicle | PriceRule>(endpoint.value + "/" + id.value);
    if (!view.current(owner)) return;
    latestVersion.value = row.version;
    if (tab.value === "rules") ruleStatus.value = row.status;
  } catch (error) {
    if (view.current(owner)) message.value = tradeError(error);
  }
}
async function confirmLatestVersion() {
  if (latestVersion.value === null || readOnly.value) return;
  try {
    await ElMessageBox.confirm("服务器已有新版本。确认保留当前输入，并以最新版本再次保存？", "版本冲突", {
      confirmButtonText: "确认保留",
      cancelButtonText: "取消",
    });
    version.value = latestVersion.value;
    latestVersion.value = null;
  } catch {
    /* 取消继续保留本地输入。 */
  }
}
async function load(reset = false) {
  if (busy.value || !permitted.value) return;
  if (reset) page.value = 1;
  const owner = view.capture();
  busy.value = true;
  message.value = "";
  try {
    if (tab.value === "vehicles") {
      const result = await api<PageResult<Vehicle>>(
        endpoint.value +
          "?" +
          query({ page: page.value, pageSize: 20, keyword: keyword.value, status: status.value })
      );
      if (view.current(owner)) {
        vehicles.value = result.items;
        total.value = result.total;
      }
    } else {
      const result = await api<PageResult<PriceRule>>(
        endpoint.value +
          "?" +
          query({
            page: page.value,
            pageSize: 20,
            cityCode: city.value,
            vehicleTierId: vehicleFilter.value,
            status: status.value,
          })
      );
      if (view.current(owner)) {
        rules.value = result.items;
        total.value = result.total;
      }
    }
  } catch (error) {
    if (view.current(owner)) failure(error);
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
async function loadOptions() {
  const owner = view.capture(),
    result: Vehicle[] = [];
  for (let page = 1; ; page++) {
    const part = await api<PageResult<Vehicle>>("/api/admin/transport-vehicles?pageSize=100&page=" + page);
    if (!view.current(owner)) return;
    result.push(...part.items);
    if (!part.items.length || result.length >= Number(part.total)) break;
  }
  if (view.current(owner)) options.value = result;
}
function localTime(value: string | null) {
  return value ? value.slice(0, 19) : "";
}
async function open(key = "") {
  if (busy.value) return;
  const owner = view.capture();
  busy.value = true;
  message.value = "";
  try {
    await loadOptions();
    if (!view.current(owner)) return;
    id.value = key;
    Object.assign(vehicleForm, vehicleBlank);
    Object.assign(ruleForm, ruleBlank);
    Object.assign(feeForm, { highway: "", parking: "", handling: "", waiting: "" });
    version.value = 0;
    ruleStatus.value = "draft";
    endAt.value = "";
    if (key && tab.value === "vehicles") {
      const row = await api<Vehicle>(endpoint.value + "/" + key);
      if (!view.current(owner)) return;
      version.value = row.version;
      Object.assign(vehicleForm, {
        tierCode: row.tierCode,
        tierName: row.tierName,
        cargoLengthMm: String(row.cargoLengthMm),
        cargoWidthMm: String(row.cargoWidthMm),
        cargoHeightMm: String(row.cargoHeightMm),
        effectiveVolumeCm3: row.effectiveVolumeCm3,
        safePayloadGram: row.safePayloadGram,
        sortNo: String(row.sortNo),
        status: row.status,
      });
    } else if (key) {
      const row = await api<PriceRule>(endpoint.value + "/" + key);
      if (!view.current(owner)) return;
      version.value = row.version;
      ruleStatus.value = row.status;
      Object.assign(ruleForm, {
        ruleVersion: row.ruleVersion,
        cityCode: row.cityCode,
        vehicleTierId: row.vehicleTierId,
        distanceMinMeter: String(row.distanceMinMeter),
        distanceMaxMeter: row.distanceMaxMeter === null ? "" : String(row.distanceMaxMeter),
        includedDistanceMeter: String(row.includedDistanceMeter),
        guideMinFen: money(row.guideMinFen),
        guideMaxFen: money(row.guideMaxFen),
        ownVehicleSettleFen: money(row.ownVehicleSettleFen),
        extraKmFen: row.extraKmFen === null ? "" : money(row.extraKmFen),
        effectiveAt: localTime(row.effectiveAt),
        expireAt: localTime(row.expireAt),
      });
      for (const fee of row.extraFees)
        if (fee.type in feeForm) feeForm[fee.type as keyof typeof feeForm] = money(fee.maxAmountFen);
    }
    savedForm.value = formSnapshot();
    latestVersion.value = null;
    editing.value = true;
  } catch (error) {
    if (view.current(owner)) failure(error);
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
function integer(raw: string) {
  if (!/^\d+$/.test(raw) || Number(raw) > 2147483647) throw new Error("整数必须在支持范围内");
  return Number(raw);
}
function capacity(raw: string) {
  if (!/^[1-9]\d*$/.test(raw) || BigInt(raw) > 9223372036854775807n)
    throw new Error("容量或载重必须是有效正整数");
  return raw;
}
function fen(raw: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error("金额请填写非负数字，最多两位小数");
  const [yuan, decimal = ""] = raw.split(".");
  const value = Number(yuan) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(value) || value > 2147483647) throw new Error("金额超出支持范围");
  return value;
}
function at(raw: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) throw new Error("请填写完整上海日期时间");
  return raw + (raw.length === 16 ? ":00" : "") + ".000+08:00";
}
async function save() {
  if (busy.value || readOnly.value) return;
  const owner = view.capture();
  try {
    if (tab.value === "rules" && !ruleForm.vehicleTierId) throw new Error("请选择匹配车型");
    const expected = id.value ? { expectedVersion: version.value } : {};
    const body =
      tab.value === "vehicles"
        ? {
            ...expected,
            tierCode: vehicleForm.tierCode.trim(),
            tierName: vehicleForm.tierName.trim(),
            cargoLengthMm: integer(vehicleForm.cargoLengthMm),
            cargoWidthMm: integer(vehicleForm.cargoWidthMm),
            cargoHeightMm: integer(vehicleForm.cargoHeightMm),
            effectiveVolumeCm3: capacity(vehicleForm.effectiveVolumeCm3),
            safePayloadGram: capacity(vehicleForm.safePayloadGram),
            sortNo: integer(vehicleForm.sortNo),
            status: vehicleForm.status,
          }
        : {
            ...expected,
            ruleVersion: ruleForm.ruleVersion.trim(),
            cityCode: ruleForm.cityCode.trim(),
            vehicleTierId: ruleForm.vehicleTierId,
            distanceMinMeter: integer(ruleForm.distanceMinMeter),
            distanceMaxMeter: ruleForm.distanceMaxMeter ? integer(ruleForm.distanceMaxMeter) : null,
            includedDistanceMeter: integer(ruleForm.includedDistanceMeter),
            guideMinFen: fen(ruleForm.guideMinFen),
            guideMaxFen: fen(ruleForm.guideMaxFen),
            ownVehicleSettleFen: fen(ruleForm.ownVehicleSettleFen),
            extraKmFen: ruleForm.extraKmFen ? fen(ruleForm.extraKmFen) : null,
            effectiveAt: at(ruleForm.effectiveAt),
            expireAt: ruleForm.expireAt ? at(ruleForm.expireAt) : null,
            extraFees: feeFields
              .filter((item) => feeForm[item.key] !== "")
              .map((item) => ({ type: item.key, maxAmountFen: fen(feeForm[item.key]) } as ExtraFee)),
          };
    busy.value = true;
    message.value = "";
    const result = await command<Receipt>(
      slot.value,
      endpoint.value + (id.value ? "/" + id.value + "/update" : ""),
      body
    );
    if (!view.current(owner)) return;
    const receipt = "recovered" in result ? result.receipt : result;
    busy.value = false;
    await open(receipt.resourceId);
  } catch (error) {
    if (view.current(owner)) failure(error);
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
async function transition(action: "publish" | "end") {
  if (!id.value || busy.value) return;
  if (action === "publish" && dirty.value) {
    message.value = "请先保存修改，再发布当前规则";
    return;
  }
  const owner = view.capture();
  try {
    const body =
      action === "publish"
        ? { expectedVersion: version.value }
        : { expectedVersion: version.value, expireAt: at(endAt.value) };
    await ElMessageBox.confirm(
      action === "publish"
        ? "发布后不能修改金额和范围，确认发布当前规则？"
        : "确认按填写时间结束原规则？历史订单保持原快照。",
      "确认运价变更",
      { confirmButtonText: "确认", cancelButtonText: "取消" }
    );
    if (!view.current(owner)) return;
    busy.value = true;
    message.value = "";
    await command<Receipt>(slot.value, endpoint.value + "/" + id.value + "/" + action, body);
    if (view.current(owner)) {
      busy.value = false;
      await open(id.value);
    }
  } catch (error) {
    if (error !== "cancel" && error !== "close" && view.current(owner)) failure(error);
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
async function recovery() {
  const owner = view.capture();
  try {
    const receipt = await recover(slot.value);
    if (receipt && view.current(owner)) await open(receipt.resourceId);
    else if (view.current(owner)) message.value = "没有待恢复操作";
  } catch (error) {
    if (view.current(owner)) failure(error);
  }
}
async function changeTab(value: "vehicles" | "rules") {
  if (busy.value) return;
  tab.value = value;
  page.value = 1;
  status.value = "";
  editing.value = false;
  await load();
}
async function back() {
  if (unresolved.value) {
    message.value = "请先确认原操作结果";
    return;
  }
  editing.value = false;
  await load();
}
function paginate(delta: number) {
  page.value += delta;
  void load();
}
onMounted(() => load());
useDetailScroll(() => editing.value);
function resetFilters() {
  keyword.value = "";
  city.value = "";
  vehicleFilter.value = "";
  status.value = "";
  return load(true);
}
</script>
<template>
  <section class="trade-admin">
    <h1>车型与运价</h1>
    <div class="sub">
      车型按有效容积、载重和单件六向尺寸匹配；运价按城市、车型、距离和生效时间确定唯一版本。
    </div>
    <div v-if="!permitted" class="notice">当前账号无运输配置权限。</div>
    <template v-else>
      <div class="toolbar">
        <el-button :disabled="busy || editing" @click="changeTab('vehicles')">车型档位</el-button>
        <el-button :disabled="busy || editing" @click="changeTab('rules')">运价规则</el-button>
        <el-button v-if="editing" @click="back" :disabled="busy">返回列表</el-button>
        <el-button v-else class="primary" @click="open()" :disabled="busy" type="primary">
          {{ tab === "vehicles" ? "新增车型" : "新增规则" }}
        </el-button>
      </div>
      <div v-if="message" class="notice error" role="alert">
        {{ message }}
        <el-button v-if="latestVersion !== null && !readOnly" @click="confirmLatestVersion" :disabled="busy">
          保留输入并采用最新版本 {{ latestVersion }}
        </el-button>
        <el-button v-if="editing" @click="recovery" :disabled="busy">查询原请求</el-button>
      </div>
      <template v-if="!editing">
        <DeskPanel
          :title="tab === 'vehicles' ? '运输车型档位' : '运输指导价规则'"
          :meta="busy || message ? undefined : '共 ' + total + ' 条'">
          <DeskFilters :busy="busy" @search="load(true)" @reset="resetFilters">
            <el-form-item label="名称或编码" v-if="tab === 'vehicles'">
              <el-input v-model.trim="keyword" placeholder="名称 / 编码" aria-label="名称或编码" clearable />
            </el-form-item>
            <template v-else>
              <el-form-item label="城市编码">
                <el-input v-model.trim="city" placeholder="城市编码" aria-label="城市编码" clearable />
              </el-form-item>
              <el-form-item label="车型 ID">
                <el-input v-model.trim="vehicleFilter" placeholder="车型 ID" aria-label="车型 ID" clearable />
              </el-form-item>
            </template>
            <el-form-item label="状态">
              <el-select
                v-model="status"
                aria-label="状态"
                :empty-values="[null, undefined]"
                placeholder="全部状态"
                popper-class="desk-select-menu">
                <el-option value="" label="全部状态" />
                <template v-if="tab === 'vehicles'">
                  <el-option value="enabled" label="启用" />
                  <el-option value="disabled" label="停用" />
                </template>
                <template v-else>
                  <el-option value="draft" label="草稿" />
                  <el-option value="active" label="已发布" />
                  <el-option value="expired" label="已结束" />
                </template>
              </el-select>
            </el-form-item>
          </DeskFilters>
          <div class="panel">
            <DeskTable
              v-if="tab === 'vehicles'"
              :data="vehicles"
              :empty-text="busy ? '正在读取…' : message ? '读取失败' : '暂无配置，请按实际运营条件新增。'">
              <el-table-column label="编码" min-width="94" prop="tierCode" />
              <el-table-column label="名称" min-width="94" prop="tierName" />
              <el-table-column label="长宽高 mm" min-width="94">
                <template #default="{ row }">
                  {{ row.cargoLengthMm }} × {{ row.cargoWidthMm }} × {{ row.cargoHeightMm }}
                </template>
              </el-table-column>
              <el-table-column label="有效容积 cm³" min-width="94" prop="effectiveVolumeCm3" />
              <el-table-column label="安全载重 g" min-width="94" prop="safePayloadGram" />
              <el-table-column label="匹配顺序" min-width="94" prop="sortNo" />
              <el-table-column label="状态" min-width="94">
                <template #default="{ row }">{{ labels[row.status] }}</template>
              </el-table-column>
              <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
                <template #default="{ row }">
                  <el-button @click="open(row.id)" :disabled="busy" size="small" link class="desk-row-link">
                    编辑
                  </el-button>
                </template>
              </el-table-column>
            </DeskTable>
            <DeskTable
              v-else
              :data="rules"
              :empty-text="busy ? '正在读取…' : message ? '读取失败' : '暂无配置，请按实际运营条件新增。'">
              <el-table-column label="版号" min-width="94" prop="ruleVersion" />
              <el-table-column label="城市" min-width="94" prop="cityCode" />
              <el-table-column label="车型 ID" min-width="138" prop="vehicleTierId" />
              <el-table-column label="距离段 m" min-width="94">
                <template #default="{ row }">
                  [{{ row.distanceMinMeter }}, {{ row.distanceMaxMeter ?? "不限" }})
                </template>
              </el-table-column>
              <el-table-column label="包含 m" min-width="94" prop="includedDistanceMeter" />
              <el-table-column label="指导价 元" min-width="94">
                <template #default="{ row }">
                  {{ money(row.guideMinFen) }}—{{ money(row.guideMaxFen) }}
                </template>
              </el-table-column>
              <el-table-column label="超程 元/km" min-width="94">
                <template #default="{ row }">
                  {{ row.extraKmFen === null ? "不加收" : money(row.extraKmFen) }}
                </template>
              </el-table-column>
              <el-table-column label="生效 / 截止" min-width="138">
                <template #default="{ row }">{{ time(row.effectiveAt) }} · {{ time(row.expireAt) }}</template>
              </el-table-column>
              <el-table-column label="状态" min-width="94">
                <template #default="{ row }">{{ labels[row.status] }}</template>
              </el-table-column>
              <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
                <template #default="{ row }">
                  <el-button @click="open(row.id)" :disabled="busy" size="small" link class="desk-row-link">
                    详情 / 编辑
                  </el-button>
                </template>
              </el-table-column>
            </DeskTable>
          </div>
          <DeskPager :page="page" :total="total" :busy="busy" @turn="paginate" />
        </DeskPanel>
      </template>
      <form v-else class="panel" @submit.prevent="save">
        <h2>
          {{ tab === "vehicles" ? "车型档位" : "运价规则" }}资料 ·
          {{ id ? "版本 " + version : "新增" }}
        </h2>
        <fieldset :disabled="busy || unresolved || readOnly" style="border: 0; padding: 0">
          <div class="fields" v-if="tab === 'vehicles'">
            <label v-for="field in vehicleFields" :key="field.key">
              {{ field.label }}
              <el-input v-model.trim="vehicleForm[field.key]" required maxlength="128" />
            </label>
            <label>
              状态
              <el-select
                :disabled="busy || unresolved || readOnly"
                v-model="vehicleForm.status"
                :empty-values="[null, undefined]"
                placeholder="请选择"
                popper-class="desk-select-menu">
                <el-option value="enabled" label="启用" />
                <el-option value="disabled" label="停用" />
              </el-select>
            </label>
          </div>
          <template v-else>
            <div class="fields">
              <label v-for="field in ruleFields" :key="field.key">
                {{ field.label }}{{ field.optional ? "（可空）" : "" }}
                <el-input
                  v-model="ruleForm[field.key]"
                  :type="field.date ? 'datetime-local' : 'text'"
                  :required="!field.optional"
                  :step="field.date ? 1 : undefined" />
              </label>
              <label>
                匹配车型
                <el-select
                  :disabled="busy || unresolved || readOnly"
                  v-model="ruleForm.vehicleTierId"
                  required
                  :empty-values="[null, undefined]"
                  placeholder="选择车型"
                  popper-class="desk-select-menu">
                  <el-option value="" disabled label="选择车型" />
                  <el-option
                    v-for="vehicle in options"
                    :key="vehicle.id"
                    :value="vehicle.id"
                    :disabled="vehicle.status !== 'enabled'"
                    :label="
                      vehicle.tierName +
                      ' · ' +
                      vehicle.tierCode +
                      (vehicle.status === 'disabled' ? '（停用）' : '')
                    " />
                </el-select>
              </label>
            </div>
            <h2 style="margin-top: 24px">允许核准的额外费用</h2>
            <div class="fields">
              <label v-for="fee in feeFields" :key="fee.key">
                {{ fee.label }}上限（元，可空）
                <el-input v-model.trim="feeForm[fee.key]" placeholder="不启用留空" />
              </label>
            </div>
          </template>
        </fieldset>
        <div class="notice">
          {{
            tab === "vehicles"
              ? "停用后不参与新车型匹配，历史订单保留原快照。"
              : "草稿可编辑，发布后不能覆盖金额和区间；通过新版本调整。同城、车型、时间及距离段不得重叠。"
          }}
          保存失败保留当前输入，结果未知先查询原请求。
        </div>
        <div class="toolbar">
          <el-button v-if="!readOnly" class="primary" :disabled="busy" native-type="submit" type="primary">
            {{ tab === "vehicles" ? "保存车型" : "保存草稿" }}
          </el-button>
          <el-button
            v-if="tab === 'rules' && id && ruleStatus === 'draft'"
            @click="transition('publish')"
            :disabled="busy || unresolved || dirty">
            发布规则
          </el-button>
          <template v-if="tab === 'rules' && ruleStatus === 'active'">
            <label>
              未来截止时间（上海）
              <el-input v-model="endAt" type="datetime-local" step="1" />
            </label>
            <el-button @click="transition('end')" :disabled="busy || unresolved">设置失效时间</el-button>
          </template>
          <el-button @click="recovery" :disabled="busy">查询原操作结果</el-button>
        </div>
      </form>
    </template>
  </section>
</template>
