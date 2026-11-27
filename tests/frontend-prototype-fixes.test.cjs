const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./support/planning-fixture.cjs");
const event = (dataset = {}, value) => ({ currentTarget: { dataset }, detail: { value } });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { resolve, promise };
}

test("上传时锁定明细，按行标识关联；只发送契约字段并回读服务端版本", async () => {
  const f = fixture("custom/form"), p = f.page, c = f.load("services/custom.js");
  const picked = deferred(), commands = [];
  c.attach = () => picked.promise;
  c.apply = async (url, body) => { commands.push(body); return {resourceId: "r", resourceVersion: 2}; };
  c.get = async () => ({ version: 2, form: {...commands[0], items: commands[0].items} });
  p.setData({id:"r", version:1, "form.factoryId":"f"});
  p.add(); p.add();
  const pending = p.upload(event({index:0}));
  p.remove(event({index:0}));
  p.change(event({path:"form.title"}, "不应写入"));
  assert.equal(p.data.form.items.length, 2);
  picked.resolve({materialId:"file", name:"图", type:"image"});
  await pending;
  assert.equal(commands[0].items[0].attachments[0].materialId, "file");
  assert.equal(commands[0].items[1].attachments.length, 0);
  assert.ok(!("rowKey" in commands[0].items[0]));
  assert.equal(p.data.version, 2);
});

test("草稿保存期间不接受覆盖性编辑；离页不继续提交；保存后详情接手读取", async () => {
  for (const leave of [false,true]) {
    const f=fixture("custom/form"), p=f.page, c=f.load("services/custom.js"), draft=deferred(), calls=[];
    c.apply=async (path,body) => {calls.push({path,body}); return calls.length===1 ? draft.promise : {};};
    c.get=()=>assert.fail("保存离开页面不应回读整单");
    p.setData({"form.factoryId":"f","form.title":"原稿",version:1,id:"r"});
    const saving=p.save(event({submit:true}));
    p.change(event({path:"form.title"},"在途编辑")); assert.equal(p.data.form.title,"原稿");
    if (leave) p.onUnload();
    draft.resolve({resourceId:"r",resourceVersion:2}); await saving;
    assert.equal(calls.length,leave ? 1 : 2);
    if (!leave) assert.equal(calls[1].body.expectedVersion,2);
    assert.equal(f.nav.length,leave ? 0 : 1);
  }
});

test("模板先预览，保留已有行，同一示例再次应用不重复追加", () => {
  const {page:p}=fixture("custom/form");p.add();p.template();
  assert.equal(p.data.form.items.length,1);p.closeTemplate();assert.equal(p.data.form.items.length,1);
  p.template();p.useTemplate();p.template();p.useTemplate();
  assert.deepEqual(Array.from(p.data.form.items, row=>row.quantity),[1,4,2]);
});

test("后台返回不可访问时清除定制工厂和入口", async () => {
  for(const status of [403,404]) {
    const f=fixture("custom/factory"), p=f.page;
    p.setData({factory:{id:"f"},id:"f"});
    f.load("services/custom.js").get=async()=>{throw Object.assign(new Error("不可用"),{status});};
    await p.refresh();p.create();
    assert.equal(p.data.factory,null); assert.equal(f.nav.length,0);
  }
});

