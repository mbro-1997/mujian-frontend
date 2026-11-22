// 正式WXML/WXSS + 隔离真实HTTP响应的浏览器视觉重放；不是原生或真机验收。
const fs = require("node:fs"),
  path = require("node:path");
const { fixture } = require("./support/planning-fixture.cjs");
const root = path.resolve(__dirname, "../miniprogram"),
  output = path.resolve(process.argv[2]);
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const rows = fs
  .readFileSync(path.join(output, "http-success.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map(JSON.parse);
const find = (pattern, predicate = () => true) =>
  rows.find(
    (r) => r.method === "GET" && pattern.test(r.path) && predicate(r.data),
  ).data;
const scheme = find(
    /^\/api\/me\/schemes\/[a-f0-9]+$/,
    (x) => x.items.length > 0 && x.actions.canEdit,
  ),
  checklist = find(
    /^\/api\/me\/checklists\/[a-f0-9]+$/,
    (x) => x.groups.length > 0,
  ),
  address = find(/^\/api\/me\/addresses\/[a-f0-9]+$/);
const api = fixture().load("services/planning.js");
function detailed(data) {
  return {
    id: data.id,
    detail: api.summary(data),
    items: (data.items || data.groups.flatMap((g) => g.items)).map(api.display),
    name: data.name,
    description: data.description || "",
    reason: data.submission ? api.reasons[data.submission.reasonCode] : "",
    rentEstimate: api.money(data.rentEstimateFen || 0),
    hidePrice: false,
    busy: false,
    message: "",
    dirty: false,
    shareReady: false,
    exportId: "",
  };
}
const shared = find(
  /^\/api\/public\/scheme-shares\//,
  (x) => x.hidePrice && x.items.length > 0,
);
const cases = {
  "plan-list": {
    file: "plan/index",
    data: {
      rootReady: true,
      factoryRoot: false,
      rootMessage: "",
      factoryContext: { roleCode: "demander" },
      items: [api.summary(scheme)],
      filter: "all",
      total: "1",
      busy: false,
      message: "",
      exportId: "",
    },
  },
  "plan-detail": { file: "plan/detail", data: detailed(scheme) },
  "plan-hidden": {
    file: "plan/detail",
    data: { ...detailed(scheme), hidePrice: true },
  },
  "checklist-detail": { file: "checklist/detail", data: detailed(checklist) },
  "share-hidden": {
    file: "plan/share",
    data: {
      token: "replay",
      detail: { ...shared, daily: "" },
      items: shared.items.map(api.display),
      busy: false,
      invalid: false,
      message: "",
    },
  },
  "share-invalid": {
    file: "plan/share",
    data: {
      token: "replay",
      detail: null,
      items: [],
      busy: false,
      invalid: true,
      message: "分享已关闭或失效",
    },
  },
  "address-edit": {
    file: "address/edit",
    data: { ...address, busy: false, message: "" },
  },
  "plan-create": {
    file: "plan/create",
    data: { name: "", description: "", limit: false, busy: false, message: "" },
  },
};
function convert(source) {
  return source
    .replace(/<import[^>]+\/>/g, "")
    .replace(/<login-sheet[^>]+\/>/g, "")
    .replace(/<template [^>]*is="[^"]+"[^>]*\/>/g, "")
    .replace(/<\/?view\b/g, (m) => m.replace("view", "div"))
    .replace(/<\/?text\b/g, (m) => m.replace("text", "span"))
    .replace(/<\/?block\b/g, (m) => m.replace("block", "template"))
    .replace(/<[^>]+>/g, (tag) => {
      const loop = tag.match(/wx:for="\{\{(.*?)\}\}"/);
      if (loop)
        tag = tag.replace(loop[0], 'v-for="(item,index) in ' + loop[1] + '"');
      tag = tag
        .replace(/\s+wx:key="[^"]*"/g, "")
        .replace(/wx:if="\{\{(.*?)\}\}"/g, 'v-if="$1"')
        .replace(/wx:elif="\{\{(.*?)\}\}"/g, 'v-else-if="$1"')
        .replace(/wx:else/g, "v-else")
        .replace(/(?:bind\w+|catch\w+)="[^"]*"/g, "");
      return tag.replace(
        /([\w-]+)="([^"<>]*\{\{[^"<>]*\}\}[^"<>]*)"/g,
        (_, key, value) => {
          const exact = value.match(/^\{\{(.*?)\}\}$/);
          return (
            ":" +
            key +
            '="' +
            (exact
              ? exact[1]
              : "`" + value.replace(/\{\{(.*?)\}\}/g, "${$1}") + "`") +
            '"'
          );
        },
      );
    })
    .replace(
      /<public-prop-image[^>]+\/>/g,
      '<div class="image-placeholder">暂无图片</div>',
    )
    .replace(
      /<switch[^>]+\/>/g,
      '<input type="checkbox" :checked="hidePrice||isDefault">',
    )
    .replace(/<picker[^>]+>/g, "<div>")
    .replace(/<\/picker>/g, "</div>")
    .replace(/<input([^>]*)\/>/g, "<input$1>")
    .replaceAll(
      "item.availability.isRentable",
      "(item.availability && item.availability.isRentable)",
    )
    .replaceAll("detail.share.status", "detail.share && detail.share.status");
}
const css = (read("app.wxss") + "\n" + read("styles/planning.wxss"))
  .replace(/page\s*\{/g, "body{")
  .replace(/([0-9.]+)rpx/g, (_, v) => Number(v) / 2 + "px")
  .replace(/\bview(?=[\s{.:>])/g, "div")
  .replace(/\btext(?=[\s{.:>])/g, "span");
fs.copyFileSync(
  path.resolve(
    __dirname,
    "../admin-web/node_modules/vue/dist/vue.global.prod.js",
  ),
  path.join(output, "replay-vue.js"),
);
for (const [name, value] of Object.entries(cases)) {
  const template = convert(read("pages/" + value.file + ".wxml"));
  const html =
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D3响应重放 ' +
    name +
    "</title><style>" +
    css +
    '\nbody{margin:0;font-family:-apple-system,"PingFang SC",sans-serif}.planning input{border:0}.planning textarea{border:0;resize:none}.image-placeholder{background:#eee;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#888} .replay-note{font-size:10px;padding:8px;text-align:center;background:#fff5c2;color:#6c5600}button{border:0}textarea{font:inherit}</style><div class="replay-note">隔离真实响应 · WXML/WXSS 浏览器重放 · 非原生/真机</div><div id="app"></div><script src="replay-vue.js"></script><script>Vue.createApp({data:()=>(' +
    JSON.stringify({
      hidePrice: false,
      isDefault: false,
      ...value.data,
    }).replace(/</g, "\\u003c") +
    "),template:" +
    JSON.stringify(template).replace(/</g, "\\u003c") +
    '}).mount("#app");</script>';
  fs.writeFileSync(path.join(output, "page-" + name + ".html"), html);
}
console.log(
  "Created",
  Object.keys(cases).length,
  "real-response browser replay states",
);
