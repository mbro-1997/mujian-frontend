import { onUnmounted } from "vue";
import { capture, isCurrent, onSessionChange } from "./boundary";
// 组件卸载和会话变化都终止旧视图的写回；重置只处理该页临时数据。
export function useSessionView(reset: () => void) {
  let mounted = true;
  const stop = onSessionChange(reset);
  onUnmounted(() => {
    mounted = false;
    stop();
  });
  return { capture, current: (owner: number) => mounted && isCurrent(owner) };
}
