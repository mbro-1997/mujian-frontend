<script setup lang="ts">
import { computed } from "vue";
import type {
  OwnedSku,
  Stock,
  SnSummary,
  SnPage,
  MovementPage,
  StockSnapshot,
  ImageLocator,
} from "../../api/prop-types";
import { names, time, money } from "../../api/props";
import DeskPager from "../../components/DeskPager.vue";
import DeskTable from "../../components/DeskTable.vue";
import AssetImages from "./AssetImages.vue";
import Fields from "./PropFields.vue";
import DateRangeFields from "./DateRangeFields.vue";
const p = defineProps<{
  asset: OwnedSku;
  stock: Stock | null;
  sn: SnPage | null;
  summary: SnSummary | null;
  movements: MovementPage | null;
  snPage: number;
  movementPage: number;
  busy: boolean;
  error: string;
  canReadQr: boolean;
  canViewImages: boolean;
}>();
const emit = defineEmits<{
  image: [locator: ImageLocator];
  qr: [id: string];
  reset: [part: "sn" | "movement"];
  inventory: [part: "sn" | "movement"];
  turn: [part: "sn" | "movement", step: number];
}>();
const snStatus = defineModel<string>("snStatus", { required: true }),
  movementType = defineModel<string>("movementType", { required: true }),
  movementSource = defineModel<string>("movementSource", { required: true });
const movementStart = defineModel<string>("movementStart", { required: true }),
  movementEnd = defineModel<string>("movementEnd", { required: true });
