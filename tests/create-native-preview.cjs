// 独立原生夹具，不进入生产 app.json，不连接接口或写入商品库。
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "../miniprogram");
const output = process.argv[2];
if (!output) throw Error("请指定隔离输出目录");
if (fs.existsSync(output)) throw Error("拒绝覆盖已有目录");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "project.config.json"))
);
for (const mode of ["minimal", "cards"]) {
  const dir = path.join(output, mode);
  fs.mkdirSync(path.join(dir, "pages/index"), { recursive: true });
  const write = (name, value) => fs.writeFileSync(path.join(dir, name), value);
  write(
    "project.config.json",
    JSON.stringify({ ...config, projectname: "D1-R02-" + mode }, null, 2)
  );
  write(
    "app.json",
    JSON.stringify(
      {
        pages: ["pages/index/index"],
        window: { navigationBarTitleText: "隔离示例 · 非生产" },
      },
      null,
      2
    )
  );
  write(
    "app.js",
    "App({onLaunch(){console.log('R02 minimal launch',Date.now())},onShow(){console.log('R02 actual show',Date.now())},onHide(){console.log('R02 actual hide',Date.now())}});"
  );
  write("app.wxss", fs.readFileSync(path.join(root, "app.wxss")));
  write(
    "pages/index/index.wxss",
    "page{padding:16px;box-sizing:border-box}.label{margin-bottom:16px;font-weight:bold}.controls{display:flex;flex-wrap:wrap;margin:12px 0}button{font-size:12px}"
  );
  if (mode === "minimal") {
    write("pages/index/index.json", "{}");
    write("pages/index/index.js", "Page({});");
    write(
      "pages/index/index.wxml",
      '<view class="label">最小启动对照：无业务模块、无请求、无自定义组件</view>'
    );
  } else {
    fs.mkdirSync(path.join(dir, "components"), { recursive: true });
    fs.cpSync(
      path.join(root, "components/prop-grid"),
      path.join(dir, "components/prop-grid"),
      { recursive: true }
    );
    write(
      "pages/index/index.json",
      JSON.stringify({
        usingComponents: { "prop-grid": "/components/prop-grid/index" },
      })
    );
    write(
      "pages/index/index.js",
      `Page({data:{state:'ready',states:['ready','loading','empty','unconnected'],items:[{name:'示例道具 · 多风格长标题窄屏检查',styles:['国风东方','西洋古典'],category:'示例分类',price:80},{name:'示例烛台',styles:['现代当代'],category:'示例分类',price:45}]},choose(e){this.setData({state:e.currentTarget.dataset.state})}});`
    );
    write(
      "pages/index/index.wxml",
      '<view class="label">独立示例 · 无真实商品、库存和交易</view><view class="controls"><button wx:for="{{states}}" wx:key="*this" data-state="{{item}}" bindtap="choose">{{item}}</button></view><prop-grid state="{{state}}" items="{{items}}" example="{{true}}"/>'
    );
  }
}
console.log("Created native minimal/cards fixtures; NOT RUN:", output);
