<script setup lang="ts">
import type { RendererHandle } from '../base.types';
import type { ToolbarGroup } from '../toolbar.types';
import type { ArchiveHandle, ZipEntryInfo } from '@opsbli/file-preview-core';

import { ref, computed, watch, onBeforeUnmount, defineAsyncComponent } from 'vue';
import { Folder, File as FileIcon } from 'lucide-vue-next';
import { loadArchive, inferMimeType } from '@opsbli/file-preview-core';
import { useTranslator } from '../../composables/useTranslator';
import { useFetcher } from '../../composables/useRequest';
import RendererError from '../RendererError.vue';

const props = defineProps<{
  url: string;
  /** 原始文件名（用于判断 tar / tgz / gz / 7z / rar） */
  fileName?: string;
}>();

// 懒加载 FilePreviewContent 以打破循环依赖
const LazyFilePreviewContent = defineAsyncComponent(() => import('../../FilePreviewContent.vue'));

const { t } = useTranslator();
const fetcher = useFetcher();

/** 单次渲染的最大条目数，避免超大归档卡顿 */
const MAX_ROWS = 2000;

const archive = ref<ArchiveHandle | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const selectedPath = ref<string | null>(null);
const selectedName = ref('');
const selectedUrl = ref('');
const previewLoading = ref(false);
const previewError = ref<string | null>(null);
let archiveHandle: ArchiveHandle | null = null;

const formatSize = (bytes: number) => {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

const releaseBlobUrl = () => {
  if (selectedUrl.value) {
    URL.revokeObjectURL(selectedUrl.value);
    selectedUrl.value = '';
  }
};

const rows = computed(() => {
  if (!archive.value) return [] as { entry: ZipEntryInfo; depth: number }[];
  return [...archive.value.entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => {
      const segments = entry.path.replace(/\/$/, '').split('/').filter(Boolean);
      return { entry, depth: Math.max(0, segments.length - 1) };
    });
});

const visibleRows = computed(() => rows.value.slice(0, MAX_ROWS));
const truncated = computed(() => rows.value.length > MAX_ROWS);

const previewFiles = computed(() => {
  if (!selectedUrl.value) return [];
  return [{ name: selectedName.value, url: selectedUrl.value, type: inferMimeType(selectedName.value) }];
});

const selectEntry = async (entry: ZipEntryInfo) => {
  if (!archive.value || entry.isDir) return;

  releaseBlobUrl();
  selectedPath.value = null;
  previewError.value = null;
  previewLoading.value = true;

  try {
    const mime = inferMimeType(entry.name);
    const blob = await archive.value.readBlob(entry.path, mime !== 'application/octet-stream' ? mime : undefined);
    selectedUrl.value = URL.createObjectURL(blob);
    selectedName.value = entry.name;
    selectedPath.value = entry.path;
  } catch (err) {
    console.error('压缩包条目读取失败:', err);
    previewError.value = t.value('archive.load_failed');
  } finally {
    previewLoading.value = false;
  }
};

const disposeArchive = () => {
  if (archiveHandle) {
    archiveHandle.dispose();
    archiveHandle = null;
  }
};

const load = async () => {
  loading.value = true;
  error.value = null;
  archive.value = null;
  disposeArchive();
  releaseBlobUrl();
  selectedPath.value = null;
  selectedName.value = '';

  try {
    const response = await fetcher.value(props.url, { mode: 'cors', credentials: 'omit', redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`文件加载失败 (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    const handle = await loadArchive(buffer, props.fileName);
    archiveHandle = handle;
    archive.value = handle;
  } catch (err) {
    console.error('压缩包解析错误:', err);
    error.value = err instanceof Error && err.message ? err.message : t.value('archive.parse_failed');
  } finally {
    loading.value = false;
  }
};

watch(() => [props.url, props.fileName], load, { immediate: true });

onBeforeUnmount(() => {
  releaseBlobUrl();
  disposeArchive();
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

  <RendererError v-else-if="error || !archive" :message="error || t('archive.parse_failed')" />

  <div
    v-else-if="rows.length === 0"
    class="vfp-flex vfp-items-center vfp-justify-center vfp-w-full vfp-h-full vfp-text-fg-muted vfp-text-sm"
  >
    {{ t('archive.empty') }}
  </div>

  <div v-else class="vfp-flex vfp-w-full vfp-h-full" style="min-height: 0">
    <!-- 左：条目列表 -->
    <div
      class="vfp-flex-shrink-0 vfp-overflow-auto"
      style="width: 17rem; border-right: 1px solid var(--fp-line-weak)"
    >
      <ul style="margin: 0; padding: 0.5rem 0; list-style: none">
        <li v-for="{ entry, depth } in visibleRows" :key="entry.path">
          <button
            type="button"
            :disabled="entry.isDir"
            :title="entry.path"
            class="vfp-flex vfp-items-center vfp-w-full vfp-gap-1 vfp-text-xs"
            :style="{
              padding: '0.25rem 0.5rem',
              paddingLeft: `${0.5 + depth * 0.9}rem`,
              textAlign: 'left',
              border: 'none',
              background: selectedPath === entry.path ? 'var(--fp-accent-soft)' : 'transparent',
              color: entry.isDir ? 'var(--fp-fg-primary)' : 'var(--fp-fg-secondary)',
              fontWeight: entry.isDir ? 600 : 400,
              cursor: entry.isDir ? 'default' : 'pointer',
            }"
            @click="selectEntry(entry)"
          >
            <Folder v-if="entry.isDir" :size="13" />
            <FileIcon v-else :size="13" />
            <span style="flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
              {{ entry.name }}
            </span>
            <span
              v-if="!entry.isDir"
              style="flex: 0 0 auto; color: var(--fp-fg-muted); font-size: 0.7rem"
              >{{ formatSize(entry.size) }}</span
            >
          </button>
        </li>
      </ul>
      <p v-if="truncated" class="vfp-text-xs vfp-text-fg-muted" style="padding: 0 0.5rem 0.5rem">
        {{ t('archive.truncated', { count: MAX_ROWS }) }}
      </p>
    </div>

    <!-- 右：内嵌预览 -->
    <div class="vfp-flex-1 vfp-min-w-0 vfp-h-full vfp-flex vfp-flex-col">
      <div
        v-if="!selectedUrl && !previewLoading"
        class="vfp-flex vfp-items-center vfp-justify-center vfp-w-full vfp-h-full vfp-text-fg-muted vfp-text-sm"
      >
        {{ previewError || t('archive.select_hint') }}
      </div>

      <div v-if="previewLoading" class="vfp-flex vfp-items-center vfp-justify-center vfp-w-full vfp-h-full">
        <div
          class="vfp-w-8 vfp-h-8 vfp-border-4 vfp-border-line-strong vfp-border-t-spinner-head vfp-rounded-full vfp-animate-spin"
        />
      </div>

      <div v-if="selectedUrl && !previewLoading" class="vfp-flex-1 vfp-min-h-0 vfp-overflow-hidden vfp-flex">
        <LazyFilePreviewContent mode="embed" :files="previewFiles" :current-index="0" />
      </div>
    </div>
  </div>
</template>
