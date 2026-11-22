const http = require("./http"),
  shared = require("./verification"),
  session = require("../session/storage");
const root = "/api/me/";
let draft = null;
session.subscribe(() => {
  draft = null;
});
function request(path, method = "GET", data, key) {
  return http
    .request(
      root + path,
      method,
      false,
      data,
      key ? { "Idempotency-Key": key } : {},
    )
    .then((data) =>
      require("./factory-contract").assertResponse(root + path, method, data),
    );
}
function existing(f) {
  const x = { ...f };
  delete x.specialtyCategoryNames;
  for (const k of ["factoryAvatar", "businessLicense"])
    x[k] = { kind: "existing", locator: x[k] };
  x.factoryPhotos = x.factoryPhotos.map((locator) => ({
    kind: "existing",
    locator,
  }));
  x.cases = x.cases.map((c) => ({
    ...c,
    images: c.images.map((locator) => ({ kind: "existing", locator })),
  }));
  return x;
}
// 本地图片仅在用户最终确认提交后上传；两个worker共用现有上传/会话边界。
async function materialize(fields) {
  const owner = session.capture(),
    x = JSON.parse(JSON.stringify(fields)),
    jobs = [];
  function slot(parent, key, purpose) {
    const v = parent[key];
    if (v && v.localPath)
      jobs.push(async () => {
        const uploadId = await shared.upload("factory", v.localPath, purpose);
        session.assertCurrent(owner);
        parent[key] = { kind: "upload", uploadId };
      });
  }
  slot(x, "factoryAvatar", "factory_avatar");
  slot(x, "businessLicense", "business_license");
  x.factoryPhotos.forEach((_, i) => slot(x.factoryPhotos, i, "factory_photo"));
  x.cases.forEach((c) =>
    c.images.forEach((_, i) => slot(c.images, i, "service_case")),
  );
  let cursor = 0,
    failure = null;
  async function work() {
    while (!failure && cursor < jobs.length) {
      const task = jobs[cursor++];
      try {
        await task();
      } catch (e) {
        failure = failure || e;
      }
    }
  }
  await Promise.all([work(), work()]);
  if (failure) throw failure;
  session.assertCurrent(owner);
  return x;
}
function save(value) {
  draft = { owner: session.capture(), value };
}
function read() {
  return draft && session.isCurrent(draft.owner) ? draft.value : null;
}
const domain = (mode) =>
  mode === "change" ? "factory-profile-changes" : "factory-onboarding";
async function submit(d, acceptedRules) {
  const owner = session.capture(),
    name = domain(d.mode);
  let key = shared.pending(name, d.userId);
  if (key) {
    try {
      const original = await request(name + "/by-request/" + key);
      session.assertCurrent(owner);
      shared.forget(name, d.userId);
      return original;
    } catch (e) {
      if (e.outcome !== "business-rejection" || e.status !== 404)
        throw e; /* 刷新丢失内存正文时，由本人重填后仍使用原键；若原单稍后提交，服务端摘要校验阻止改写。 */
    }
  }
  if (!d.body) {
    const f = await materialize(d.fields);
    d.body =
      d.mode === "change"
        ? {
            previousApplicationId: d.previous,
            baseProfileVersion: d.version,
            phoneVerificationProof: null,
            proposed: f,
          }
        : { previousApplicationId: d.previous, acceptedRules, materials: f };
  }
  if (!key) {
    key = await shared.id();
    session.assertCurrent(owner);
    shared.remember(name, d.userId, key);
  }
  let out;
  try {
    out = await request(name, "POST", d.body, key);
  } catch (e) {
    if (
      e.outcome === "business-rejection" &&
      !["IDEMPOTENCY_KEY_REUSED", "TOO_MANY_REQUESTS"].includes(e.reason)
    ) {
      shared.forget(name, d.userId);
      d.body = null;
    }
    throw e;
  }
  session.assertCurrent(owner);
  shared.forget(name, d.userId);
  draft = null;
  return out.application;
}
module.exports = {
  request,
  existing,
  materialize,
  save,
  read,
  submit,
  domain,
  shared,
};
