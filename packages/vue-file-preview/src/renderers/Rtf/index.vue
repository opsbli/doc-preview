<script setup lang="ts">
import type { RendererHandle } from '../base.types';
import type { ToolbarGroup } from '../toolbar.types';

import { ref, watch } from 'vue';
import { RTFJS } from 'rtf.js';
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
const containerRef = ref<HTMLDivElement | null>(null);
let disposed = false;

const load = async () => {
  loading.value = true;
  error.value = null;

  try {
    const response = await fetcher.value(props.url, { mode: 'cors', credentials: 'omit', redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`文件加载失败 (${response.status})`);
    }
    const buffer = await response.arrayBuffer();

    RTFJS.loggingEnabled(false);
    const document = new RTFJS.Document(buffer, {});
    const elements = await document.render();

    if (disposed || !containerRef.value) return;
    containerRef.value.replaceChildren(...elements);
  } catch (err) {
    if (disposed) return;
    console.error('RTF 渲染错误:', err);
    error.value = t.value('rtf.parse_failed');
  } finally {
    if (!disposed) loading.value = false;
  }
};

watch(() => props.url, load, { immediate: true });

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

  <div v-else class="vfp-w-full vfp-h-full vfp-overflow-auto" style="background: #fff">
    <div ref="containerRef" style="padding: clamp(12px, 3vw, 24px)" />
  </div>
</template>
