// 独立 HTML 预览只消费生产 WXML/WXSS；不注册进小程序，不调用 API，不写库存。
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  mini = path.join(root, "miniprogram");
const output = process.argv[2];
if (!output) throw Error("请指定独立预览输出目录");
fs.mkdirSync(output, { recursive: true });
function convert(source) {
  return source
    .replace(/<\/?view\b/g, (m) => m.replace("view", "div"))
    .replace(/<\/?text\b/g, (m) => m.replace("text", "span"))
    .replace(/<[^>]+>/g, (tag) => {
      const loop = tag.match(/wx:for="\{\{(.*?)\}\}"/),
        item = tag.match(/wx:for-item="(.*?)"/);
      if (loop)
        tag = tag.replace(
          loop[0],
          `v-for="(${item ? item[1] : "item"},index) in ${loop[1]}"`
        );
      tag = tag
        .replace(/\s+wx:(?:key|for-item)="[^"]*"/g, "")
        .replace(/wx:if="\{\{(.*?)\}\}"/g, 'v-if="$1"')
        .replace(/wx:elif="\{\{(.*?)\}\}"/g, 'v-else-if="$1"')
        .replace(/wx:else/g, "v-else")
        .replace(/bindtap=/g, "@click=")
        .replace(/bindtouchstart=/g, "@touchstart=");
      return tag.replace(
        /([\w-]+)="([^"<>]*\{\{[^"<>]*\}\}[^"<>]*)"/g,
        (_, key, value) => {
          const exact = value.match(/^\{\{(.*?)\}\}$/);
          return `:${key}="${
            exact
              ? exact[1]
              : "`" + value.replace(/\{\{(.*?)\}\}/g, "${$1}") + "`"
          }"`;
        }
      );
    })
    .replace(/<prop-grid([^>]*?)\/>/g, "<prop-grid$1></prop-grid>");
}