test("报价锁定备注，选券取消不重报，确认只使用服务端重新报价", async () => {
  const f=fixture("checkout/index"),p=f.page,api=f.load("services/trading.js"), first=deferred(), calls=[];
  const choices={items:[{usable:true,savingFen:100,id:"a",coupon:{id:"a"}},{usable:false,savingFen:0,coupon:{id:"b"}}]};
  api.coupon=x=>x;api.amounts=x=>x;
  api.post=async (url,body)=>{
    calls.push([url,JSON.parse(JSON.stringify(body))]);
    if(url.endsWith("coupons"))return calls.length===1 ? first.promise : choices;
    return {quoteToken:"Q"+calls.length,groups:[],amounts:{}};
  };
  p.setData({id:"c",detail:{version:1},address:{id:"a",version:1},groups:[{factoryId:"f",buyerRemark:"原备注"}]});
  let notice; f.wx.showToast = options => { notice = options; };
  const initial=p.quote();p.remark(event({index:0},"在途备注"));first.resolve(choices);await initial;
  assert.equal(calls[1][1].deliveries[0].buyerRemark,p.data.groups[0].buyerRemark);
  p.coupons();p.chooseCoupon(event({id:"b"}));assert.equal(p.data.draftCouponId,"a");
  p.chooseCoupon(event());p.cancelCoupons();assert.equal(p.data.quote.quoteToken,"Q2");assert.equal(calls.length,2);
  p.coupons();p.chooseCoupon(event());await p.confirmCoupon();
  assert.equal(p.data.quote.quoteToken,"Q4");assert.equal(calls[3][1].couponId,null);
  p.coupons();p.chooseCoupon(event({id:"a"}));choices.items[0].usable=false;await p.confirmCoupon();
  assert.equal(p.data.quote,null);assert.equal(p.data.message,"");assert.ok(notice.title);assert.equal(calls.length,5);
});

test("编辑旧报价以元回显，恢复整数分，不向后端发送显示字段", async () => {
  const f=fixture("factory/custom-detail"),p=f.page,c=f.load("services/custom.js");
  const d={id:"r",version:3,allowedActions:["saveCustomQuote"],extensions:[],quotes:[{terms:{
    items:[{itemId:"i",unitPriceFen:10001}],freightFen:0,productionDays:1}}]};
  p.setData({id:"r",kind:"requirements",detail:d});p.choose(event({k:"saveCustomQuote"}));
  assert.equal(p.data.terms.items[0].unitPriceYuan,"100.01");p.edit(event({path:"terms.items[0].unitPriceYuan"},"0.01"));
  let payload;c.apply=async (_,body)=>{payload=body;return {resourceId:"r",resourceVersion:4};};
  p.load=async()=>{};await p.confirm();
  assert.equal(payload.terms.items[0].unitPriceFen,1);assert.equal(payload.terms.freightFen,0);
  assert.equal("unitPriceYuan" in payload.terms.items[0],false);assert.equal("freightYuan" in payload.terms,false);
});

test("同页和跨页重复主键均去除，列表保持服务端顺序", () => {
  const unique=require("../miniprogram/services/unique-rows");
  assert.deepEqual(unique([{id:"b"},{id:"a"},{id:"b"},{id:"c"}],[{id:"a"}]),[{id:"b"},{id:"c"}]);
});

test("两份契约的预编译匹配保持静态优先、方法、查询串和段边界", () => {
  const build=require("../miniprogram/services/contract-route");
  for(const name of ["response-contract-data","factory-contract-data"]){
    const {paths}=require("../miniprogram/services/"+name),match=build(paths);
    const ordered=Object.keys(paths).sort((a,b)=>Number(a.includes("{"))-Number(b.includes("{")));
    for(const path of ordered){
      const url=path.replace(/\{[^}]+\}/g,"record");
      const key=ordered.find(p=>new RegExp("^"+p.replace(/\{[^}]+\}/g,"[^/]+")+"$").test(url));
      assert.equal(match(url+"?page=2"),paths[key]);
    }
    assert.equal(match("/api/unregistered/path"),undefined);
  }
});

test("从延期列表点记录只读详情，预警标签来自返回状态", async () => {
  const f=fixture("factory/extensions"),p=f.page,api=f.load("services/trading.js"), got=[];
  api.get=async path=>{got.push(path);return {id:"e",extensionStatus:"factory_warning",availableActions:[]};};
  p.open(event({id:"e"}));
  assert.equal(f.nav[0],"/pages/factory/extensions?id=e");
  assert.equal(got.length,0);
  p.onLoad({id:"e"});await p.onShow();assert.equal(got.length,1);assert.ok(got[0].endsWith("/e"));assert.match(p.data.detail.label,/预警/);
});

