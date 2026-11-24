const { hint, UploadError } = require("../../services/form-error");
const successToast = require("../../services/success-toast");
const checkboxSelection = require("../../services/checkbox-selection");
const api = require("../../services/factory"),
  account = require("../../services/account"),
  session = require("../../session/storage");
const blank = () => ({
  factoryName: "",
  unifiedSocialCreditCode: "",
  factoryAvatar: null,
  businessLicense: null,
  factoryPhotos: [],
  contactName: "",
  factoryAddress: "",
  mainBusiness: "",
  workerCount: 0,
  specialtyCategoryIds: [],
  cases: [],
  remark: "",
});
require("../../session/page")({
  data: {
    mode: "onboarding",
    fields: null,
    options: [],
    busy: false,
    message: "",
    previous: null,
    version: null,
    locked: false,
  },
  onLoad(q) {
    this.setData({ mode: q.mode === "change" ? "change" : "onboarding" });
    return this.load();
  },
  async load() {
    this.setData({ busy: true });
    try {
      const c = await account.context();
      let fields = blank(),
        previous = null,
        version = null;
      const mode = this.data.mode,
        cur = await api.request(api.domain(mode) + "/current");
      if (
        mode === "onboarding" &&
        !cur.application &&
        cur.nextAction === "ENTER_FACTORY_INVITE"
      ) {
        wx.redirectTo({ url: "/pages/factory/invite" });
        return;
      }
      if (cur.application && cur.application.auditStatus === "pending") {
        wx.redirectTo({ url: "/pages/factory/status?mode=" + mode });
        return;
      }
      if (mode === "change") {
        const p = await api.request("factory-profile");
        fields = api.existing(p.materials);
        version = p.profileVersion;
        if (cur.application && cur.application.auditStatus === "rejected") {
          fields = api.existing(cur.application.proposed);
          previous = cur.application.id;
        }
      } else if (cur.application) {
        fields = api.existing(cur.application.materials);
        delete fields.contactPhone;
        previous = cur.application.id;
      }
      const options = (await api.request("factory-options")).items.map((o) => ({
        ...o,
        selected: fields.specialtyCategoryIds.includes(o.id),
      }));
      this.setData({
        fields,
        options,
        previous,
        version,
        userId: c.userId,
        locked: c.accessMode === "restricted",
        message: "",
      });
      wx.setNavigationBarTitle?.({ title: mode === "change" ? "修改工厂资料" : previous ? "重新提交工厂资料" : "完善工厂资料" });
    } catch (e) {
      this.setData({ message: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  input(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ["fields." + key]: e.detail.value });
  },
  caseInput(e) {
    const { index, key } = e.currentTarget.dataset;
    this.setData({ ["fields.cases[" + index + "]." + key]: e.detail.value });
  },
  category(e) {
    const { ids } = checkboxSelection(this.data.options, e.detail.value);
    const selected = new Set(ids);
    this.setData({
      "fields.specialtyCategoryIds": ids,
      options: this.data.options.map((o) => ({
        ...o,
        selected: selected.has(o.id),
      })),
    });
  },
  addCase() {
    if (this.data.fields.cases.length < 10)
      this.setData({
        "fields.cases": [
          ...this.data.fields.cases,
          { title: "", description: "", images: [] },
        ],
      });
  },
  removeCase(e) {
    this.setData({
      "fields.cases": this.data.fields.cases.filter(
        (_, i) => i !== Number(e.currentTarget.dataset.index),
      ),
    });
  },
  choose(e) {
    const owner = session.capture(),
      { field, index } = e.currentTarget.dataset;
    const collection = field === "factoryPhotos" || field === "cases";
    const current =
      field === "cases"
        ? this.data.fields.cases[index].images
        : this.data.fields[field];
    const max = field === "factoryPhotos" ? 3 : 3;
    wx.chooseMedia({
      count: collection ? max - current.length : 1,
      mediaType: ["image"],
      success: (r) => {
        if (!session.isCurrent(owner)) return;
        const images = r.tempFiles.map((f) => ({ localPath: f.tempFilePath }));
        if (r.tempFiles.some((f) => f.size > 5 * 1024 * 1024)) {
          hint("每张图片不能超过5MiB，请重新选择。");
          return;
        }
        const key =
          field === "cases"
            ? "fields.cases[" + index + "].images"
            : "fields." + field;
        this.setData({
          [key]: collection ? [...current, ...images] : images[0],
        });
      },
    });
  },
  remove(e) {
    const { field, index, caseindex } = e.currentTarget.dataset;
    if (field === "cases") {
      const key = "fields.cases[" + caseindex + "].images";
      this.setData({
        [key]: this.data.fields.cases[caseindex].images.filter(
          (_, i) => i !== Number(index),
        ),
      });
    } else if (field === "factoryPhotos")
      this.setData({
        "fields.factoryPhotos": this.data.fields.factoryPhotos.filter(
          (_, i) => i !== Number(index),
        ),
      });
    else this.setData({ ["fields." + field]: null });
  },
  async preview(e) {
    const { field, index, caseindex } = e.currentTarget.dataset;
    let img =
      field === "cases"
        ? this.data.fields.cases[caseindex].images[index]
        : field === "factoryPhotos"
          ? this.data.fields.factoryPhotos[index]
          : this.data.fields[field];
    try {
      const url =
        img.localPath ||
        (await api.request("factory-materials/view", "POST", img.locator)).url;
      wx.previewImage({ urls: [url], current: url });
    } catch (e) {
      this.setData({ message: e.message });
    }
  },
  async next() {
    if (this.data.busy || this.data.locked) return;
    const fields = JSON.parse(JSON.stringify(this.data.fields));
    fields.workerCount = Number(fields.workerCount);
    fields.unifiedSocialCreditCode = fields.unifiedSocialCreditCode
      .trim()
      .toUpperCase();
    for (const k of ["mainBusiness", "remark"])
      fields[k] = (fields[k] && fields[k].trim()) || null;
    if (
      !fields.factoryName.trim() ||
      !fields.contactName.trim() ||
      !fields.factoryAddress.trim() ||
      !fields.factoryAvatar ||
      !fields.businessLicense ||
      !fields.factoryPhotos.length ||
      !fields.specialtyCategoryIds.length
    ) return hint("请补全工厂必填资料和图片");
    if (!Number.isInteger(fields.workerCount) || fields.workerCount < 0)
      return hint("工人数须为非负整数");
    if (!/^[0-9A-Z]{18}$/.test(fields.unifiedSocialCreditCode))
      return hint("信用代码须为18位字母或数字");
    if (fields.cases.some(c => !c.title.trim() && !c.description.trim() && !c.images.length))
      return hint("请给空白案例添加标题、说明或图片");
    const d = {
      mode: this.data.mode,
      fields,
      previous: this.data.previous,
      version: this.data.version,
      userId: this.data.userId,
    };
    api.save(d);
    if (d.mode === "onboarding") {
      wx.navigateTo({ url: "/pages/factory/rules" });
      return;
    }
    const owner = session.capture();
    wx.showModal({
      title: "提交资料变更",
      content: "审核通过后更新工厂资料，审核期间当前资料继续有效。确认提交？",
      success: async (r) => {
        if (!r.confirm || !session.isCurrent(owner)) return;
        this.setData({ busy: true, message: "" });
        try {
          await api.submit(d);
          wx.redirectTo({ success: () => successToast("变更申请已提交"), url: "/pages/factory/status?mode=change" });
        } catch (e) {
          if (e instanceof UploadError) return hint(e.message);
          this.setData({ message: e.message });
        } finally {
          this.setData({ busy: false });
        }
      },
    });
  },
});
