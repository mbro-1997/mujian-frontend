<script setup lang="ts">
import DeskFilters from "../../components/DeskFilters.vue";
import DeskTable from "../../components/DeskTable.vue";
import DeskPager from "../../components/DeskPager.vue";
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import MetricStrip from "../../components/MetricStrip.vue";
import { ElMessageBox, ElDialog, ElUpload, ElImage, type UploadUserFile } from "element-plus";
import "element-plus/es/components/dialog/style/css";
import "element-plus/es/components/message-box/style/css";
import "element-plus/es/components/upload/style/css";
import { api, refreshCsrf, isStale, errorText, ApiError } from "../../api/http";
import { me } from "../../session/state";
import { useSessionView } from "../../session/view";
import * as commands from "../../api/props";
import type {
  OwnedSku,
  Review,
  ReviewRow,
  QrException,
  Options,
  ImageLocator,
  ImageView,
  SnPage,
  SnSummary,
  Stock,
  MovementPage,
  ReservationPage,
  Availability,
  Qr,
  CommandResult,
  ReviewResult,
} from "../../api/prop-types";
import ReviewList from "./ReviewList.vue";
import { useRoute } from "vue-router";
import type { ReviewPendingCounts } from "../../api/prop-types";

import AssetList from "./AssetList.vue";
import AssetQrCard from "./AssetQrCard.vue";
import AssetDetail from "./AssetDetail.vue";

import Fields from "./PropFields.vue";
import DateRangeFields from "./DateRangeFields.vue";
const props = defineProps<{ kind: "reviews" | "assets" | "qr-exceptions" }>();
const config = computed(
  () =>
    ({
      reviews: {
        title: "道具与库存审核",
        path: "prop-reviews",
        permission: "prop-review",
      },
      assets: {
        title: "道具资产与租期",
        path: "prop-assets",
        permission: "prop-asset",
      },
      "qr-exceptions": {
        title: "二维码异常",
        path: "prop-qr-exceptions",
        permission: "prop-qr",
      },
    }[props.kind])
);
const names = { ...commands.names, all: "全部" } as Record<string, string>,
  time = commands.time;
const label = (s: string) => (s === "cancelled" && props.kind === "qr-exceptions" ? "已取消" : names[s] || s);
const allow = (domain: string, action: string) =>
  me.value?.permissions.includes("admin:" + domain + ":read") &&
  me.value.permissions.includes("admin:" + domain + ":" + action);
const initialStatus = useRoute().query.auditStatus;
const rows = ref<Array<OwnedSku | ReviewRow | QrException>>([]),
  options = ref<Options | null>(null),
  page = ref(1),
  total = ref("0"),
  keyword = ref(""),
  status = ref(
    props.kind === "reviews"
      ? typeof initialStatus === "string" &&
        ["all", "approved", "rejected", "cancelled"].includes(initialStatus)
        ? initialStatus
        : "pending"
      : props.kind === "qr-exceptions"
      ? "reported"
      : ""
  ),
  source = ref(""),
  factoryId = ref(""),
  busy = ref(false),
  message = ref("");
const asset = ref<OwnedSku | null>(null),
  review = ref<Review | null>(null),
  exception = ref<QrException | null>(null),
  sn = ref<SnPage | null>(null),
  summary = ref<SnSummary | null>(null),
  stock = ref<Stock | null>(null),
  movements = ref<MovementPage | null>(null),
  reservations = ref<ReservationPage | null>(null),
  availability = ref<Availability | null>(null),
  qr = ref<Qr | null>(null),
  picture = ref<ImageView | null>(null),
  reason = ref(""),
  startDate = ref(""),
  endDate = ref(""),
  snPage = ref(1),
  movementPage = ref(1),
  reservationPage = ref(1),
  pending = ref(false);
const factoryKeyword = ref(""),
  styleCodes = ref<string[]>([]),
  typeCode = ref(""),
  assetType = ref(""),
  reviewCategory = ref(""),
  exceptionFilter = ref(""),
  snStatus = ref(""),
  movementType = ref(""),
  movementSource = ref(""),
  movementStart = ref(""),
  movementEnd = ref("");
const pendingCounts = ref<ReviewPendingCounts | null>(null),
  exceptionCounts = ref<{
    reported: string;
    suspectedLeak: string;
    resolvedToday: string;
    cancelledToday: string;
  } | null>(null);
const reservationOverview = ref(false),
  reservationKeyword = ref(""),
  reservationStatus = ref("");
const rentSku = ref<OwnedSku | null>(null);
type QrAction = "register" | "issue";
type QrDialog = "label" | QrAction | "pick-register" | "pick-issue";
const qrDialog = ref<QrDialog | null>(null);
const assetRows = computed(() => rows.value.filter((row): row is OwnedSku => "fields" in row));
let inventorySequence = 0;
let rentSequence = 0;
let forecastSequence = 0;
const rentLoading = ref(false);
let originScroll = 0;
function setStyles(codes: string[]) {
  if (codes.length > 3) {
    message.value = "最多选择3项风格";
    return;
  }
  styleCodes.value = codes;
  page.value = 1;
}
const exceptionType = ref(""),
  description = ref(""),
  files = ref<UploadUserFile[]>([]);
let detailSequence = 0,
  qrSequence = 0,
  listSequence = 0;
let poll: ReturnType<typeof setTimeout> | undefined,
  pictureTimer: ReturnType<typeof setTimeout> | undefined,
  rounds = 0;
