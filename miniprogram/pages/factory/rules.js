const { hint } = require("../../services/form-error");
const successToast = require("../../services/success-toast");
const api = require("../../services/factory");
const checkboxSelection = require("../../services/checkbox-selection");
// The current factory contract requires two distinct rule documents.
function rulesComplete(rules) {
  return rules.length === 2 && new Set(rules.map((r) => r.documentId)).size === 2;
}
require("../../session/page")({
  data: { rules: [], checked: [], rulesReady: false, allSelected: false, body: null, busy: false, message: "" },
  onLoad(q={}) {
    this.setData({readOnly:q.readOnly === "1"});
    return this.load();
  },
  async load() {
    if (this.data.loadingRules) return;
    this.setData({ loadingRules: true, rules: [], checked: [], rulesReady: false, allSelected: false, body: null, message: "" });
    try {
      const rules = (await api.request("factory-rules")).rules;
      this.setData({
        rules: rules.map((r) => ({ ...r, selected: false })),
        rulesReady: rulesComplete(rules),
      });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ loadingRules: false });
    }
  },
  check(e) {
    const { ids, allSelected } = checkboxSelection(this.data.rules, e.detail.value, "documentId");
    const selected = new Set(ids);
    this.setData({
      checked: ids,
      allSelected,
      rules: this.data.rules.map((r) => ({
        ...r,
        selected: selected.has(r.documentId),
      })),
    });
  },
  async open(e) {
    try {
      const r = await api.request(
        "factory-rules/" + e.currentTarget.dataset.id,
      );
      this.setData({ body: r });
    } catch (e) {
      hint(e.message);
    }
  },
  close() {
    this.setData({ body: null });
  },
  async submit() {
    if (
      this.data.readOnly || this.data.busy ||
      !this.data.rulesReady || !rulesComplete(this.data.rules) ||
      !checkboxSelection(this.data.rules, this.data.checked, "documentId").allSelected
    )
      return;
    const d = api.read();
    if (!d) {
      hint("草稿已失效，请返回资料页重新填写。");
      return;
    }
    this.setData({ busy: true, message: "" });
    try {
      const accepted = this.data.rules.map((r) => ({
        documentId: r.documentId,
        version: r.version,
        contentHash: r.contentHash,
      }));
      await api.submit(d, accepted);
      wx.redirectTo({ success: () => successToast("入驻申请已提交"), url: "/pages/factory/status" });
    } catch (e) {
      hint(e.message);
      if (e.reason === "RULE_VERSION_CHANGED") {
        d.body = null;
        await this.load();
      }
    } finally {
      this.setData({ busy: false });
    }
  },
});
