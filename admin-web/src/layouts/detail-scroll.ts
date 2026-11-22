import { nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';

// 同一路由内的列表和详情共享滚动容器，返回时恢复原列表的位置。
export function useDetailScroll(showing: () => boolean | number) {
  const route = useRoute();
  const positions = new Map<number, number>();
  watch([() => route.path, showing], async ([path, detail], [previous, wasDetail], onCleanup) => {
    const area = document.querySelector<HTMLElement>('.app-main > .page');
    if (!area) return;
    const depth = Number(detail);
    const previousDepth = Number(wasDetail);
    if (path !== previous) positions.clear();
    else if (depth > previousDepth) positions.set(previousDepth, area.scrollTop);
    const position = path === previous && depth < previousDepth ? positions.get(depth) ?? 0 : 0;
    let current = true;
    onCleanup(() => { current = false; });
    await nextTick();
    if (current) area.scrollTop = position;
  });
}
