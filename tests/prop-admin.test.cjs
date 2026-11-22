const test = require("node:test"),
  assert = require("node:assert/strict");
const { fixture } = require("./web-fixture.cjs");
function setup() {
  let epoch = 1,
    confirm;
  const requests = [],
    commands = [];
  const mocks = {
    "../../session/state": {
      me: {
        value: {
          permissions: ["admin:prop-review:read", "admin:prop-review:review"],
        },
      },
    },
    "../../session/view": {
      useSessionView: () => ({
        capture: () => epoch,
        current: (x) => x === epoch,
      }),
    },
    "../../api/http": {
      ApiError: class extends Error {},
      isStale: () => false,
      errorText: {},
      refreshCsrf: async () => {},
      api: (url) =>
        new Promise((resolve, reject) =>
          requests.push({ url, resolve, reject }),
        ),
    },
    "../../api/props": {
      names: {},
      time: (x) => x,
      pending: () => null,
      query: () => "",
      command: async (...args) => {
        commands.push(args);
        return { targetId: "new-qr" };
      },
    },
    "./PropFields.vue": {},
    "element-plus/es/components/dialog/style/css": {},
    "element-plus": {
      ElMessageBox: { confirm: () => new Promise((r) => (confirm = r)) },
    },
  };
  const f = fixture({ props: { kind: "reviews" }, mocks });
  const c = f.load("views/props/PropPanel.vue", [
    "open",
    "clear",
    "review",
    "exception",
    "asset",
    "qr",
    "loadQr",
    "selectAssetQr",
    "closeQrDialog",
    "qrDialog",
    "decide",
    "reason",
    "refreshSelected",
    "message",
    "busy",
    "setStyles",
    "styleCodes",
    "page",
    "retryImage",
    "issue",
  ]);
  return {
    c,
    requests,
    commands,
    switchOwner() {
      epoch++;
    },
    confirm: () => confirm(),
  };
}
const row = (id) => ({ id, sourceType: "sku_audit" });
test("late detail and private image selections cannot replace newer selection", async () => {
  const f = setup();
  const first = f.c.open(row("old")),
    second = f.c.open(row("new"));
  f.requests[1].resolve({ id: "new" });
  await second;
  f.requests[0].resolve({ id: "old" });
  await first;
  assert.equal(f.c.review.value.id, "new");
});
test("late refresh cannot overwrite newly selected review", async () => {
  const f = setup();
  f.c.review.value = row("old");
  const first = f.c.refreshSelected(),
    second = f.c.open(row("new"));
  f.requests[1].resolve({ id: "new" });
  await second;
  f.requests[0].resolve({ id: "old" });
  await first;
  assert.equal(f.c.review.value.id, "new");
});
test("confirmation is cancelled if target changes before user confirms", async () => {
  const f = setup();
  f.c.review.value = { ...row("old"), version: 0, canApprove: true };
  f.c.reason.value = "同意";
  const action = f.c.decide(true);
  const next = f.c.open(row("new"));
  f.requests[0].resolve({ id: "new" });
  await next;
  f.confirm();
  await action;
  assert.equal(f.commands.length, 0);
});
test("approval disabled does not disable reject and captures original reason", async () => {
  const f = setup();
  f.c.review.value = {
    ...row("old"),
    version: 2,
    canApprove: false,
    canReject: true,
  };
  f.c.reason.value = "原原因";
  await f.c.decide(true);
  assert.equal(f.commands.length, 0);
  const action = f.c.decide(false);
  f.c.reason.value = "编辑中";
  f.confirm();
  await new Promise((r) => setImmediate(r));
  assert.equal(
    f.commands[0][0],
    "/api/admin/prop-reviews/sku_audit/old/reject",
  );
  assert.equal(f.commands[0][1].reason, "原原因");
  f.switchOwner();
  f.requests[0].resolve({ id: "old" });
  await new Promise((r) => setImmediate(r));
  if (f.requests[1]) f.requests[1].resolve({ items: [], total: "0" });
  await action;
});
test("QR record selection uses newest response, including failure races", async () => {
  const f = setup();
  const old = f.c.loadQr("old"),
    next = f.c.loadQr("new");
  f.requests[1].resolve({ id: "new", status: "bound", imageStatus: "ready" });
  await next;
  f.requests[0].reject(new Error("old failure"));
  await old;
  assert.equal(f.c.qr.value.id, "new");
  assert.equal(f.c.message.value, "");
});
test("closing a QR workflow keeps the asset detail visible after a late label refresh", async () => {
  const f = setup();
  f.c.asset.value = { id: "asset" };
  for (const [action, status] of [["register", "bound"], ["issue", "revoked"]]) {
    const qr = { id: "tag", status, imageStatus: "ready" };
    const open = f.c.selectAssetQr(qr.id, action);
    f.requests.at(-1).resolve(qr);
    await open;
    assert.equal(f.c.qrDialog.value, action);

    const refresh = f.c.loadQr(qr.id);
    f.c.closeQrDialog();
    f.requests.at(-1).resolve(qr);
    await refresh;
    assert.equal(f.c.qrDialog.value, null);
    assert.equal(f.c.qr.value, null);
    assert.equal(f.c.asset.value.id, "asset");
  }
});
test("session switch suppresses late detail", async () => {
  const f = setup();
  const action = f.c.open(row("old"));
  f.switchOwner();
  f.requests[0].resolve({ id: "old" });
  await action;
  assert.equal(f.c.review.value, null);
});

test("admin shared style selection caps three and resets pagination", () => {
  const f = setup();
  f.c.page.value = 8;
  f.c.setStyles(["retro","modern","special_asset"]);
  f.c.setStyles(["retro","modern","special_asset","other"]);
  assert.deepEqual(Array.from(f.c.styleCodes.value), ["retro","modern","special_asset"]);
  assert.equal(f.c.page.value, 1);
  assert.match(f.c.message.value, /最多/);
  f.c.setStyles(["modern","special_asset"]);
  assert.equal(f.c.styleCodes.value.length, 2);
});
test("QR retry cannot act on a different selection after CSRF refresh", async () => {
  const f = setup();
  f.c.qr.value = { id: "old" };
  const retry = f.c.retryImage();
  f.c.qr.value = { id: "new" };
  await retry;
  assert.equal(f.requests.length, 0);
});

test("successful reissue refreshes the asset identity before showing its new QR", async () => {
  const f = setup();
  f.c.asset.value = { id: "sku", currentQrId: null, latestQrId: "old" };
  f.c.qr.value = { id: "old", targetType: "SKU", targetId: "sku" };
  f.c.reason.value = "换发";
  const run = f.c.issue();
  f.confirm();
  await new Promise((r) => setImmediate(r));
  assert.equal(f.requests[0].url, "/api/admin/prop-assets/sku");
  f.requests[0].resolve({
    id: "sku",
    currentQrId: "new-qr",
    latestQrId: "new-qr",
    inventorySummary: null,
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(f.requests[1].url, "/api/admin/prop-qr/new-qr");
  f.requests[1].resolve({
    id: "new-qr",
    status: "bound",
    imageStatus: "ready",
  });
  await run;
  assert.equal(f.c.asset.value.currentQrId, f.c.qr.value.id);
});
