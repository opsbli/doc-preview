<script setup lang="ts">
import type { RendererHandle } from '../base.types';
import type { ToolbarGroup } from '../toolbar.types';
import type { DrawioDiagram } from '@opsbli/file-preview-core';

import { ref, watch, onBeforeUnmount } from 'vue';
import { Graph, ModelXmlSerializer } from '@maxgraph/core';
import '@maxgraph/core/css/common.css';
import { Maximize } from 'lucide-vue-next';
import { fetchTextUtf8, parseDrawio } from '@opsbli/file-preview-core';
import { useTranslator } from '../../composables/useTranslator';
import { useFetcher } from '../../composables/useRequest';
import RendererError from '../RendererError.vue';

const props = defineProps<{
  url: string;
}>();

const { t } = useTranslator();
const fetcher = useFetcher();

const loading = ref(true);
const error = ref<string | null>(null);
const diagrams = ref<DrawioDiagram[]>([]);
const activeIndex = ref(0);
const containerRef = ref<HTMLDivElement | null>(null);
let graph: Graph | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeTimer: number | null = null;
let disposed = false;

/** 让图形适应容器 */
const fit = () => {
  const container = containerRef.value;
  if (!graph || !container) return;

  const bounds = graph.view.getGraphBounds();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

  const pad = 16;
  const scale = Math.min(
    (container.clientWidth - pad * 2) / bounds.width,
    (container.clientHeight - pad * 2) / bounds.height,
    1,
  );
  const safeScale = scale > 0.01 ? scale : 1;
  graph.view.scaleAndTranslate(safeScale, -bounds.x * safeScale + pad, -bounds.y * safeScale + pad);
};

const destroyGraph = () => {
  if (graph) {
    try {
      graph.destroy();
    } catch {
      // 忽略销毁异常
    }
    graph = null;
  }
  if (containerRef.value) containerRef.value.innerHTML = '';
};

/** 渲染当前页 */
const renderDiagram = () => {
  const container = containerRef.value;
  const diagram = diagrams.value[activeIndex.value];
  if (!container || !diagram) return;

  destroyGraph();

  try {
    const instance = new Graph(container);
    instance.setEnabled(false);
    const serializer = new ModelXmlSerializer(instance.getDataModel());
    serializer.import(diagram.xml);
    instance.view.validate();
    graph = instance;
    fit();
  } catch (err) {
    console.error('drawio 渲染错误:', err);
    error.value = err instanceof Error && err.message ? err.message : t.value('drawio.parse_failed');
  }
};

const load = async () => {
  loading.value = true;
  error.value = null;
  diagrams.value = [];
  activeIndex.value = 0;
  destroyGraph();

  try {
    const text = await fetchTextUtf8(props.url, { fetcher: fetcher.value });
    const parsed = await parseDrawio(text);
    if (disposed) return;
    diagrams.value = parsed.diagrams;
    activeIndex.value = 0;
  } catch (err) {
    console.error('drawio 解析错误:', err);
    error.value = err instanceof Error && err.message ? err.message : t.value('drawio.parse_failed');
  } finally {
    loading.value = false;
  }
};

watch(() => props.url, load, { immediate: true });

// 图表数据或当前页变化后重绘
watch([diagrams, activeIndex, loading], () => {
  if (!loading.value && diagrams.value.length > 0) renderDiagram();
});

// 容器尺寸变化时重新适应
watch(containerRef, (container) => {
  resizeObserver?.disconnect();
  if (!container) return;
  resizeObserver = new ResizeObserver(() => {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(fit, 150);
  });
  resizeObserver.observe(container);
});

onBeforeUnmount(() => {
  disposed = true;
  resizeObserver?.disconnect();
  if (resizeTimer) window.clearTimeout(resizeTimer);
  destroyGraph();
});

const getToolbarGroups = (): ToolbarGroup[] => [];

defineExpose<RendererHandle>({
  getToolbarGroups,
});
</script>

<template>
  <div v-if="loading" class="vfp-flex vfp-items-center vfp-justify-center vfp-w-full vfp-h-full">
    <div
      class="vfp-w-12 vfp-h-12 vfp-border-4 vfp-border-line-strong vfp-border-t-spinner-head vfp-rounded-full vfp-animate-spin"
    />
  </div>

  <RendererError v-else-if="error" :message="error" />

  <div v-else class="vfp-w-full vfp-h-full vfp-flex vfp-flex-col" style="min-height: 0">
    <div
      class="vfp-flex vfp-items-center vfp-gap-2 vfp-px-4"
      style="flex: 0 0 auto; height: 2.25rem; border-bottom: 1px solid var(--fp-line-weak); background: var(--fp-surface-1)"
    >
      <div v-if="diagrams.length > 1" class="vfp-flex vfp-items-center vfp-gap-1 vfp-overflow-auto">
        <button
          v-for="(diagram, index) in diagrams"
          :key="`${diagram.name}-${index}`"
          type="button"
          class="vfp-rounded-sm vfp-text-xs"
          :style="{
            padding: '0.15rem 0.5rem',
            border: '1px solid var(--fp-line-weak)',
            cursor: 'pointer',
            color: index === activeIndex ? 'var(--fp-fg-primary)' : 'var(--fp-fg-tertiary)',
            background: index === activeIndex ? 'var(--fp-accent-soft)' : 'transparent',
          }"
          @click="activeIndex = index"
        >
          {{ diagram.name || `Page ${index + 1}` }}
        </button>
      </div>

      <button
        type="button"
        :title="t('toolbar.fit_to_window')"
        :aria-label="t('toolbar.fit_to_window')"
        class="vfp-flex vfp-items-center vfp-justify-center"
        style="margin-left: auto; width: 1.5rem; height: 1.5rem; border: none; background: transparent; color: var(--fp-fg-secondary); cursor: pointer"
        @click="fit"
      >
        <Maximize :size="14" />
      </button>
    </div>

    <div
      ref="containerRef"
      class="vfp-w-full"
      style="flex: 1 1 auto; min-height: 0; overflow: auto; background: #fff"
    />
  </div>
</template>