test("星级点击边界、无效租期、日历读屏信息", async () => {
  const r=fixture("reviews/detail").page;r.setData({entry:{canReview:true}});
  for(const rating of [1,5,6])r.rate(event({rating}));assert.equal(r.data.rating,5);
  const f=fixture("props/dates"),p=f.page;let toast;f.wx.showToast=o=>{toast=o};await p.confirm();assert.equal(p.data.message,"");assert.match(toast.title,/租期/);assert.equal(p.data.pendingCreate,false);
  const calendar=f.load("services/rental-calendar.js");
  const cells=calendar.cells("2030-03","2030-03-10","2030-03-12",calendar.startWindow(Date.parse("2030-03-07T01:00:00Z")));
  assert.match(cells.find(c=>c.date==="2030-03-10").accessibleLabel,/2030年.*取货/);
  assert.match(cells.find(c=>c.date==="2030-03-08").accessibleLabel,/不可选/);
});

test("附件建稿已获回执后回读超时，重试只读取同一草稿", async () => {
  const f = fixture("custom/form"), p = f.page, c = f.load("services/custom.js");
  let saves = 0, reads = 0;
  c.apply = async () => {
    saves++;
    return {resourceId: "r", resourceVersion: 1};
  };
  c.get = async path => {
    assert.equal(path, c.root(false, "requirements", "r"));
    if (++reads === 1) throw new Error("读取超时");
    return {version: 1, form: {factoryId: "f", items: [{id:"item-1"}], attachments: []}};
  };
  c.attach = () => assert.fail("明细未回读时不能继续上传");
  p.setData({ ready: true, "form.factoryId": "f" });
  p.add();
  await p.upload(event({index:0}));
  assert.equal(p.data.ready, false);
  assert.match(p.data.message, /读取超时/);
  await p.retryLoad();
  assert.equal(p.data.ready, true);
  assert.equal(p.data.form.items[0].rowKey, "item-1");
  assert.equal(saves, 1);
  assert.equal(reads, 2);
});

test("实名认证拦截只在确认且仍在原页面时跳转，收款拦截只出现轻提示", async () => {
  for (const respond of ["cancel", "confirm", "leave", "merchant"]) {
    const f = fixture("checkout/index"), p = f.page, api = f.load("services/trading.js");
    const groups = [{ factoryId: "f", outboundService: "self_pickup", returnService: "user_return", buyerRemark: "原备注" }];
    p.setData({ id: "c", detail: { version: 2 }, address: { id: "a", version: 1 }, groups });
    let dialog, notice;
    f.wx.showModal = options => { dialog = options; };
    f.wx.showToast = options => { notice = options; };
    api.post = async () => { throw { status: 409, reason: respond === "merchant" ? "MERCHANT_NOT_READY" : "REALNAME_REQUIRED" }; };
    await p.quote();
    assert.equal(p.data.message, "");
    assert.equal(p.data.groups[0].buyerRemark, "原备注");
    assert.equal(p.data.step, 1);
    if (respond === "merchant") {
      assert.equal(dialog, undefined); assert.match(notice.title, /收款/); assert.equal(notice.mask, false);
    } else {
      assert.equal(dialog.confirmText, "实名认证");
      if (respond === "leave") p.onHide();
      dialog.success({ confirm: respond !== "cancel" });
      assert.deepEqual(f.nav, respond === "confirm" ? ["/pages/realname/form"] : []);
    }
  }
});

test("运价表按城市、车型和真实里程档显示；缺档留空，零价保留", async () => {
  const f = fixture("checkout/index"), p = f.page, api = f.load("services/trading.js");
  const rule = { cityCode: "甲", vehicleTierId: "small", distanceMinMeter: 0, distanceMaxMeter: 11000, guideMinFen: 0, guideMaxFen: 1200, includedDistanceMeter: 5000, extraKmFen: null };
  api.get = async () => ({
    vehicles: [{ id: "small", tierName: "微型车" }, { id: "truck", tierName: "货车" }],
    rules: [rule, { ...rule, vehicleTierId: "truck", distanceMinMeter: 11000, distanceMaxMeter: null }, { ...rule, cityCode: "乙" }],
  });
  await p.readPrices(() => true);
  const [first, second] = p.data.priceSheet;
  assert.equal(first.ranges.length, 2); assert.equal(second.ranges.length, 1);
  assert.equal(first.rows[0].prices[0].price, "¥0.00–12.00");
  assert.equal(first.rows[0].prices[1].price, undefined);
  assert.equal(first.rows[1].prices[1].extra, "不支持超程");
});