const isA = computed(() => p.asset.assetType === "A_ASSET");
const groups = computed(() =>
  isA.value
    ? [
        "道具资料",
        "风格",
        "道具图片（完整 " + p.asset.fields.images.length + " 张）",
        "当前 SKU 状态",
        "全部 A 类实物",
        "库存事实",
      ]
    : ["B 类当前数量台账", "库存变动流水", "查询方式", "道具资料", "道具图片（完整 " + p.asset.fields.images.length + " 张）"],
);
const quantity = (v: number | undefined) => (v == null ? "—" : v + " 件");
const facts = computed(() => {
  const a = p.asset,
    f = a.fields,
    s = p.stock;
  return isA.value
    ? [
        ["SKU 编码", a.skuCode],
        ["道具名称", f.propName],
        ["资产类型", "A 类资产型"],
        ["类别编码", f.typeLabel || f.typeCode],
        ["尺寸描述", f.sizeDesc],
        ["长，单位 cm", f.lengthCm + " cm"],
        ["宽，单位 cm", f.widthCm + " cm"],
        ["高，单位 cm", f.heightCm + " cm"],
        ["材质", f.materialDesc],
        ["是否阻燃编码", f.fireResistantLabel],
        ["重量，单位 kg", f.weightKg + " kg"],
        [
          "包装体积系数",
          f.packagingFactorBps == null
            ? "待补充"
            : f.packagingFactorBps / 10000,
        ],
        ["运输建议", f.transportSuggestion],
        ["日租金，单位分", "¥" + money(f.dailyRentPriceFen) + " / 件 / 天"],
        ["押金，单位分", "¥" + money(f.depositAmountFen) + " / 件"],
        ["备注", f.remark || "无"],
      ]
    : [
        ["SKU ID", a.id + " · " + f.propName],
        ["总数量", quantity(s?.totalQuantity)],
        ["可租库存基数", quantity(s?.rentableBaseQuantity)],
        ["当前可用数量", quantity(s?.availableQuantity)],
        ["已锁定数量", quantity(s?.lockedQuantity)],
        ["租赁中数量", quantity(s?.rentingQuantity)],
        ["丢失数量", quantity(s?.lostQuantity)],
        ["报废数量", quantity(s?.scrappedQuantity)],
        ["最近盘点时间", time(s?.lastCountedAt ?? null) || "—"],
        ["最近盘点人", s?.lastCountedBy || "—"],
        ["更新时间", time(s?.updatedAt ?? null) || "—"],
      ];
});
const statusFields = computed(() => [
  ["SKU 状态", names[p.asset.skuStatus]],
  ["资料填充状态", p.asset.fillStatus === "filled" ? "资料完整" : "待补充"],
  ["所属工厂 ID", p.asset.factoryId + " · " + p.asset.factoryName],
  ["创建时间", time(p.asset.createdAt)],
  ["更新时间", time(p.asset.updatedAt)],
]);
const snStates = [
  "pending_label",
  "idle",
  "locked",
  "renting",
  "repairing",
  "lost",
  "scrapped",
  "retired",
];
const counts: Record<keyof SnSummary, string> = {
  total: "管理总量",
  pendingLabel: "待贴标",
  idle: "空闲",
  locked: "锁定",
  renting: "在租",
  repairing: "维修",
  lost: "丢失",
  scrapped: "报废",
  retired: "退库",
};
const sources = [
  "manual_adjustment",
  "order_fulfillment",
  "arbitration",
  "system_correction",
];
const types = [
  "increase",
  "decrease",
  "abnormal_decrease",
  "outbound",
  "return",
  "lock",
  "release",
  "arbitration_decrease",
];
const movementCols = [
  { prop: "id", label: "流水 ID", width: 165 },
  { prop: "kind", label: "流水类型", width: 104 },
  { prop: "source", label: "来源类型", width: 110 },
  { prop: "quantity", label: "变动数量", width: 95 },
  { prop: "beforeQuantity", label: "变动前数量", width: 106 },
  { prop: "afterQuantity", label: "变动后数量", width: 106 },
  { prop: "beforeText", label: "变动前库存快照", width: 176 },
  { prop: "afterText", label: "变动后库存快照", width: 176 },
  { prop: "relatedAuditId", label: "关联库存调整审核 ID", width: 170 },
  { prop: "relatedOrderId", label: "关联订单 ID", width: 140 },
  { prop: "relatedReservationId", label: "关联库存占用 ID", width: 155 },
  { prop: "relatedArbitrationId", label: "关联仲裁 ID", width: 140 },
  { prop: "operatorUserId", label: "操作人用户 ID", width: 145 },
  { prop: "role", label: "操作人角色", width: 112 },
  { prop: "remark", label: "备注", width: 165 },
  { prop: "created", label: "创建时间", width: 170 },
];
function snapshot(s: StockSnapshot | null) {
  return s
    ? "总量 " +
        s.totalQuantity +
        "；基数 " +
        s.rentableBaseQuantity +
        "；可用 " +
        s.availableQuantity +
        "；锁定 " +
        s.lockedQuantity +
        "；租赁中 " +
        s.rentingQuantity +
        "；丢失 " +
        s.lostQuantity +
        "；报废 " +
        s.scrappedQuantity
    : "—";
}
const movementRows = computed(() => (p.movements?.items ?? []).map(m => ({
  ...m,
  kind: names[m.movementType],
  source: names[m.sourceType],
  beforeText: snapshot(m.before),
  afterText: snapshot(m.after),
  role: { factory: "工厂", admin: "管理员", system: "系统" }[m.operatorRole],
  created: time(m.createdAt),
})));
const showValue = (_row: unknown, _col: unknown, value: unknown) => String(value ?? "—");
function jump(i: number) {
  document
    .getElementById("asset-section-" + i)
    ?.scrollIntoView({ block: "start" });
}
</script>
<template>
  <section class="asset-panel asset-detail">
    <div class="asset-panel-head">
      <b>资料与记录</b>
      <span class="asset-readonly">只读</span>
    </div>
    <div class="asset-detail-body">
      <strong class="asset-code">{{ asset.skuCode }}</strong>
      <p class="asset-note">按业务对象读取；空值、未发生和不适用分别展示</p>
      <nav aria-label="资料分区" class="asset-jumps">
        <el-button size="small" v-for="(g, i) in groups" :key="g" @click="jump(i)">
          {{ g }}
        </el-button>
      </nav>
      <section v-for="(g, i) in groups" :key="g" :id="'asset-section-' + i" class="asset-section">
        <h2>{{ g }}</h2>
        <template v-if="i === 0">
          <p v-if="asset.pendingApplicationId" class="asset-note">SKU 审核中，经营写入已暂停。</p>
          <p v-if="!isA && !stock && !error">
            {{ busy ? '正在读取数量台账…' : '尚未形成库存' }}
          </p>
          <dl v-if="isA || stock" class="asset-facts">
            <div v-for="[key, value] in facts" :key="key">
              <dt>{{ key }}</dt>
              <dd>{{ value }}</dd>
            </div>
          </dl>
        </template>
        <template v-else-if="isA">
          <dl v-if="i === 1" class="asset-facts">
            <div>
              <dt>风格编码</dt>
              <dd>{{ asset.fields.styleLabels.join('、') || '无' }}</dd>
            </div>
          </dl>
          <dl v-if="i === 3" class="asset-facts">
            <div v-for="[key, value] in statusFields" :key="key">
              <dt>{{ key }}</dt>
              <dd>{{ value }}</dd>
            </div>
          </dl>
          <template v-if="i === 4">
            <el-form class="asset-query-inline" label-suffix="：">
              <el-form-item label="实物状态">
                <el-select
                  v-model="snStatus"
                  clearable
                  placeholder="全部"
                  popper-class="asset-select-menu"
                  @change="emit('inventory', 'sn')">
                  <el-option v-for="s in snStates" :key="s" :value="s" :label="names[s]" />
                </el-select>
              </el-form-item>
              <el-button :disabled="busy" @click="emit('reset', 'sn')">重置</el-button>
            </el-form>
            <DeskTable
              row-key="id"
              :data="sn?.items ?? []"
              :empty-text="busy ? '正在读取实物…' : error ? '实物读取失败' : '暂无实物记录'">
              <el-table-column label="SN 编号" min-width="160">
                <template #default="{ row }">
                  <el-button
                    v-if="canReadQr && (row.currentQrId || row.latestQrId)"
                    link
                    @click="emit('qr', row.currentQrId || row.latestQrId)">
                    {{ row.snCode }}
                  </el-button>
                  <template v-else>{{ row.snCode }}</template>
                </template>
              </el-table-column>
              <el-table-column label="实物状态" width="100">
                <template #default="{ row }">{{ names[row.instanceStatus] }}</template>
              </el-table-column>
              <el-table-column label="状态备注" min-width="130">
                <template #default="{ row }">{{ row.statusRemark || '无' }}</template>
              </el-table-column>
              <el-table-column label="状态变更时间" min-width="160">
                <template #default="{ row }">{{ time(row.statusChangedAt) || '—' }}</template>
              </el-table-column>
              <el-table-column label="备注" min-width="150">
                <template #default="{ row }">
                  {{ row.remark || '无'
                  }}{{ row.pendingAdjustmentId ? ' · 关联申请 ' + row.pendingAdjustmentId : '' }}
                </template>
              </el-table-column>
            </DeskTable>
            <DeskPager v-if="sn" :page="snPage" :total="sn.total" @turn="emit('turn', 'sn', $event)" />
          </template>
          <dl v-if="i === 5 && summary" class="asset-facts">
            <div v-for="(name, key) in counts" :key="key">
              <dt>{{ name }}</dt>
              <dd>{{ summary[key] }} 件</dd>
            </div>
          </dl>
          <p v-if="i === 5 && !asset.inventorySummary">尚未形成库存</p>
        </template>
        <template v-else-if="i === 1">
          <DeskTable
            row-key="id"
            :data="movementRows"
            :empty-text="busy ? '正在读取流水…' : error ? '流水读取失败' : '暂无库存流水'">
            <el-table-column
              v-for="col in movementCols"
              :key="col.prop"
              v-bind="col"
              :formatter="showValue" />
          </DeskTable>
          <DeskPager
            v-if="movements"
            :page="movementPage"
            :total="movements.total"
            @turn="emit('turn', 'movement', $event)" />
        </template>
        <template v-else-if="i === 2">
          <el-form
            class="asset-query-inline"
            label-suffix="："
            @submit.prevent="emit('inventory', 'movement')">
            <DateRangeFields v-model:start="movementStart" v-model:end="movementEnd" prefix="流水" />
            <el-form-item label="流水来源">
              <el-select
                v-model="movementSource"
                clearable
                placeholder="全部"
                popper-class="asset-select-menu">
                <el-option v-for="code in sources" :key="code" :value="code" :label="names[code]" />
              </el-select>
            </el-form-item>
            <el-form-item label="流水类型">
              <el-select v-model="movementType" clearable placeholder="全部" popper-class="asset-select-menu">
                <el-option v-for="s in types" :key="s" :value="s" :label="names[s]" />
              </el-select>
            </el-form-item>
            <el-button native-type="submit" type="primary" class="asset-submit" :disabled="busy">
              查询流水
            </el-button>
            <el-button :disabled="busy" @click="emit('reset', 'movement')">重置</el-button>
          </el-form>
        </template>
        <template v-else-if="i === 3">
          <Fields grid hide-images :fields="asset.fields" :options="null" />
          <el-button
            link
            v-if="canReadQr && (asset.currentQrId || asset.latestQrId)"
            class="asset-link"
            @click="emit('qr', (asset.currentQrId || asset.latestQrId)!)">
            查看 / 下载 SKU 标签
          </el-button>
        </template>
        <AssetImages
          v-if="(isA && i === 2) || (!isA && i === 4)"
          :images="asset.fields.images"
          :can-view="canViewImages"
          @view="emit('image', $event)" />
      </section>
    </div>
  </section>
</template>
