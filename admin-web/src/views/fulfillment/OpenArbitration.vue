<script setup lang="ts">
import {ref,watch} from 'vue';
import {useRouter} from 'vue-router';
import {api} from '../../api/http';
import {command,hasPending,recover,tradeError} from '../../api/trading';
import {useSessionView} from '../../session/view';
const props=defineProps<{orderId:string;sourceId:string;sourceType:'overdue_impact'|'receipt_problem';evidenceIds?:string[]}>();
const summary=ref(''),busy=ref(false),message=ref(''),router=useRouter();
const session=useSessionView(()=>{summary.value='';message.value='';busy.value=false;});
watch(()=>props.sourceId,()=>{summary.value='';message.value='';});
async function open(){
  const owner=session.capture(),id=props.sourceId,slot='open-arbitration:'+id,order=props.orderId;
  if(busy.value)return;busy.value=true;message.value='';
  try{
    if(hasPending(slot))await recover(slot);
    else{
      const r=await api<{version:number}>('/api/admin/rental-orders/'+order);
      if(!session.current(owner) || id!==props.sourceId)return;
      await command(slot,'/api/admin/rental-orders/'+order+'/arbitrations',{expectedVersion:r.version,sourceType:props.sourceType,sourceId:id,
        summary:summary.value.trim(),evidence:{evidenceIds:props.evidenceIds || [],uploadReceiptIds:[]}});
    }
    if(session.current(owner) && id===props.sourceId)await router.push({path:'/fulfillment/arbitrations',query:{orderId:order}});
  }catch(e){if(session.current(owner) && id===props.sourceId)message.value=tradeError(e);}
  finally{if(session.current(owner))busy.value=false;}
}
</script>
<template>
  <form @submit.prevent="open">
    <label>
      转仲裁事由
      <el-input v-model="summary" required maxlength="500" type="textarea" />
    </label>
    <el-button
      :disabled="busy || (!summary.trim() && !hasPending('open-arbitration:' + sourceId))"
      native-type="submit">
      {{ hasPending('open-arbitration:' + sourceId) ? '查询转办结果' : '转交仲裁' }}
    </el-button>
    <p v-if="message" role="alert">{{ message }}</p>
  </form>
</template>
