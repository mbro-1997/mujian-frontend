// 查询条件、列表和滚动位置只保存在当前身份的运行期内存中。
const session=require("../session/storage");
let scope="", principal="", factoryId="";const states=new Map();
session.subscribe(()=>{scope="";principal="";factoryId="";states.clear();});
function bind(c,id){
 const p=[c.userId,c.roleCode||c.registrationStage].join(":");
 if(principal&&principal!==p){states.clear();factoryId="";}
 if(id&&factoryId&&id!==factoryId){session.replace(session.token());}
 principal=p;if(id)factoryId=id;scope=session.capture().generation+":"+p+":"+factoryId;
}
const fields={"pages/custom/index":["kind","status","page","rows","total","loadedRevision","choices","filterLabel","exhausted"],"pages/factory/custom":["kind","status","page","rows","total","loadedRevision","choices","filterLabel","exhausted"],"pages/orders/index":["view","keyword","submittedKeyword","page","items","total","loadedRevision","nextCheckAt","exhausted"],"pages/factory/orders":["view","keyword","submittedKeyword","page","items","total","loadedRevision","nextCheckAt","exhausted"],"pages/coupons/index":["status","page","items","total","availableCount","unavailableCount","loadedRevision","nextCheckAt","exhausted"],"pages/coupons/records":["page","items","total","seenRevision","exhausted"],"pages/mine/index":[],"pages/checklist/index":["keyword","submittedKeyword","tab","assetType","page","hasPendingLabel"],"pages/props/manage":["keyword","submittedKeyword","tab","assetType","page","hasPendingLabel"],"pages/props/reviews":["page"],"pages/inventory/select":["keyword","submittedKeyword","tab","assetType","page"],"pages/inventory/index":["page"],"pages/inventory/movements":["page","startDate","endDate","source","movement"],"pages/inventory/logs":["page"]};
function key(page){return scope+":"+page.route+":"+(page.data.skuId||page.data.id||"");}
function save(page) {
  const names = fields[page.route];
  if (!scope || !names) return;
  const values = {};
  for (const name of names) {
    if (page.data[name] !== undefined) values[name] = page.data[name];
  }
  if (!page._navigationInstance) page._navigationInstance = {};
  states.set(key(page), { instance: page._navigationInstance, values, top: page._navigationScroll || 0 });
}
function forget(page) { states.delete(key(page)); }
function restore(page) {
  if (!scope) return;
  const saved = states.get(key(page));
  // A mounted page still owns its scroll position; a recreated view needs the snapshot.
  if (!saved || saved.instance === page._navigationInstance) return;
  page.setData(saved.values);
  page._navigationRestore = saved.top;
}
function scroll(page){if(page._navigationRestore!==undefined&&wx.pageScrollTo){wx.pageScrollTo({scrollTop:page._navigationRestore,duration:0});delete page._navigationRestore;}}
module.exports={identity:()=>principal+":"+factoryId,bind,save,forget,restore,scroll};
