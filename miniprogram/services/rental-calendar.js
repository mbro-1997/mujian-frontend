const DAY=86400000;
function valid(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||"") && Number.isFinite(Date.parse(value+"T00:00:00Z")) && new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;}
function today(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10);}
function days(start,end){return valid(start)&&valid(end)?(Date.parse(end)-Date.parse(start))/DAY+1:0;}
function allowed(start,end,min=today()){const count=days(start,end);return start>=min&&count>=1&&count<=120;}
function month(value,offset){const d=new Date(value+"-01T00:00:00Z");d.setUTCMonth(d.getUTCMonth()+offset);return d.toISOString().slice(0,7);}
function cells(value,start,end,min=today()){
 const first=new Date(value+"-01T00:00:00Z"),offset=(first.getUTCDay()+6)%7;
 return Array.from({length:42},(_,i)=>{const d=new Date(first.getTime()+(i-offset)*DAY),date=d.toISOString().slice(0,10),outside=date.slice(0,7)!==value;
 const selected = date === start && date === end ? "取货和归还" : date === start ? "取货" : date === end ? "归还" : start && end && date > start && date < end ? "租期内" : "";
 const status = outside ? "非本月，不可选" : date < min ? "已过期，不可选" : selected;
 const accessibleLabel = date.slice(0, 4) + "年" + label(date) + (status ? "，" + status : "");
 return {date,accessibleLabel,day:d.getUTCDate(),disabled:outside||date<min,start:date===start,end:date===end,inRange:!!(start&&end&&date>start&&date<end)};});
}
function label(value){if(!valid(value))return "请选择";const d=new Date(value+"T00:00:00Z");return `${d.getUTCMonth()+1}月${d.getUTCDate()}日 周${"日一二三四五六"[d.getUTCDay()]}`;}
module.exports={valid,today,days,allowed,month,cells,label};
