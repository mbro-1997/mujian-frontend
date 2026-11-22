const api = require("../../services/props"),
  session = require("../../session/storage");
Component({
  properties: { fields: { type: Object, value: null, observer: "render" } },
  data: { rows: [], groups: [], images: [], message: "" },
  methods: {
    render() {
      const f = this.data.fields;
      if (!f) {
        this.setData({ rows: [], groups: [], images: [] });
        return;
      }
      this.setData({
        rows: [
          ["名称", f.propName],
          ["类型", f.typeLabel],
          ["风格", (f.styleLabels || []).join("、")],
          ["尺寸描述", f.sizeDesc],
          [
            "长 × 宽 × 高",
            f.lengthCm + " × " + f.widthCm + " × " + f.heightCm + " cm",
          ],
          ["材质", f.materialDesc],
          ["阻燃", f.fireResistantLabel],
          ["重量", f.weightKg + " kg"],
          ["运输建议", f.transportSuggestion],
          ["日租金", "¥" + api.money(f.dailyRentPriceFen) + "/天"],
          ["押金", "¥" + api.money(f.depositAmountFen)],
          ["备注", f.remark || "—"],
          ["包装体积系数", f.packagingFactorBps == null ? "待补充" : String(f.packagingFactorBps / 10000)],
        ].map(([label, value]) => ({ label, value })),
        images: f.images || [],
      });
      const rows=this.data.rows;
      this.setData({groups:[
        {title:"基础属性",rows:[rows[0],rows[2],rows[1],rows[6]]},
        {title:"规格参数",rows:[rows[3],rows[4],rows[5],rows[7],rows[12],rows[8]]},
        {title:"租金与押金",rows:rows.slice(9,11)},
        {title:"备注",rows:rows.slice(11,12)},
      ]});
    },
    async preview(e) {
      try {
        await api.preview(e.currentTarget.dataset.locator);
      } catch (e) {
        this.setData({ message: e.message });
      }
    },
    failed(e) {
      this.setData({
        ["images[" + e.currentTarget.dataset.index + "].preview"]: null,
      });
    },
  },
});
