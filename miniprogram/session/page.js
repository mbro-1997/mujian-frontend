const activity = require("./activity");
const session = require("./storage");
const subscriptions = new WeakMap();

// 公共页面边界：失效异步任务的catch/finally同样不能更新新会话页面。
module.exports = function registerPage(options) {
  const initial = Object.assign({ returnRefresh: false }, options.data);
  function watch(page) {
    if (subscriptions.has(page)) return;
    subscriptions.set(
      page,
      session.subscribe((message) => {
        const reset = Object.assign({}, initial, { busy: false, message });
        // 私有返回目标也随会话失效，不把旧对象带入新账号。
        reset.returnPath = "/pages/home/index";
        page._navigationQuery = {};
        page._navigationInvalidated = true;
        page.setData(reset);
        if (options.onSessionReset) options.onSessionReset.call(page);
      }),
    );
  }
  const guard = require("../navigation/guard"), state = require("../navigation/state");
  function deny(page, message) {
    page._presentedOwner = null;
    state.forget(page);
    page.setData({ ...initial, busy: false, message: message || "" });
    if (page.onSessionReset) page.onSessionReset();
  }
  const onLoad=options.onLoad,onShow=options.onShow,onHide=options.onHide,onScroll=options.onPageScroll;
  options.onLoad=function(q={}){
    this._navigationQuery=q;
    this._navigationInvalidated=false;
    const page=this;
    const start=async()=>{
      try{
        if(!await guard.enter(page,q)){deny(page);return false;}
        if(onLoad)await onLoad.call(page,q);
        state.restore(page);page._navigationFirstShow = session.capture();return true;
      }catch(e){if([401,403,404].includes(e.status))deny(page,e.message);page.setData({message:e.message,busy:false});return false;}
    };
    // 非受保护页维持原生命周期时序（包括公开浏览/扫码自己的登录恢复）。
    if(!guard.protectedRoute(this.route)){const result=onLoad&&onLoad.call(this,q);state.restore(this);return result;}
    this._navigationLoad=start();return this._navigationLoad;
  };
  options.onShow=async function(...args){
    const visit = this._visibleVisit = {};
    this.setData({ nativeBackAvailable: typeof getCurrentPages === "function" && getCurrentPages().length > 1 });
    activity.report();
    if(this._navigationInvalidated && guard.protectedRoute(this.route)){wx.switchTab({url:"/pages/home/index"});return;}
    if(this._navigationLoad && !await this._navigationLoad)return;
    try{
      const first = this._navigationFirstShow;
      this._navigationFirstShow = null;
      if(guard.protectedRoute(this.route) && !(first && session.isCurrent(first)) &&
          !await guard.enter(this,this._navigationQuery||{})){deny(this);return;}
      if (this._visibleVisit !== visit) return;
      const background = this._presentedOwner && session.isCurrent(this._presentedOwner);
      if (background) this.setData({ returnRefresh: true });
      const owner = session.capture();
      try {
        const result = onShow && await onShow.apply(this,args);
        if (this._visibleVisit === visit && session.isCurrent(owner)) {
          this._presentedOwner = !this.data.message && !this.data.rootMessage ? owner : null;
          state.scroll(this);
        }
        return result;
      } finally {
        if (background && this._visibleVisit === visit) this.setData({ returnRefresh: false });
      }
    }catch(e){if([401,403,404].includes(e.status))deny(this,e.message);this.setData({message:e.message,busy:false});}
  };
  options.onHide=function(...args){this._visibleVisit=null;this._navigationFirstShow=null;if(this.data.returnRefresh)this.setData({returnRefresh:false});state.save(this);return onHide&&onHide.apply(this,args);};
  options.onPageScroll=function(e){this._navigationScroll=e.scrollTop;return onScroll&&onScroll.call(this,e);};
  options.restoreNavigationState=function(){state.restore(this);};
  options.navigationBack=function(){guard.back(this);};
  options.navigationRetry=async function(){
    if(guard.protectedRoute(this.route)){this._navigationLoad=null;await this.onLoad(this._navigationQuery||{});return this.onShow();}
  };
  const onUnload = options.onUnload;
  options.onUnload = function (...args) {
    const stop = subscriptions.get(this);
    if (stop) stop();
    subscriptions.delete(this);
    return onUnload && onUnload.apply(this, args);
  };
  options.activity = activity.interaction;
  for (const [name, handler] of Object.entries(options)) {
    if (typeof handler !== "function") continue;
    options[name] = function (...args) {
      const page = this;
      if (name !== "onUnload") watch(page);
      const owner = session.capture();
      if (!name.startsWith("on") && name !== "activity")
        activity.interaction(args[0]);
      // 方法仍绑定真实Page；仅本次调用的setData按发起代次隔离。
      const scoped = new Proxy(page, {
        get(target, property) {
          if (property === "setData")
            return (...updates) => {
              if (session.isCurrent(owner)) target.setData(...updates);
            };
          const value = target[property];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      // onUnload必须以真实Page解除订阅。
      return handler.apply(name === "onUnload" ? page : scoped, args);
    };
  }
  Page(options);
};
