const warehouse=require("../../navigation/warehouse");
require("../../session/page")({...warehouse,data:{...warehouse.data,selection:true}});
