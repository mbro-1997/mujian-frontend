const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const base = path.resolve(__dirname, "../../miniprogram");
async function runForm(input) {
  const cache = new Map(),
    calls = [],
    uploads = [];
  let definition, sent;
  function load(file) {
    file = path.resolve(base, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {
      module,
      wx: { redirectTo() {} },
      require(name) {
        if (file.endsWith("/services/props.js")) {
          if (name === "./http") return {};
          if (name === "../session/storage")
            return { capture: () => 1, assertCurrent() {} };
          if (name === "./verification")
            return {
              upload: async (domain, local, purpose) => {
                uploads.push({ domain, local, purpose });
                return input.uploadId;
              },
            };
        }
        if (name === "../../session/page") return (d) => (definition = d);
        return load(path.resolve(path.dirname(file), name + ".js"));
      },
    });
    return module.exports;
  }
  const api = load("services/props.js");
  api.request = async (p) => {
    calls.push(p);
    if (p.startsWith("me/factory-props/options")) return input.options;
    if (p.startsWith("me/prop-reviews/")) return input.review;
    if (p.startsWith("me/factory-props/")) return input.sku;
    throw Error("Unexpected read " + p);
  };
  api.resume = async () => null;
  api.command = async (slot, operation, url, body) => {
    sent = JSON.parse(JSON.stringify({ operation, path: url, body }));
    return {
      targetType: "sku_audit",
      targetId: input.review?.id || input.uploadId,
    };
  };
  load("pages/props/form.js");
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(values) {
      for (const [k, v] of Object.entries(values)) {
        const parts = k.split(".");
        let obj = this.data;
        for (const p of parts.slice(0, -1)) obj = obj[p];
        obj[parts.at(-1)] = v;
      }
    },
  };
  page.setData({
    id: input.sku?.id || "",
    previous: input.review?.id || "",
    mode: input.mode || "create",
  });
  await page.load();
  if (page.data.message) throw Error(page.data.message);
  if (input.fields)
    page.setData({
      fields: input.fields,
      assetType: input.assetType,
      rent: "100.00",
      deposit: "0.00",
    });
  if (input.addImage)
    page.setData({
      "fields.images": [
        ...page.data.fields.images,
        { localPath: "/fixture/new.png", preview: "local display" },
      ],
    });
  await page.submit();
  if (!sent) throw Error(page.data.message || "No submission");
  return { sent, uploads, calls, displayFields: page.data.fields };
}
module.exports = { runForm };
if (require.main === module) {
  let source = "";
  process.stdin.on("data", (s) => (source += s));
  process.stdin.on("end", () =>
    runForm(JSON.parse(source))
      .then((r) => process.stdout.write(JSON.stringify(r.sent)))
      .catch((e) => {
        process.stderr.write(e.stack);
        process.exitCode = 1;
      }),
  );
}
