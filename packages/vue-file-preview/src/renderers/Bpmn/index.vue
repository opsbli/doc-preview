<script setup lang="ts">
import type { RendererHandle } from '../base.types';
import type { ToolbarGroup } from '../toolbar.types';
import type BpmnViewer from 'bpmn-js/lib/Viewer';

import { ref, watch, onBeforeUnmount } from 'vue';
import { fetchTextUtf8 } from '@opsbli/file-preview-core';
import { useTranslator } from '../../composables/useTranslator';
import { useFetcher } from '../../composables/useRequest';
import RendererError from '../RendererError.vue';

// bpmn-js 的样式：diagram-js 布局 + bpmn 主题 + 内嵌图标字体。
// 样式随本渲染器所在 chunk 一并进入库的 style.css，无需使用方额外引入资源。
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

const props = defineProps<{
  url: string;
}>();

const { t } = useTranslator();
const fetcher = useFetcher();

const loading = ref(true);
const error = ref<string | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
let viewer: BpmnViewer | null = null;
let disposed = false;

const destroyViewer = () => {
  if (viewer) {
    try {
      viewer.destroy();
    } catch {
      // 忽略销毁异常
    }
    viewer = null;
  }
};

const load = async () => {
  loading.value = true;
  error.value = null;
  destroyViewer();

  try {
    const [{ default: ViewerCtor }, xml] = await Promise.all([
      import('bpmn-js/lib/Viewer'),
      fetchTextUtf8(props.url, { fetcher: fetcher.value }),
    ]);

    if (disposed || !containerRef.value) return;

    viewer = new ViewerCtor({ container: containerRef.value });
    await viewer.importXML(xml);

    if (disposed) return;

    // 自适应画布大小
    const canvas = viewer.get('canvas') as { zoom: (value: string | number) => void };
    canvas.zoom('fit-viewport');
  } catch (err) {
    if (disposed) return;
    console.error('BPMN 解析错误:', err);
    error.value = err instanceof Error && err.message ? err.message : t.value('bpmn.parse_failed');
  } finally {
    if (!disposed) loading.value = false;
  }
};

watch(() => props.url, load, { immediate: true });

onBeforeUnmount(() => {
  disposed = true;
  destroyViewer();
});

const getToolbarGroups = (): ToolbarGroup[] => [];

defineExpose<RendererHandle>({
  getToolbarGroups,
});
</script>

<template>
  <RendererError v-if="error" :message="error" />

  <div v-else class="vfp-w-full vfp-h-full vfp-relative" style="background: white; min-height: 0">
    <div ref="containerRef" class="vfp-w-full vfp-h-full" style="position: absolute; inset: 0" />
    <div
      v-if="loading"
      class="vfp-flex vfp-items-center vfp-justify-center"
      style="position: absolute; inset: 0"
    >
      <div
        class="vfp-w-12 vfp-h-12 vfp-border-4 vfp-border-line-strong vfp-border-t-spinner-head vfp-rounded-full vfp-animate-spin"
      />
    </div>
  </div>
</template>