if(process.argv.includes('--d2-nav')){
 const read=f=>fs.readFileSync(path.join(mini,f),'utf8');
 let warehouse=read('navigation/warehouse.wxml').replace(/^<template[^>]+>/,'').replace(/<\/template>$/,'');
 let template=read('navigation/factory-root.wxml').replace(/<import[^>]+\/>/g,'').replace(/<template name="factory-root">/,'').replace(/<\/template>\s*$/,'').replace(/<template wx:elif="{{rootIndex===2}}"[^>]+\/>/,'<block wx:elif="{{rootIndex===2}}">'+warehouse+'</block>');
 template=convert(template).replace(/<\/?block\b/g,m=>m.replace('block','template')).replace(/bindinput="[^"]*"|bindconfirm="[^"]*"/g,'').replace(/<input([^>]*)\/>/g,'<input$1>');
 const tab=convert(read('custom-tab-bar/index.wxml')).replace('in items','in navItems');
 const baseCss=read('navigation/root.wxss').replace(/\btext(?=[\s:{])/g,'span').replace(/\bview(?=[:>\s{])/g,'div');
 const tabCss=read('custom-tab-bar/index.wxss').replace(/([^{}]+)\{([^{}]*)\}/g,(_,selectors,body)=>selectors.split(',').map(x=>x.trim()==='.tabbar'?x:'.tabbar '+x.trim()).join(',')+'{'+body+'}');
 const css=baseCss+'\n'+tabCss;
 const rows=fs.readFileSync(path.join(output,'nav-owned-asset-http.jsonl'),'utf8').trim().split('\n').map(JSON.parse);const response=rows.find(x=>x.path.startsWith('/api/me/factory-props?')&&x.status===200&&x.body.data.items.length);
 const menus=[['custom','定制需求与订单','暂未开放'],['reviews','道具与库存申请',''],['ledger','库存流水',''],['extension','延期申请','暂未开放'],['claims','索赔与仲裁','暂未开放'],['finance','资金结算','暂未开放'],['ratings','评价管理','暂未开放'],['support','平台客服','暂未开放']].map(([key,label,stage])=>({key,label,stage}));
 const items=response.body.data.items.map(x=>({...x,state:({online:'已上架',offline:'已下架',draft:'待完善'})[x.skuStatus]}));
 const states={rootIndex:0,rootLoading:false,factoryProfile:{factoryStatus:'active',materials:{factoryName:'幕间工厂 · 工作台'}},factoryContext:{accessMode:'normal'},factoryMenus:menus,items,message:'',busy:false,tab:'',keyword:'',page:1,total:response.body.data.total,assetType:'',selection:false,selected:0,hidden:false,navItems:require('../miniprogram/constants/routes').items({roleCode:'supplier'}),events:[]};
 const handlerNames=[...new Set([...template.matchAll(/@(?:click|touchstart)="(\w+)"/g)].map(x=>x[1]))];
 const code=`const state=${JSON.stringify(states).replace(/</g,'\\u003c')};const noop=()=>{};const methods=Object.fromEntries(${JSON.stringify(handlerNames)}.map(k=>[k,function(){this.events.push(k)}]));methods.switchTab=function(e){this.selected=Number(e.currentTarget.dataset.index);this.rootIndex=this.selected;this.events=[];window.scrollTo(0,0)};window.app=Vue.createApp({data:()=>state,methods,template:${JSON.stringify(template+tab)}}).mount('#app');`;
 fs.copyFileSync(path.join(root,'admin-web/node_modules/vue/dist/vue.global.prod.js'),path.join(output,'nav-vue.js'));
 fs.writeFileSync(path.join(output,'nav-integrated-render.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D2 合入页面 · 浏览器派生渲染</title><style>${css}*{box-sizing:border-box}body{margin:0;background:#f6f6f6;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}button{font:inherit}button:disabled{opacity:.45}.evidence-note{background:#fff7cc;color:#765814;font-size:11px;padding:8px;line-height:1.5}</style><div class="evidence-note">正式 WXML/WXSS 派生浏览器预览，仓库为已留存真实响应；账号名称是布局示例。不是微信原生或真机证据。</div><div id="app"></div><script src="nav-vue.js"></script><script>${code}</script>`);
 console.log('Created integrated D2 browser rendering; not native/phone');process.exit(0);
}

// C1297: existing preview entry, actual page WXML/WXSS plus recorded production-page states.
// No API, credentials, new miniapp project or production route is introduced.
if (process.argv.includes("--c1297")) {
  const states = JSON.parse(fs.readFileSync(path.join(output, "c1297-page-states.json")));
  const readPage = f => fs.readFileSync(path.join(mini, f), "utf8");
  const pageTemplate = f => convert(readPage(f))
    .replace(/<\/?block\b/g,m=>m.replace("block","template"))
    .replace(/<(\/?)(?:swiper-item|swiper)\b/g,"<$1div")
    .replace(/<image\b/g,"<img")
    .replace(/\s+:src="[^"]*"/g,' data-isolated-image="true"')
    .replace(/<text\b/g,"<span").replace(/<\/text>/g,"</span>");
  const css = ["app.wxss","pages/props/product.wxss","pages/props/scan/index.wxss"]
    .map(readPage).join("\n").replace(/@import[^;]+;/g,"")
    + readPage("pages/props/common.wxss");
  fs.copyFileSync(path.join(root,"admin-web/node_modules/vue/dist/vue.global.prod.js"),path.join(output,"c1297-vue.js"));
  const data = JSON.stringify(states).replace(/</g,"\\u003c");
  const combined=JSON.stringify('<div><template v-if="kind===\'product\'">'+pageTemplate("pages/props/product.wxml")+'</template><template v-else>'+pageTemplate("pages/props/scan/index.wxml")+'</template></div>');
  const html = `<!doctype html><meta charset="utf-8"><title>C1297 正式页面响应重放</title>
<style>${css.replace(/page\s*\{/g,"body{").replace(/([0-9.]+)rpx/g,(_,v)=>Number(v)/2+"px")}
body{margin:0;background:#eef0f4}.test-tools{padding:16px;background:#fff;font:14px sans-serif;position:relative;z-index:20}.test-tools button{margin:4px}.phone{width:390px;min-height:844px;margin:20px auto;background:#f7f7f7;position:relative;overflow:hidden}.phone .footer-actions{position:sticky;bottom:0}.phone img{background:#dedede}.evidence-label{padding:12px;color:#763e00;background:#fff3ce}button:disabled{opacity:.35}</style>
<div id="app"></div><script src="c1297-vue.js"></script><script>
const states=${data};const methods={dates(){this.$emit('event','更改租期')},unavailable(){this.$emit('event','占位操作')},preview(){},failed(){},imageError(){},load(){},login(){},scan(){},retry(){},save(){},recognize(){this.$emit('event','确认识别')},confirm(){this.$emit('event','确认贴标')}};
const PageView={props:['state','kind'],computed:{...Object.fromEntries([...new Set(Object.values(states).flatMap(s=>Object.keys(s)))].map(k=>[k,function(){return this.state[k]}]))},methods,template:${combined}};
Vue.createApp({components:{PageView},data:()=>({states,selected:'aUnavailable',events:[]}),computed:{kind(){return this.selected.includes('Qr')?'scan':'product'}},template:\`<div><div class="test-tools"><b>真实HTTP→正式页面模块→WXML/WXSS派生渲染</b><p>仅浏览器响应重放；不是微信开发工具或物理手机。无业务网络请求，隔离素材显示占位。</p><button v-for="(s,k) in states" @click="selected=k;events=[]">{{k}}</button><p>当前 {{selected}} · 事件 {{events.join('，')||'无'}}</p></div><div class="phone"><div class="evidence-label">隔离响应重放 · {{selected}}</div><PageView :state="states[selected]" :kind="kind" @event="events.push($event)"/></div></div>\`}).mount('#app');
</script>`;
  fs.writeFileSync(path.join(output,"c1297-render.html"),html);
  console.log("Created C1297 response-replay rendering; NOT native/phone:",output);
  process.exit(0);
}

const read = (file) => fs.readFileSync(path.join(mini, file), "utf8");
const card = convert(read("components/prop-grid/index.wxml"));
const home = convert(read("pages/home/index.wxml")).replace(
  'state="feedState"',
  'state="feedState" :example="false"'
);
const items = [
  {
    name: "中世纪双手巨斧",
    styles: ["西洋古典", "国风东方"],
    category: "道具",
    price: 80,
  },
  {
    name: "复古金属烛台",
    styles: ["西洋古典", "现代当代"],
    category: "灯具",
    price: 45,
  },
  {
    name: "木质旧书桌",
    styles: ["民国港风", "现代当代"],
    category: "家具",
    price: 120,
  },
  {
    name: "青绿色宫墙景片",
    styles: ["国风东方", "民国港风", "西洋古典"],
    category: "舞台结构件",
    price: 260,
  },
];
fs.copyFileSync(
  path.join(root, "admin-web/node_modules/vue/dist/vue.global.prod.js"),
  path.join(output, "vue.global.prod.js")
);
for (const state of ["ready", "empty", "loading", "unconnected", "long"]) {
  const cards =
    state === "long"
      ? items.map((i) => ({
          ...i,
          name: i.name + " · 窄屏长文案与多风格标签边界检查",
          styles: [...i.styles, "超长风格标签测试"],
        }))
      : items;
  const css =
    read("app.wxss").replace(/page\s*\{/g, "body{") +
    read("pages/home/index.wxss") +
    read("components/prop-grid/index.wxss") +
    read("custom-tab-bar/index.wxss");
  const template =
    '<div class="native-bar">首页</div>' +
    home +
    "<div class=\"tabbar\"><div v-for=\"(tab,index) in ['首页','方案','清单','消息','我的']\" :class=\"['tab',{active:index===0}]\"><div class=\"tab-icon\"></div><span>{{tab}}</span></div></div>";
  const app = `Vue.createApp({data:()=>({feedState:${JSON.stringify(
    state === "long" ? "ready" : state
  )},items:${JSON.stringify(
    cards
  )},styles:['国风东方','西洋古典']}),methods:{unavailable(){},reset(){this.styles=[]},activity(){}},template:${JSON.stringify(
    template
  )}}).component('prop-grid',{props:['items','state','example'],methods:{unavailable(){}},template:${JSON.stringify(
    card
  )}}).mount('#app')`;
  fs.writeFileSync(
    path.join(output, "preview-" + state + ".html"),
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>示例组件预览</title><style>' +
      css +
      '*{box-sizing:border-box}body{margin:0}button{border:0}.native-bar{height:48px;display:grid;place-items:center;background:white;font-size:22px;font-weight:900}.tabbar{padding-bottom:24px}.preview-label{height:48px;display:flex;align-items:center;background:#111827;color:#ffe100;padding:8px;font-size:12px}</style><div class="preview-label">示例 · 独立组件预览，无真实商品与交易</div><div id="app"></div><script src="vue.global.prod.js"></script><script>' +
      app +
      "</script>"
  );
}
console.log("Created independent previews from production WXML/WXSS:", output);
