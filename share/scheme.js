/* Same-token anonymous read only. Never persist the token, response, or signed images. */
(() => {
  const content = document.getElementById("content");
  const token = new URL(location.href).searchParams.get("token") || "";
  let generation = 0, abort, timer, renewal;
  const failedImages = new Set(), failedUrls = new Set();
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function clear(message) {
    content.replaceChildren(element("section", message, "panel empty-state"));
    document.title = "方案分享 · 幕间";
  }
  function invalid() {
    clear("");
    const panel = content.firstChild;
    panel.append(element("div", "!", "empty-icon"), element("h2", "分享链接已失效"), element("p", "链接已过期或当前无法访问，请向分享人索取新链接。", "muted"));
  }
  function suspend() {
    generation++;
    abort?.abort();
    clearTimeout(timer);
    renewal = null;
    clear("正在核验分享…");
  }
  async function read() {
    const response = await fetch("/api/public/scheme-shares/" + encodeURIComponent(token), {
      method: "GET", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: abort.signal,
      headers: { Accept: "application/json" },
    });
    if (response.status === 404 || response.status === 403) throw Object.assign(Error(), { invalid: true });
    const reply = await response.json();
    if (!response.ok || reply.code !== "OK") throw Error("暂时无法读取，请重新尝试。");
    const detail = reply.data;
    if (!detail || !Array.isArray(detail.items) || typeof detail.hidePrice !== "boolean") throw Error("分享内容暂不可用。");
    // Defense in depth: hidden responses must contain no price fields, even outside the visible DOM.
    if (detail.hidePrice && /"(?:prices|estimatedDailyRentFen|estimatedDepositFen|dailyRentPriceFen|depositAmountFen)"\s*:/.test(JSON.stringify(detail))) throw Error("分享内容暂不可用。");
    return detail;
  }
  function render(detail, round) {
    content.replaceChildren();
    const banner = element("div", undefined, "share-banner");
    banner.append(element("small", "朋友分享给你"), element("h1", detail.name));
    const panel = element("section", undefined, "panel"), title = element("div", undefined, "detail-title");
    title.append(element("h2", "方案简介"), element("span", "只读快照", "badge"));
    panel.append(title, element("p", detail.description || "", "muted"));
    const metrics = element("div", undefined, "summary-grid" + (detail.hidePrice ? " two-cols" : ""));
    const pairs = [["道具", detail.quantityTotal + " 件"]];
    if (!detail.hidePrice) pairs.push(["预估日租", money(detail.estimatedDailyRentFen)]);
    pairs.push(["来源", "分享"]);
    for (const [label, value] of pairs) {
      const metric = element("div", undefined, "metric");
      metric.append(element("small", label), element("strong", value)); metrics.append(metric);
    }
    panel.append(metrics);
    const list = element("section", undefined, "panel"); list.append(element("h2", "道具列表"));
    let expires = Infinity;
    for (const item of detail.items) {
      const display = item.display, row = element("div", undefined, "prop-row"), body = element("div", undefined, "prop-body");
      const image = element("img", undefined, "prop-thumb"); image.alt = display.name; image.loading = "lazy"; image.referrerPolicy = "no-referrer";
      const picture = display.image;
      if (picture && /^https:\/\//.test(picture.url)) {
        expires = Math.min(expires, Date.parse(picture.expiresAt));
        if (!failedUrls.has(picture.url)) {
          image.onerror = () => {
            if (round !== generation || failedImages.has(picture.cacheKey)) return;
            failedImages.add(picture.cacheKey);
            failedUrls.add(picture.url);
            // One renewal per failed key; concurrent failures share the same resource read.
            renew(round);
          };
          image.src = picture.url;
        }
      }
      body.append(element("div", display.name, "prop-name"), element("div", [display.typeLabel, ...(display.styleLabels || [])].join(" · "), "prop-meta"), element("div", display.factoryName + " · 数量 " + item.quantity, "prop-meta"));
      if (item.remark) body.append(element("div", item.remark, "remark"));
      row.append(image, body);
      if (!detail.hidePrice) row.append(element("div", money(display.prices.dailyRentPriceFen) + "/天", "prop-price"));
      list.append(row);
    }
    if (!detail.items.length) list.append(element("p", "暂无道具", "muted"));
    content.append(banner, panel, list, element("p", detail.disclaimer, "muted"));
    clearTimeout(timer);
    // Recheck authorization before signatures expire; no SKU fallback for historical shares.
    if (Number.isFinite(expires)) timer = setTimeout(() => renew(round), Math.max(1000, expires - Date.now() - 30000));
  }
  function money(fen) { return "¥" + (fen / 100).toFixed(2); }
  async function renew(round) {
    if (round !== generation || document.hidden) return;
    if (renewal) return renewal;
    renewal = (async () => {
      try {
        const detail = await read();
        if (round === generation && !document.hidden) render(detail, round);
      } catch (error) {
        if (round !== generation) return;
        suspend();
        if (error.invalid) invalid(); else clear("暂时无法核验分享，请重新读取。");
      } finally { if (round === generation) renewal = null; }
    })();
    return renewal;
  }
  async function load() {
    suspend(); failedImages.clear(); failedUrls.clear();
    const round = generation;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { invalid(); return; }
    abort = new AbortController();
    try {
      const detail = await read();
      if (round === generation && !document.hidden) render(detail, round);
    } catch (error) {
      if (round !== generation) return;
      if (error.invalid) invalid(); else clear(error.message || "暂时无法读取，请重新尝试。");
    }
  }
  document.getElementById("refresh").addEventListener("click", load);
  document.addEventListener("visibilitychange", () => document.hidden ? suspend() : load());
  window.addEventListener("pagehide", suspend);
  window.addEventListener("pageshow", load);
})();
