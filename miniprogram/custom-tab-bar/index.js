const routes=require("../constants/routes");
Component({data:{selected:0,hidden:false,items:routes.items(null)},methods:{switchTab(e){require("../session/activity").interaction(e);const item=this.data.items[Number(e.currentTarget.dataset.index)];if(item)wx.switchTab({url:item.path});}}});
