<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Eye, Code } from 'lucide-vue-next';
import { fetchTextUtf8, prepareHtmlForSandbox } from '@opsbli/file-preview-core';
import { useTranslator } from '../../composables/useTranslator';
import { useFetcher } from '../../composables/useRequest';
import { useShikiHighlight } from '../../composables/useShikiHighlight';
import RendererError from '../RendererError.vue';
import { ToolbarEventEmitter } from '../base.types';
import type { RendererHandle } from '../base.types';
import type { ToolbarGroup } from '../toolbar.types';

const props = defineProps<{
  url: string;
}>();

const emitter = new ToolbarEventEmitter();

const { t } = useTranslator();
const fetcher = useFetcher();

// 内部状态
const viewMode = ref<'preview' | 'source'>('preview');
const content = ref('');
const loading = ref(true);
const error = ref<string | null>(null);

const sourceInput = computed(() => (viewMode.value === 'source' ? content.value : ''));
const sourceLang = computed(() => 'html');
const { html: sourceHtml } = useShikiHighlight(sourceInput, sourceLang);

// 预览内容：去掉会改写基准路径 / 自动跳转的元素（脚本与同源访问已由 sandbox 阻断）
const previewHtml = computed(() => prepareHtmlForSandbox(content.value));

// 监听状态变化，通知工具栏更新
watch([viewMode, loading], () => {
  emitter.notify();
});

// 工具栏配置（对齐 React：Code 图标、翻译 key）
const getToolbarGroups = (): ToolbarGroup[] => [
  {
    items: [
      {
        type: 'button',
        icon: viewMode.value === 'preview' ? Code : Eye,
        tooltip: viewMode.value === 'preview' ? t.value('toolbar.source') : t.value('toolbar.preview'),
        action: () => {
          viewMode.value = viewMode.value === 'preview' ? 'source' : 'preview';
        },
        active: viewMode.value === 'source',
      },
    ],
  },
];

defineExpose<RendererHandle>({
  getToolbarGroups,
  onToolbarChange: (listener) => emitter.subscribe(listener),
});

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    content.value = await fetchTextUtf8(props.url, { fetcher: fetcher.value });
  } catch (err) {
    console.error(err);
    error.value = t.value('html.load_failed');
  } finally {
    loading.value = false;
  }
};

watch(() => props.url, load, { immediate: true });
</script>

<template>
  <div v-if="loading" class="vfp-flex vfp-items-center vfp-justify-center vfp-w-full vfp-h-full">
    <div
      class="vfp-w-12 vfp-h-12 vfp-border-4 vfp-border-line-strong vfp-border-t-spinner-head vfp-rounded-full vfp-animate-spin"
    />
  </div>

  <RendererError v-else-if="error" :message="error" />

  <div v-else-if="viewMode === 'source'" class="vfp-w-full vfp-h-full vfp-overflow-auto" style="background: var(--fp-code-bg)">
    <div v-if="!sourceHtml" class="vfp-p-6 vfp-text-fg-primary vfp-font-mono vfp-text-sm" style="white-space: pre-wrap; word-break: break-word">
      {{ content }}
    </div>
    <div v-else class="shiki-wrapper with-line-numbers" v-html="sourceHtml" />
  </div>

  <div v-else class="vfp-w-full vfp-h-full">
    <iframe
      :title="t('html.preview_frame_title')"
      sandbox=""
      :srcdoc="previewHtml"
      class="vfp-w-full vfp-h-full vfp-border-0"
      style="background: #fff"
    />
  </div>
</template>