const clear = () => {
  detailSequence++;
  qrSequence++;
  asset.value = null;
  review.value = null;
  exception.value = null;
  sn.value = null;
  summary.value = null;
  stock.value = null;
  movements.value = null;
  reservations.value = null;
  reservationOverview.value = false;
  rentSku.value = null;
  rentLoading.value = false;
  rentSequence++;
  forecastSequence++;
  qrDialog.value = null;
  reservationKeyword.value = "";
  reservationStatus.value = "";
  availability.value = null;
  qr.value = null;
  picture.value = null;
  reason.value = "";
  clearTimeout(poll);
  clearTimeout(pictureTimer);
};
const view = useSessionView(() => {
  clear();
  listSequence++;
  pendingCounts.value = null;
  rows.value = [];
  pending.value = false;
  busy.value = false;
  files.value = [];
  message.value = "";
});
onUnmounted(() => {
  clearTimeout(poll);
  clearTimeout(pictureTimer);
});
function fail(e: unknown) {
  if (isStale(e)) return;
  message.value =
    e instanceof ApiError
      ? (errorText[e.reason] || e.reason) + (e.traceId ? " · 追踪号 " + e.traceId : "")
      : e instanceof Error
      ? e.message
      : String(e);
  pending.value = !!commands.pending();
}
async function load() {
  const owner = view.capture(),
    sequence = ++listSequence;
  const active = () => view.current(owner) && sequence === listSequence;
  busy.value = true;
  message.value = "";
  try {
    const q: Record<string, string | number | string[]> = {
      page: page.value,
      pageSize: 20,
    };
    if (props.kind === "reviews") {
      q.auditStatus = status.value;
      q.sourceType = source.value;
      q.reviewCategory = reviewCategory.value;
      q.assetType = assetType.value;
    } else if (props.kind === "assets") {
      q.skuStatus = status.value;
      q.styleCodes = styleCodes.value;
      q.typeCode = typeCode.value;
      q.assetType = assetType.value;
    } else {
      q.status = status.value;
      q.exceptionType = exceptionFilter.value;
    }
    q.keyword = keyword.value;
    q.factoryKeyword = factoryKeyword.value;
    q.factoryId = factoryId.value;
    const r = await api<{
      items: Array<OwnedSku | ReviewRow | QrException>;
      total: string;
      pendingCounts?: ReviewPendingCounts;
      counts?: typeof exceptionCounts.value;
    }>("/api/admin/" + config.value.path + "?" + commands.query(q));
    if (active()) {
      rows.value = r.items;
      total.value = r.total;
      if (r.pendingCounts) pendingCounts.value = r.pendingCounts;
      if (r.counts) exceptionCounts.value = r.counts;
    }
  } catch (e) {
    if (active()) {
      if (props.kind !== "qr-exceptions") {
        rows.value = [];
        total.value = "0";
        pendingCounts.value = null;
      }
      fail(e);
    }
  } finally {
    if (active()) busy.value = false;
  }
}
function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: "start" });
}
let listScroll = 0;
function scrollArea() {
  return document.querySelector<HTMLElement>(".app-main > .page");
}
async function backToList() {
  clear();
  busy.value = false;
  message.value = "";
  await nextTick();
  scrollArea()?.scrollTo(0, listScroll);
}
async function open(row: OwnedSku | ReviewRow | QrException) {
  if (!current.value) listScroll = scrollArea()?.scrollTop || 0;
  clear();
  const owner = view.capture(),
    sequence = detailSequence;
  const active = () => view.current(owner) && sequence === detailSequence;
  busy.value = true;
  message.value = "";
  try {
    if ("sourceType" in row) {
      const value = await api<Review>("/api/admin/prop-reviews/" + row.sourceType + "/" + row.id);
      if (active()) {
        review.value = value;
        await nextTick();
        if (active()) scrollArea()?.scrollTo(0, 0);
      }
    } else if ("skuStatus" in row) {
      const value = await api<OwnedSku>("/api/admin/prop-assets/" + row.id);
      if (!active()) return;
      asset.value = value;
      snPage.value = movementPage.value = reservationPage.value = 1;
      snStatus.value =
        movementType.value =
        movementSource.value =
        movementStart.value =
        movementEnd.value =
          "";
      await nextTick();
      if (active()) scrollArea()?.scrollTo(0, 0);
      await inventory();
    } else {
      const value = await api<QrException>("/api/admin/prop-qr-exceptions/" + row.id);
      if (active()) exception.value = value;
    }
  } catch (e) {
    if (active()) fail(e);
  } finally {
    if (active()) busy.value = false;
  }
}
async function inventory() {
  if (!asset.value || !asset.value.inventorySummary) return;
  const sequence = detailSequence;
  const request = ++inventorySequence;
  const owner = view.capture(),
    base = "/api/admin/prop-assets/" + asset.value.id;
  if (asset.value.assetType === "A_ASSET") {
    const [items, counts] = await Promise.all([
      api<SnPage>(base + "/instances?" + commands.query({ page: snPage.value, status: snStatus.value })),
      api<SnSummary>(base + "/instance-summary"),
    ]);
    if (view.current(owner) && sequence === detailSequence && request === inventorySequence) {
      sn.value = items;
      summary.value = counts;
    }
  } else {
    const [s, m] = await Promise.all([
      api<Stock>(base + "/stock"),
      api<MovementPage>(
        base +
          "/movements?" +
          commands.query({
            page: movementPage.value,
            startDate: movementStart.value,
            endDate: movementEnd.value,
            sourceType: movementSource.value,
            movementType: movementType.value,
          })
      ),
    ]);
    if (view.current(owner) && sequence === detailSequence && request === inventorySequence) {
      stock.value = s;
      movements.value = m;
    }
  }
}
async function occupied() {
  if (!reservationOverview.value) return;
  const request = ++rentSequence;
  message.value = "";
  if (startDate.value && endDate.value && startDate.value > endDate.value) {
    rentLoading.value = false;
    reservations.value = null;
    message.value = "结束日期不能早于开始日期";
    return;
  }
  rentLoading.value = true;
  const sequence = detailSequence;
  const owner = view.capture();
  try {
    const r = await api<ReservationPage>(
      "/api/admin/inventory-reservations?" +
        commands.query({
          skuId: rentSku.value?.id,
          keyword: reservationKeyword.value,
          status: reservationStatus.value,
          page: reservationPage.value,
          startDate: startDate.value,
          endDate: endDate.value,
        })
    );
    if (view.current(owner) && sequence === detailSequence && request === rentSequence)
      reservations.value = r;
  } catch (e) {
    if (view.current(owner) && sequence === detailSequence && request === rentSequence) {
      reservations.value = null;
      fail(e);
    }
  } finally {
    if (request === rentSequence) rentLoading.value = false;
  }
}
function resetListFilters() {
  keyword.value = factoryKeyword.value = factoryId.value = "";
  typeCode.value = assetType.value = reviewCategory.value = source.value = exceptionFilter.value = "";
  status.value = props.kind === "assets" ? "" : "all";
  styleCodes.value = [];
  page.value = 1;
  return load();
}
function resetInventory(part: "sn" | "movement") {
  if (part === "sn") snStatus.value = "";
  else movementStart.value = movementEnd.value = movementType.value = movementSource.value = "";
  return assetInventory(part);
}
function resetRentFilters() {
  startDate.value = endDate.value = reservationStatus.value = reservationKeyword.value = "";
  reservationPage.value = 1;
  invalidateForecast();
  return occupied();
}
async function showRent(row?: OwnedSku) {
  originScroll = scrollArea()?.scrollTop || 0;
  rentSku.value = row || null;
  reservationOverview.value = true;
  reservations.value = null;
  await nextTick();
  scrollArea()?.scrollTo(0, 0);
  await resetRentFilters();
}
function invalidateForecast() {
  forecastSequence++;
  availability.value = null;
}
async function closeRent() {
  rentSequence++;
  invalidateForecast();
  reservationOverview.value = false;
  rentLoading.value = false;
  message.value = "";
  await nextTick();
  scrollArea()?.scrollTo(0, originScroll);
}
async function predict() {
  if (!rentSku.value) return;
  const target = rentSku.value.id,
    request = ++forecastSequence;
  message.value = "";
  const sequence = detailSequence;
  const owner = view.capture();
  try {
    const r = await api<Availability>(
      "/api/admin/prop-assets/" +
        target +
        "/availability?" +
        commands.query({ startDate: startDate.value, endDate: endDate.value })
    );
    if (view.current(owner) && sequence === detailSequence && request === forecastSequence)
      availability.value = r;
  } catch (e) {
    if (view.current(owner) && sequence === detailSequence && request === forecastSequence) fail(e);
  }
}
async function image(locator: ImageLocator) {
  const owner = view.capture(),
    sequence = detailSequence;
  const active = () => view.current(owner) && sequence === detailSequence;
  try {
    await refreshCsrf();
    const r = await api<ImageView>("/api/admin/prop-materials/view", "POST", locator);
    if (!active()) return;
    picture.value = r;
    clearTimeout(pictureTimer);
    pictureTimer = setTimeout(() => {
      picture.value = null;
    }, Math.max(0, Date.parse(r.expiresAt) - Date.now()));
  } catch (e) {
    if (active()) fail(e);
  }
}
async function decide(approve: boolean) {
  const target = review.value || exception.value;
  if (!target || busy.value || pending.value || !(approve ? target.canApprove : target.canReject)) return;
  if (!reason.value.trim()) {
    message.value = "请填写审核原因";
    return;
  }
  const owner = view.capture(),
    sequence = detailSequence;
  const active = () => view.current(owner) && sequence === detailSequence;
  const path =
    "/api/admin/" +
    (review.value ? "prop-reviews/" + review.value.sourceType : "prop-qr-exceptions") +
    "/" +
    target.id +
    "/" +
    (approve ? "approve" : "reject");
  const body = { expectedVersion: target.version, reason: reason.value.trim() };
  try {
    await ElMessageBox.confirm(
      approve ? "确认批准当前申请？业务状态将按本次申请生效。" : "确认驳回当前申请？原业务状态不会改变。",
      approve ? "审核通过" : "驳回申请",
      { confirmButtonText: "确认", cancelButtonText: "取消" }
    );
    if (!active()) return;
    busy.value = true;
    await commands.command(path, body, approve ? "approve" : "reject", true);
    if (!active()) return;
    await refreshSelected();
    if (active()) await load();
  } catch (e) {
    if (e !== "cancel" && e !== "close" && active()) fail(e);
  } finally {
    if (active()) busy.value = false;
  }
}
async function refreshSelected() {
  const owner = view.capture(),
    sequence = detailSequence;
  const active = () => view.current(owner) && sequence === detailSequence;
  if (review.value) {
    const r = await api<Review>("/api/admin/prop-reviews/" + review.value.sourceType + "/" + review.value.id);
    if (active()) review.value = r;
  } else if (exception.value) {
    const r = await api<QrException>("/api/admin/prop-qr-exceptions/" + exception.value.id);
    if (active()) exception.value = r;
  } else if (asset.value) {
    const r = await api<OwnedSku>("/api/admin/prop-assets/" + asset.value.id);
    if (active()) {
      asset.value = r;
      await inventory();
    }
  }
}
async function recover(retry = false) {
  const owner = view.capture();
  busy.value = true;
  try {
    const result = retry ? await commands.retryPending() : await commands.recover();
    if (!view.current(owner)) return;
    message.value = result ? "原操作已完成，已刷新当前资料。" : "目前未查询到原操作，可按原正文重试。";
    pending.value = !!commands.pending();
    if (result) {
      await refreshSelected();
      await load();
    }
  } catch (e) {
    if (view.current(owner)) fail(e);
  } finally {
    if (view.current(owner)) busy.value = false;
  }
}
async function loadQr(id: string, reset = true) {
  const sequence = ++qrSequence;
  const owner = view.capture();
  clearTimeout(poll);
  if (reset) rounds = 0;
  try {
    const q = await api<Qr>("/api/admin/prop-qr/" + id);
    if (!view.current(owner) || sequence !== qrSequence) return;
    qr.value = q;
    if (q.status === "bound" && ["pending", "generating"].includes(q.imageStatus) && rounds < 10) {
      rounds++;
      poll = setTimeout(() => loadQr(id, false), 2000);
    }
    return q;
  } catch (e) {
    if (view.current(owner) && sequence === qrSequence) fail(e);
  }
}
async function retryImage() {
  if (!qr.value) return;
  const owner = view.capture(),
    id = qr.value.id,
    sequence = qrSequence;
  const active = () => view.current(owner) && sequence === qrSequence && qr.value?.id === id;
  try {
    await refreshCsrf();
    if (!active()) return;
    await api<Qr>("/api/admin/prop-qr/" + id + "/retry-image", "POST");
    if (active()) await loadQr(id);
  } catch (e) {
    if (active()) fail(e);
  }
}
function openQrForm(action: QrAction) {
  message.value = "";
  if (action === "register") {
    exceptionType.value = "";
    description.value = "";
    files.value = [];
  } else {
    reason.value = "";
  }
  qrDialog.value = action;
}
async function registerException() {
  if (!qr.value || busy.value || pending.value) return;
  const owner = view.capture(),
    sequence = detailSequence,
    qrId = qr.value.id;
  const active = () => view.current(owner) && sequence === detailSequence && qr.value?.id === qrId;
  try {
    if (!exceptionType.value || !description.value.trim()) throw Error("请选择异常类型并填写说明");
    const selectedFiles = files.value.flatMap((file) => (file.raw ? [file.raw] : [])),
      type = exceptionType.value,
      text = description.value.trim();
    await ElMessageBox.confirm("登记后等待审核。审核通过后停用原码，新码需另行申请。", "确认登记二维码异常", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
    });
    if (!active()) return;
    busy.value = true;
    const ids = await commands.upload(selectedFiles);
    if (!active()) return;
    const r = (await commands.command(
      "/api/admin/prop-qr-exceptions",
      {
        qrId,
        exceptionType: type,
        description: text,
        evidence: ids.map((uploadId) => ({ kind: "upload", uploadId })),
      },
      "create_qr_exception"
    )) as CommandResult;
    if (!active()) return;
    qrDialog.value = null;
    const result = await api<QrException>("/api/admin/prop-qr-exceptions/" + r.targetId);
    if (!active()) return;
    exception.value = result;
    asset.value = null;
    review.value = null;
  } catch (e) {
    if (e !== "cancel" && e !== "close" && active()) fail(e);
  } finally {
    if (active()) busy.value = false;
  }
}
async function issue() {
  if (!qr.value || busy.value || pending.value || !reason.value.trim()) return;
  const owner = view.capture(),
    sequence = detailSequence,
    qrId = qr.value.id;
  const active = () => view.current(owner) && sequence === detailSequence && qr.value?.id === qrId;
  const body = {
    targetType: qr.value.targetType,
    targetId: qr.value.targetId,
    supersedesQrId: qrId,
    reason: reason.value.trim(),
  };
  try {
    await ElMessageBox.confirm("生成新码仍对应当前目标，旧码保留，实物数量与状态不变。", "确认独立发码", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
    });
    if (!active()) return;
    busy.value = true;
    const r = (await commands.command("/api/admin/prop-qr/issue", body, "issue_qr")) as CommandResult;
    if (!active()) return;
    qrDialog.value = null;
    busy.value = false;
    await refreshSelected();
    if (active()) {
      const issued = await loadQr(r.targetId);
      if (issued && asset.value) qrDialog.value = "label";
    }
  } catch (e) {
    if (e !== "cancel" && e !== "close" && active()) fail(e);
  } finally {
    if (active()) busy.value = false;
  }
}
async function changeDetailPage(kind: "sn" | "movement" | "reservation", delta: number) {
  try {
    if (kind === "sn") snPage.value += delta;
    else if (kind === "movement") movementPage.value += delta;
    else reservationPage.value += delta;
    if (kind === "reservation") await occupied();
    else await inventory();
  } catch (e) {
    fail(e);
  }
}
async function assetInventory(part: "sn" | "movement") {
  if (part === "sn") snPage.value = 1;
  else movementPage.value = 1;
  const owner = view.capture(),
    selected = detailSequence;
  message.value = "";
  busy.value = true;
  try {
    if (asset.value && !asset.value.inventorySummary) {
      const latest = await api<OwnedSku>("/api/admin/prop-assets/" + asset.value.id);
      if (!view.current(owner) || selected !== detailSequence) return;
      asset.value = latest;
    }
    await inventory();
  } catch (e) {
    if (view.current(owner) && selected === detailSequence) fail(e);
  } finally {
    if (view.current(owner) && selected === detailSequence) busy.value = false;
  }
}
async function selectAssetQr(id: string, action?: QrAction) {
  qrDialog.value = null;
  qr.value = null;
  const selected = await loadQr(id);
  if (!selected) return;
  if (!action) qrDialog.value = "label";
  else if (selected.status === (action === "register" ? "bound" : "revoked")) openQrForm(action);
  else message.value = "标签状态已变化，请重新查看当前标签。";
}
function qrAction(action: QrAction) {
  if (!asset.value) return;
  if (asset.value.assetType === "A_ASSET") {
    qrSequence++;
    clearTimeout(poll);
    qrDialog.value = action === "register" ? "pick-register" : "pick-issue";
    return;
  }
  const id = asset.value.currentQrId || asset.value.latestQrId;
  if (id) void selectAssetQr(id, action);
}
function clearQrPreview() {
  qrSequence++;
  clearTimeout(poll);
  qr.value = null;
}
function closeQrDialog() {
  qrDialog.value = null;
  if (asset.value) clearQrPreview();
}
const reviewRows = computed(() => rows.value.filter((r): r is ReviewRow => "sourceType" in r));
const current = computed(() => asset.value || review.value || exception.value);
onMounted(async () => {
  pending.value = !!commands.pending();
  const owner = view.capture();
  if (props.kind === "reviews") {
    await load();
    return;
  }
  try {
    const value = await api<Options>("/api/public/props/options");
    if (view.current(owner)) options.value = value;
  } catch (e) {
    if (view.current(owner)) fail(e);
  }
  if (view.current(owner)) await load();
});
</script>
<template>
  <section
    :class="
      kind === 'assets' && !exception
        ? 'asset-workspace'
        : ['prop-admin', { 'review-workspace': kind === 'reviews' }]
    ">
    <header v-if="kind === 'assets' && !exception" class="asset-head">
      <div>
        <h1>
          {{
            reservationOverview
              ? "租期信息"
              : asset
              ? "道具资产详情 · " + (asset.assetType === "A_ASSET" ? "A 类实物" : "B 类数量台账")
              : "道具资产与租期"
          }}
        </h1>
        <p>
          {{
            reservationOverview
              ? "已登记租期与占用状态"
              : asset
              ? "分区查看完整资料、明细与来源记录；本页只读，不修改领域数据"
              : "A 类按实物逐件统计，B 类读取数量台账。指定日期的可租数量请在“租期”中查询。"
          }}
        </p>
      </div>
      <div v-if="reservationOverview" class="asset-head-actions">
        <el-button link class="asset-link" @click="closeRent">
          {{ asset ? "返回资产详情" : "返回资产列表" }}
        </el-button>
      </div>
      <div v-else-if="asset" class="asset-head-actions">
        <el-button link class="asset-link" @click="backToList">返回资产列表</el-button>
        <el-button link class="asset-link" @click="showRent(asset)">查看租期</el-button>
        <template v-if="allow('prop-qr', 'manage')">
          <el-button
            link
            class="asset-link"
            :disabled="
              busy ||
              (asset.assetType === 'A_ASSET' ? !sn?.total || Number(sn.total) === 0 : !asset.currentQrId)
            "
            @click="qrAction('register')">
            登记二维码异常
          </el-button>
          <el-button
            link
            class="asset-link"
            :disabled="
              busy ||
              (asset.assetType === 'A_ASSET' ? !Number(sn?.total) : !asset.latestQrId || !!asset.currentQrId)
            "
            @click="qrAction('issue')">
            独立正常发码
          </el-button>
        </template>
      </div>
    </header>
    <header v-else>
      <div>
        <h1>
          {{
            review
              ? review.sourceType === "sku_audit"
                ? ["create", "update"].includes(review.actionType)
                  ? "道具 SKU 审核"
                  : "上下架审核详情"
                : "库存调整审核详情"
              : config.title
          }}
        </h1>
        <p class="muted">
          {{
            props.kind === "reviews"
              ? "汇总 SKU 资料、A/B 类库存调整和上下架申请，按来源分别审核。"
              : props.kind === "assets"
              ? "查看 SKU、实物、数量库存和已登记租期。"
              : "异常审核只停用原码，新码需另行发起正常发码。"
          }}
        </p>
      </div>
      <el-button v-if="kind !== 'reviews'" @click="load" :disabled="busy">刷新列表</el-button>
      <el-button v-else-if="review" @click="backToList">返回审核列表</el-button>
    </header>
    <div v-if="message" class="notice error" role="alert">{{ message }}</div>
    <div v-if="pending" class="notice">
      有一笔操作结果待核实，请先恢复原操作。
      <el-button @click="recover(false)" :disabled="busy">查询原结果</el-button>
      <el-button @click="recover(true)" :disabled="busy">按原正文重试</el-button>
    </div>
    <MetricStrip
      v-if="kind === 'qr-exceptions' && exceptionCounts && !current && !busy && !message"
      :items="[
        { label: '待处理', value: exceptionCounts.reported },
        { label: '疑似泄露', value: exceptionCounts.suspectedLeak },
        { label: '今日已处理', value: exceptionCounts.resolvedToday },
        { label: '今日已取消', value: exceptionCounts.cancelledToday },
      ]" />
    <ReviewList
      v-if="kind === 'reviews' && !current"
      :rows="reviewRows"
      :counts="pendingCounts"
      :total="total"
      :page="page"
      :message="message"
      :busy="busy"
      v-model:status="status"
      v-model:category="reviewCategory"
      v-model:asset="assetType"
      v-model:factory="factoryKeyword"
      v-model:keyword="keyword"
      v-model:source="source"
      v-model:factory-id="factoryId"
      @reset="resetListFilters"
      @search="
        page = 1;
        load();
      "
      @turn="
        (step) => {
          page += step;
          load();
        }
      "
      @open="open" />
    <AssetList
      v-else-if="kind === 'assets' && !current && !reservationOverview"
      :rows="assetRows"
      :options="options"
      :styles="styleCodes"
      :busy="busy"
      :error="message"
      :page="page"
      :total="total"
      v-model:factory="factoryKeyword"
      v-model:keyword="keyword"
      v-model:asset-type="assetType"
      v-model:status="status"
      v-model:type="typeCode"
      v-model:factory-id="factoryId"
      @update:styles="setStyles"
      @open="open"
      @rent="showRent"
      @reset="resetListFilters"
      @search="
        page = 1;
        load();
      "
      @turn="
        (step) => {
          page += step;
          load();
        }
      " />
    <AssetDetail
      v-else-if="asset && !reservationOverview"
      :asset="asset"
      :stock="stock"
      :sn="sn"
      :summary="summary"
      :movements="movements"
      :sn-page="snPage"
      :movement-page="movementPage"
      :error="message"
      :busy="busy"
      :can-read-qr="!!allow('prop-qr', 'read')"
      :can-view-images="!!allow('prop-asset', 'sensitive')"
      v-model:sn-status="snStatus"
      v-model:movement-type="movementType"
      v-model:movement-source="movementSource"
      v-model:movement-start="movementStart"
      v-model:movement-end="movementEnd"
      @image="image"
      @qr="selectAssetQr"
      @reset="resetInventory"
      @inventory="assetInventory"
      @turn="changeDetailPage" />
    <section v-else-if="kind === 'qr-exceptions' && !current" class="panel">
      <div class="panel-head">
        <b>{{ config.title }}</b>
        <span>共 {{ total }} 条</span>
      </div>
      <DeskFilters
        :busy="busy"
        @search="
          page = 1;
          load();
        "
        @reset="resetListFilters">
        <el-form-item label="道具名称 / 编号">
          <el-input v-model="keyword" placeholder="道具名称 / 编号" maxlength="128" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="status"
            :empty-values="[null, undefined]"
            placeholder="请选择"
            popper-class="desk-select-menu">
            <el-option
              v-for="s in ['all', 'reported', 'resolved', 'cancelled']"
              :value="s"
              :label="label(s)" />
          </el-select>
        </el-form-item>
        <el-form-item label="工厂名称">
          <el-input v-model="factoryKeyword" placeholder="工厂名称" clearable />
        </el-form-item>
        <el-form-item label="工厂编号">
          <el-input v-model="factoryId" placeholder="工厂编号（可选）" clearable />
        </el-form-item>
        <el-form-item label="异常类型">
          <el-select
            v-model="exceptionFilter"
            :empty-values="[null, undefined]"
            placeholder="全部异常类型"
            popper-class="desk-select-menu">
            <el-option value="" label="全部异常类型" />
            <el-option value="suspected_leak" label="疑似泄露" />
            <el-option value="wrong_binding" label="绑定错误" />
            <el-option value="unreadable_untrusted" label="无法识别 / 不可信" />
            <el-option value="other" label="其他" />
          </el-select>
        </el-form-item>
      </DeskFilters>
      <div class="table-scroll">
        <DeskTable
          :data="rows.filter((r) => 'qrCode' in r)"
          :empty-text="busy ? '正在读取…' : message ? '读取失败' : '暂无符合条件的记录'">
          <el-table-column label="异常编号" min-width="138">
            <template #default="{ row: r }">{{ r.exceptionNo }}</template>
          </el-table-column>
          <el-table-column label="二维码" min-width="94">
            <template #default="{ row: r }">{{ r.qrCode }}</template>
          </el-table-column>
          <el-table-column label="绑定对象" min-width="94">
            <template #default="{ row: r }">{{ r.propName }} · {{ r.snCode || r.skuCode }}</template>
          </el-table-column>
          <el-table-column label="工厂" min-width="94">
            <template #default="{ row: r }">{{ r.factoryName }}</template>
          </el-table-column>
          <el-table-column label="异常类型" min-width="94">
            <template #default="{ row: r }">{{ label(r.exceptionType) }}</template>
          </el-table-column>
          <el-table-column label="登记时间" min-width="138">
            <template #default="{ row: r }">{{ time(r.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="处理时间" min-width="138">
            <template #default="{ row: r }">{{ time(r.resolvedAt) || "—" }}</template>
          </el-table-column>
          <el-table-column label="异常状态" min-width="94">
            <template #default="{ row: r }">
              <span class="desk-status">
                {{ label(r.exceptionStatus === "cancelled" ? "qr_cancelled" : r.exceptionStatus) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" fixed="right" :show-overflow-tooltip="false" width="104">
            <template #default="{ row: r }">
              <el-button @click="open(r)" size="small" link class="desk-row-link">详情</el-button>
            </template>
          </el-table-column>
        </DeskTable>
      </div>

      <DeskPager
        :page="page"
        :total="total"
        :busy="busy"
        @turn="
          page += $event;
          load();
        " />
    </section>
    <template v-else-if="review || exception">
      <el-button v-if="!review" @click="backToList">返回列表</el-button>
      <div class="detail-layout">
        <main class="panel">
          <div class="panel-head">
            <b>
              {{
                (review &&
                  (review.sourceType === "sku_audit"
                    ? names[review.actionType] + "审核"
                    : names[review.sourceType])) ||
                exception?.exceptionNo
              }}
            </b>
            <span class="badge">
              {{
                review
                  ? names[review.auditStatus]
                  : names[
                      exception!.exceptionStatus === "cancelled" ? "qr_cancelled" : exception!.exceptionStatus
                    ]
              }}
            </span>
          </div>
          <template v-if="review">
            <div class="review-summary">
              <strong>{{ review.id }}</strong>
              <p>
                {{ review.propName }} · {{ review.assetType === "A_ASSET" ? "A 类资产型" : "B 类数量型" }} ·
                {{ review.factoryName }}
              </p>
            </div>
            <nav class="review-jumps" aria-label="审核资料分区">
              <el-button @click="jump('review-facts')">本次申请</el-button>
              <el-button v-if="review.sourceType === 'sku_audit'" @click="jump('review-fields')">
                道具资料
              </el-button>
              <el-button @click="jump('review-handling')">前往处理区 ↓</el-button>
            </nav>
            <h3 id="review-facts">本次申请</h3>
            <dl class="desk-facts">
              <div>
                <dt>道具 / SKU</dt>
                <dd>{{ review.propName }} · {{ review.skuCode }}</dd>
              </div>
              <div>
                <dt>申请工厂</dt>
                <dd>{{ review.factoryName }}</dd>
              </div>
              <div>
                <dt>申请动作</dt>
                <dd>
                  {{ names[review.sourceType === "sku_audit" ? review.actionType : review.adjustmentType] }}
                </dd>
              </div>
              <div>
                <dt>提交人 / 时间</dt>
                <dd>{{ review.applicantName }} · {{ time(review.submittedAt) }}</dd>
              </div>
              <div>
                <dt>申请说明</dt>
                <dd>{{ review.applyRemark || "—" }}</dd>
              </div>
              <div>
                <dt>审核状态</dt>
                <dd>{{ names[review.auditStatus] }}</dd>
              </div>
              <div>
                <dt>当前 SKU 状态 / 版本</dt>
                <dd>{{ names[review.currentSkuStatus] }} · {{ review.currentSkuVersion }}</dd>
              </div>
              <div>
                <dt>处理意见</dt>
                <dd>{{ review.auditRemark || review.rejectReason || "—" }}</dd>
              </div>
              <div>
                <dt>处理时间</dt>
                <dd>{{ time(review.reviewedAt) }}</dd>
              </div>
            </dl>
            <template v-if="review.sourceType === 'sku_audit'">
              <p>
                申请动作：{{ names[review.actionType] || review.actionType }} · 初始数量
                {{ review.initialQuantity ?? "不适用" }}
              </p>
              <p>
                {{ names[review.beforeSkuStatus || ""] || "—" }} →
                {{ names[review.targetSkuStatus || ""] || "—" }}
              </p>
              <h3 id="review-fields">道具资料 · 提交快照</h3>
              <Fields grid :fields="review.proposed" :options="options" @view="image" />
              <details v-if="review.before">
                <summary>提交前资料</summary>
                <Fields grid :fields="review.before" :options="options" @view="image" />
              </details>
              <details>
                <summary>当前资料</summary>
                <p>
                  {{ names[review.currentFillStatus] || review.currentFillStatus }}
                  · 更新于 {{ time(review.currentUpdatedAt) }}
                </p>
                <Fields grid :fields="review.current" :options="options" @view="image" />
              </details>
            </template>
            <template v-else-if="review.sourceType === 'sn_adjustment'">
              <p>
                {{ names[review.adjustmentType] }} {{ review.quantity }} 件 ·
                {{ review.abnormalResult ? names[review.abnormalResult] : "" }}
              </p>
              <div class="table-scroll">
                <DeskTable :data="review.items" empty-text="暂无记录">
                  <el-table-column label="SN" min-width="94" prop="snCodeSnapshot" />
                  <el-table-column label="提交时状态" min-width="94">
                    <template #default="{ row: i }">{{ names[i.beforeStatus] }}</template>
                  </el-table-column>
                  <el-table-column label="目标状态" min-width="94">
                    <template #default="{ row: i }">{{ names[i.targetStatus] }}</template>
                  </el-table-column>
                  <el-table-column label="当前状态 / 时间 / 备注" min-width="138">
                    <template #default="{ row: i }">
                      {{ names[i.currentStatus] }} · {{ time(i.currentStatusChangedAt) }} ·
                      {{ i.currentStatusRemark || "—" }}
                    </template>
                  </el-table-column>
                  <el-table-column label="说明" min-width="94">
                    <template #default="{ row: i }">{{ i.remark || "—" }}</template>
                  </el-table-column>
                </DeskTable>
              </div>
              <p>
                当前管理总量 {{ review.currentSummary.total }} · 空闲 {{ review.currentSummary.idle }} · 维修
                {{ review.currentSummary.repairing }}
              </p>
            </template>
            <template v-else>
              <p>
                {{ names[review.adjustmentType] }} {{ review.quantityDelta }} ·
                {{ review.abnormalResult ? names[review.abnormalResult] : "" }}
              </p>
              <p>
                申请时总量 / 可用 {{ review.beforeTotalQuantity }} /
                {{ review.beforeAvailableQuantity }}
              </p>
              <p>
                当前总量 / 可用 {{ review.currentStock.totalQuantity }} /
                {{ review.currentStock.availableQuantity }}
              </p>
              <p class="notice">按审核时当前可用库存核对，累计丢失和报废不重复扣减基数。</p>
            </template>
          </template>
          <template v-if="exception">
            <dl class="facts">
              <dt>异常类型</dt>
              <dd>
                {{ names[exception.exceptionType] || exception.exceptionType }}
              </dd>
              <dt>所属工厂 / SKU</dt>
              <dd>
                {{ exception.factoryName }}
                <br />
                {{ exception.propName }} ·
                {{ exception.skuCode }}
              </dd>
              <dt>原码 / SN</dt>
              <dd>
                {{ exception.qrCode }}
                <br />
                {{ exception.snCode || "B 类 SKU" }}
              </dd>
              <dt>异常说明</dt>
              <dd>{{ exception.description }}</dd>
              <dt>登记人</dt>
              <dd>{{ exception.reportedByUserId || "历史记录未保存" }}</dd>
              <dt>登记时间</dt>
              <dd>{{ time(exception.createdAt) }}</dd>
              <dt>处理人 / 方式</dt>
              <dd>
                {{ exception.resolvedByAdminUserId || "—" }} /
                {{ names[exception.resolutionType || ""] || "—" }}
              </dd>
              <dt>替代码记录</dt>
              <dd>{{ exception.replacementQrId || "无" }}</dd>
              <dt>处理原因</dt>
              <dd>{{ exception.resolutionReason || "尚未处理" }}</dd>
              <dt>处理时间</dt>
              <dd>{{ time(exception.resolvedAt) }}</dd>
            </dl>
            <el-button v-if="qr" @click="clearQrPreview">收起原码状态</el-button>
            <el-button v-else @click="loadQr(exception.originalQrId)">查看原码状态</el-button>
            <div class="evidence">
              <el-button v-for="(e, i) in exception.evidence" :key="i" @click="image(e.locator)">
                <img v-if="e.preview" :src="e.preview.url" alt="异常证据" />
                <span v-else>授权查看证据 {{ i + 1 }}</span>
              </el-button>
            </div>
          </template>
        </main>
        <aside class="panel" :id="review ? 'review-handling' : undefined">
          <h3>{{ asset ? "查看说明" : "审核处理" }}</h3>
          <p v-if="review && (!allow('prop-review', 'review') || (!review.canApprove && !review.canReject))">
            当前申请只读 · {{ names[review.auditStatus] }}
          </p>
          <template v-else-if="review || exception">
            <div v-if="review?.approvalBlockReason" class="notice error">
              {{ errorText[review.approvalBlockReason] || review.approvalBlockReason }}；仍可按当前版本驳回。
            </div>
            <label>
              审核原因
              <el-input v-model="reason" maxlength="255" placeholder="请填写原因" type="textarea" />
            </label>
            <div class="actions">
              <el-button
                :disabled="busy || pending || !(review?.canReject || exception?.canReject)"
                @click="decide(false)">
                驳回
              </el-button>
              <el-button
                class="dark"
                :disabled="busy || pending || !(review?.canApprove || exception?.canApprove)"
                @click="decide(true)">
                审核通过
              </el-button>
            </div>
          </template>
          <p v-else class="muted">资料和库存只读。实物数量由申请审批变更；订单履约不在此页办理。</p>
          <el-button @click="refreshSelected" :disabled="busy">刷新当前资料</el-button>

          <AssetQrCard
            v-if="qr"
            :qr="qr"
            :manage="!!allow('prop-qr', 'manage')"
            @register="openQrForm('register')"
            @issue="openQrForm('issue')"
            @refresh="loadQr(qr.id)"
            @retry="retryImage" />
        </aside>
      </div>
    </template>
    <section v-if="reservationOverview" class="asset-panel">
      <div class="asset-panel-head">
        <b>已登记租期</b>
        <span v-if="rentSku">{{ rentSku.fields.propName }} · {{ rentSku.skuCode }}</span>
      </div>
      <el-form
        class="asset-query-inline"
        label-suffix="："
        @submit.prevent="
          reservationPage = 1;
          occupied();
        ">
        <el-form-item label="SKU">
          <el-input v-model.trim="reservationKeyword" clearable placeholder="请输入 SKU 或 SN" />
        </el-form-item>
        <DateRangeFields
          v-model:start="startDate"
          v-model:end="endDate"
          @update:start="invalidateForecast"
          @update:end="invalidateForecast" />
        <el-form-item label="占用状态">
          <el-select
            v-model="reservationStatus"
            clearable
            placeholder="全部"
            popper-class="asset-select-menu">
            <el-option
              v-for="s in [
                'held',
                'paid_locked',
                'renting',
                'overdue_holding',
                'disputed_holding',
                'released',
                'cancelled',
                'expired',
                'completed',
              ]"
              :key="s"
              :value="s"
              :label="s === 'cancelled' ? '已取消' : label(s)" />
          </el-select>
        </el-form-item>
        <el-button native-type="submit" type="primary" class="asset-submit" :disabled="rentLoading">
          查询
        </el-button>
        <el-button :disabled="rentLoading" @click="resetRentFilters">重置</el-button>
        <el-button v-if="rentSku" :disabled="!startDate || !endDate || endDate < startDate" @click="predict">
          预测可租数量
        </el-button>
      </el-form>
      <p v-if="availability" class="asset-empty">
        {{ availability.startDate }} 至 {{ availability.endDate }} · 最多可租
        {{ availability.maxRentableQuantity }} 件
      </p>
      <DeskTable
        row-key="id"
        :data="reservations?.items ?? []"
        :empty-text="rentLoading ? '正在读取租期…' : message ? '租期读取失败' : '暂无已登记占用'">
        <el-table-column prop="id" label="占用编号" min-width="160" />
        <el-table-column label="SKU / SN" min-width="150">
          <template #default="{ row }">{{ row.snCode || row.skuCode }}</template>
        </el-table-column>
        <el-table-column label="租期区间" min-width="230">
          <template #default="{ row }">
            {{ row.rentalStartDate }} — {{ row.rentalEndDate }} · 占用 {{ row.occupyStartDate }} —
            {{ row.occupyEndDate }}
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="70" />
        <el-table-column label="占用状态" width="110">
          <template #default="{ row }">
            {{ row.reservationStatus === "cancelled" ? "已取消" : label(row.reservationStatus) }}
          </template>
        </el-table-column>
        <el-table-column label="来源订单" min-width="165">
          <template #default="{ row }">
            {{
              [row.rentalOrderId, names[row.sourceType] || row.sourceType, row.sourceId]
                .filter(Boolean)
                .join(" · ") || "—"
            }}
          </template>
        </el-table-column>
      </DeskTable>
      <DeskPager
        :page="reservationPage"
        :total="reservations?.total || 0"
        :busy="rentLoading"
        @turn="(step) => changeDetailPage('reservation', step)" />
    </section>
    <ElDialog
      v-if="qrDialog === 'pick-register' || qrDialog === 'pick-issue'"
      :model-value="true"
      title="选择实物标签"
      class="asset-dialog"
      width="min(600px, 94vw)"
      align-center
      append-to-body
      @close="closeQrDialog">
      <DeskTable row-key="id" :data="sn?.items ?? []" empty-text="暂无实物记录">
        <el-table-column prop="snCode" label="SN 编号" min-width="180" />
        <el-table-column label="实物状态" width="92">
          <template #default="{ row }">{{ names[row.instanceStatus] }}</template>
        </el-table-column>
        <el-table-column label="操作" width="82">
          <template #default="{ row }">
            <el-button
              size="small"
              :disabled="
                qrDialog === 'pick-register' ? !row.currentQrId : !!row.currentQrId || !row.latestQrId
              "
              @click="
                selectAssetQr(
                  row.currentQrId || row.latestQrId,
                  qrDialog === 'pick-register' ? 'register' : 'issue'
                )
              ">
              选择
            </el-button>
          </template>
        </el-table-column>
      </DeskTable>
      <DeskPager
        v-if="sn"
        :page="snPage"
        :total="sn.total"
        :busy="busy"
        @turn="(step) => changeDetailPage('sn', step)" />
    </ElDialog>
    <ElDialog
      v-if="asset && qrDialog === 'label'"
      :model-value="true"
      title="道具标签"
      class="asset-dialog"
      width="min(620px, 94vw)"
      align-center
      append-to-body
      @close="closeQrDialog">
      <AssetQrCard
        v-if="qr"
        :qr="qr"
        :manage="!!allow('prop-qr', 'manage')"
        @register="openQrForm('register')"
        @issue="openQrForm('issue')"
        @refresh="loadQr(qr.id)"
        @retry="retryImage" />
    </ElDialog>
    <ElDialog
      :model-value="!!picture"
      title="授权原图"
      class="asset-dialog"
      width="min(800px, 94vw)"
      align-center
      append-to-body
      @close="picture = null">
      <ElImage v-if="picture" :src="picture.url" class="asset-original" fit="contain" alt="授权原图">
        <template #error>图片加载失败，请关闭后重新查看</template>
      </ElImage>
    </ElDialog>
    <ElDialog
      v-if="qrDialog === 'register' || qrDialog === 'issue'"
      :title="qrDialog === 'register' ? '二维码异常登记' : '独立正常发码'"
      :model-value="true"
      class="asset-dialog"
      width="min(540px, 94vw)"
      align-center
      append-to-body
      :show-close="!busy"
      :close-on-press-escape="!busy"
      :close-on-click-modal="!busy"
      @close="closeQrDialog">
      <p class="dialog-context">{{ qr?.propName }} · {{ qr?.snCode || qr?.skuCode }}</p>
      <el-form label-position="top">
        <template v-if="qrDialog === 'register'">
          <el-form-item label="异常类型" required>
            <el-select v-model="exceptionType" placeholder="请选择异常类型" popper-class="asset-select-menu">
              <el-option value="suspected_leak" label="疑似泄露" />
              <el-option value="wrong_binding" label="绑定对象不符" />
              <el-option value="unreadable_untrusted" label="无法识别或可信性异常" />
              <el-option value="other" label="其他" />
            </el-select>
          </el-form-item>
          <el-form-item label="异常说明" required>
            <el-input v-model="description" type="textarea" :rows="3" maxlength="500" show-word-limit />
          </el-form-item>
          <el-form-item label="证据照片">
            <ElUpload
              v-model:file-list="files"
              action="#"
              multiple
              accept="image/png,image/jpeg"
              :auto-upload="false"
              :limit="4"
              :on-exceed="() => (message = '最多选择4张证据照片')">
              <el-button>选择照片</el-button>
              <template #tip>
                <div class="el-upload__tip">最多 4 张，每张不超过 5 MiB，支持 JPG、PNG。</div>
              </template>
            </ElUpload>
          </el-form-item>
        </template>
        <el-form-item v-else label="发码说明" required>
          <el-input v-model="reason" type="textarea" :rows="3" maxlength="255" show-word-limit />
        </el-form-item>
      </el-form>
      <el-alert v-if="message" :title="message" type="error" :closable="false" />
      <template #footer>
        <el-button :disabled="busy" @click="closeQrDialog">取消</el-button>
        <el-button
          v-if="qrDialog === 'register'"
          type="primary"
          :disabled="busy || pending || !exceptionType || !description.trim()"
          @click="registerException">
          确认登记
        </el-button>
        <el-button v-else type="primary" :disabled="busy || pending || !reason.trim()" @click="issue">
          确认生成新码
        </el-button>
      </template>
    </ElDialog>
  </section>
</template>
<style scoped>
.prop-admin {
  min-width: 0;
}
.prop-admin header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 24px;
}
.prop-admin h1 {
  margin: 8px 0;
  font-size: 26px;
}
.crumb,
.muted {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.7;
}
.panel {
  border: 1px solid #e7e8ec;
  border-radius: 10px;
  background: white;
  margin: 16px 0;
  padding: 20px;
  min-width: 0;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.filters,
.pager,
.actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.filters {
  margin: 18px 0;
}
.style-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  flex-basis: 100%;
  padding: 6px 0;
}
.style-options label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  cursor: pointer;
}
.style-options input {
  margin: 0;
  padding: 0;
  accent-color: #181b20;
}
.pager {
  justify-content: flex-end;
  margin-top: 20px;
}
button,
select,
input,
textarea {
  font: inherit;
  border: 1px solid #d9dce1;
  border-radius: 6px;
  padding: 9px 12px;
  background: white;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.dark {
  background: #14171c;
  color: white;
}
.notice {
  padding: 14px;
  background: #fff8dc;
  margin: 12px 0;
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.error {
  background: #fff0ee;
  color: #9f2821;
}
.table-scroll {
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 760px;
}
th {
  background: #f7f8fa;
  color: #6b7280;
  text-align: left;
  white-space: nowrap;
}
td,
th {
  padding: 14px 12px;
  border-bottom: 1px solid #eceef2;
  vertical-align: top;
}
td {
  max-width: 260px;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
small {
  display: block;
  color: #7b8190;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.badge {
  border-radius: 14px;
  background: #f5eed1;
  padding: 4px 9px;
  font-size: 12px;
  white-space: nowrap;
}
.empty {
  text-align: center;
  color: #7b8190;
  padding: 34px;
}
.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  align-items: start;
}
.detail-layout aside {
  position: sticky;
  top: 16px;
}
.facts {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 14px;
  font-size: 14px;
}
.facts dt {
  color: #777;
}
.facts dd {
  margin: 0;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
h3 {
  font-size: 17px;
  margin: 24px 0 14px;
}
details {
  padding: 16px 0;
  border-top: 1px solid #eee;
}
summary {
  cursor: pointer;
  font-weight: 600;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.stats > div {
  padding: 12px;
  background: #f8f9fa;
  text-align: center;
}
.qr {
  border-top: 1px solid #eee;
  margin-top: 24px;
}
.qr img {
  width: 100%;
  margin: 16px 0;
}
.qr button {
  display: block;
  width: 100%;
  margin: 10px 0;
}
label {
  display: block;
  font-size: 14px;
  margin: 18px 0;
}
label textarea,
label select {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 8px;
}
textarea {
  min-height: 110px;
  resize: vertical;
}
.evidence {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.evidence img {
  width: 120px;
  height: 100px;
  object-fit: cover;
}
.full-image {
  max-width: 100%;
  display: block;
  margin: auto;
}
@media (max-width: 1050px) {
  .detail-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .detail-layout aside {
    position: static;
  }
}
.actions {
  margin-top: 14px;
}
.review-workspace {
  padding: 0;
  max-width: none;
}
.review-workspace > header {
  align-items: flex-end;
  margin: 0 0 13px;
}
.review-workspace > header h1 {
  margin: 0;
  font-size: 22px;
}
.review-workspace > header p {
  margin: 5px 0 0;
  font-size: 10px;
  line-height: 1.5;
}
.review-workspace .detail-layout {
  display: block;
}
.review-workspace .detail-layout aside {
  position: static;
}
.review-workspace .detail-layout .panel {
  padding: 14px;
  margin: 0 0 12px;
  border-radius: 7px;
}
.review-workspace .facts {
  display: grid;
  grid-template-columns: minmax(120px, 18%) minmax(0, 1fr);
  font-size: 12px;
  gap: 8px;
}
.review-workspace > header button {
  font-size: 11px;
}
.review-workspace .review-summary strong {
  font-size: 17px;
}
.review-summary p {
  font-size: 11px;
  color: #657080;
}
.review-jumps {
  display: flex;
  gap: 7px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}
.review-jumps button {
  font-size: 10px;
  padding: 5px 9px;
}
.review-workspace .desk-facts {
  padding: 0;
  font-size: 12px;
}
.review-workspace .detail-layout h3 {
  font-size: 14px;
  margin: 18px 0 12px;
}
.review-workspace .panel-head {
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 10px;
}
</style>

<style src="./asset-workspace.css"></style>
