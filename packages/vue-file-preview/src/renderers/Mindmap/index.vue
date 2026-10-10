<script setup lang="ts">
import type { RendererHandle } from '../base.types';
import type { ToolbarGroup } from '../toolbar.types';
import type { MindmapNode, MindmapSheet } from '@opsbli/file-preview-core';

import { ref, watch } from 'vue';
import { Minus, Plus } from 'lucide-vue-next';
import { parseXmind, countMindmapNodes } from '@opsbli/file-preview-core';
import { useTranslator } from '../../composables/useTranslator';
import { useFetcher } from '../../composables/useRequest';
import RendererError from '../RendererError.vue';
import TreeNode from './TreeNode.vue';

const props = defineProps<{
  url: string;
}>();

const { t } = useTranslator();
const fetcher = useFetcher();

const sheets = ref<MindmapSheet[]>([]);
const activeSheet = ref(0);
const collapsedIds = ref<string[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

/** 收集所有非叶子节点的 id（用于「全部折叠」） */
const collectBranchIds = (node: MindmapNode, id: string, out: string[]): void => {
  if (node.children.length > 0) out.push(id);
  node.children.forEach((child, index) => collectBranchIds(child, `${id}-${index}`, out));
};

const toggle = (id: string) => {
  const current = collapsedIds.value;
  collapsedIds.value = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
};

const collapseAll = () => {
  const ids: string[] = [];
  const sheet = sheets.value[activeSheet.value];
  if (sheet) collectBranchIds(sheet.root, '0', ids);
  collapsedIds.value = ids;
};

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    const response = await fetcher.value(props.url, {
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`文件加载失败 (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    const parsed = await parseXmind(buffer);
    sheets.value = parsed.sheets;
    activeSheet.value = 0;
    collapsedIds.value = [];
  } catch (err) {
    console.error('XMind 解析错误:', err);
    error.value = err instanceof Error && err.message ? err.message : t.value('mindmap.load_failed');
  } finally {
    loading.value = false;
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

  <div
    v-else-if="!sheets[activeSheet]"
    class="vfp-flex vfp-items-center vfp-justify-center vfp-w-full vfp-h-full vfp-text-fg-tertiary vfp-text-sm"
  >
    {{ t('mindmap.empty') }}
  </div>

  <div v-else class="vfp-w-full vfp-h-full vfp-flex vfp-flex-col" style="min-height: 0">
    <div
      class="vfp-flex vfp-items-center vfp-gap-2 vfp-px-4"
      style="flex: 0 0 auto; height: 2.25rem; border-bottom: 1px solid var(--fp-line-weak); background: var(--fp-surface-1)"
    >
      <div v-if="sheets.length > 1" class="vfp-flex vfp-items-center vfp-gap-1 vfp-overflow-auto">
        <button
          v-for="(item, index) in sheets"
          :key="`${item.title}-${index}`"
          type="button"
          class="vfp-rounded-sm vfp-text-xs"
          :style="{
            padding: '0.15rem 0.5rem',
            border: '1px solid var(--fp-line-weak)',
            cursor: 'pointer',
            color: index === activeSheet ? 'var(--fp-fg-primary)' : 'var(--fp-fg-tertiary)',
            background: index === activeSheet ? 'var(--fp-accent-soft)' : 'transparent',
          }"
          @click="activeSheet = index"
        >
          {{ item.title }}
        </button>
      </div>

      <span class="vfp-text-xs vfp-text-fg-muted">{{ t('mindmap.topics', { count: countMindmapNodes(sheets[activeSheet].root) }) }}</span>

      <div class="vfp-flex vfp-items-center vfp-gap-1" style="margin-left: auto">
        <button
          type="button"
          class="vfp-flex vfp-items-center vfp-justify-center"
          style="width: 1.5rem; height: 1.5rem; border: none; background: transparent; color: var(--fp-fg-secondary); cursor: pointer"
          :title="t('mindmap.expand_all')"
          :aria-label="t('mindmap.expand_all')"
          @click="collapsedIds = []"
        >
          <Plus :size="14" />
        </button>
        <button
          type="button"
          class="vfp-flex vfp-items-center vfp-justify-center"
          style="width: 1.5rem; height: 1.5rem; border: none; background: transparent; color: var(--fp-fg-secondary); cursor: pointer"
          :title="t('mindmap.collapse_all')"
          :aria-label="t('mindmap.collapse_all')"
          @click="collapseAll"
        >
          <Minus :size="14" />
        </button>
      </div>
    </div>

    <div class="vfp-w-full" style="flex: 1 1 auto; min-height: 0; overflow: auto; padding: 1rem 1.25rem">
      <ul style="margin: 0; padding: 0">
        <TreeNode
          :node="sheets[activeSheet].root"
          node-id="0"
          :depth="0"
          :collapsed-ids="collapsedIds"
          @toggle="toggle"
        />
      </ul>
    </div>
  </div>
</template>
