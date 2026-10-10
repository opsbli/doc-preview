<script setup lang="ts">
import type { RendererHandle } from '../base.types';
import type { ToolbarGroup } from '../toolbar.types';
import type { DicomImage } from '@opsbli/file-preview-core';

import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { parseDicomImage, renderDicomFrame } from '@opsbli/file-preview-core';
import { useTranslator } from '../../composables/useTranslator';
import { useFetcher } from '../../composables/useRequest';
import RendererError from '../RendererError.vue';

const props = defineProps<{
  url: string;
}>();

const { t } = useTranslator();
const fetcher = useFetcher();

const image = ref<DicomImage | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const frame = ref(0);
const windowCenter = ref(0);
const windowWidth = ref(1);
const canvasRef = ref<HTMLCanvasElement | null>(null);
let rgbaBuffer: Uint8ClampedArray | null = null;
let dragStart: { x: number; y: number } | null = null;
let disposed = false;

const draw = () => {
  const canvas = canvasRef.value;
  const current = image.value;
  if (!canvas || !current) return;

  canvas.width = current.width;
  canvas.height = current.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  rgbaBuffer = renderDicomFrame(current, frame.value, windowCenter.value, windowWidth.value, rgbaBuffer ?? undefined);
  const imageData = ctx.createImageData(current.width, current.height);
  imageData.data.set(rgbaBuffer);
  ctx.putImageData(imageData, 0, 0);
};

const onPointerDown = (event: PointerEvent) => {
  dragStart = { x: event.clientX, y: event.clientY };
  (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
};

const onPointerMove = (event: PointerEvent) => {
  if (!dragStart) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  dragStart = { x: event.clientX, y: event.clientY };
  windowWidth.value = Math.max(1, windowWidth.value + dx * 2);
  windowCenter.value = windowCenter.value + dy * 2;
};

const onPointerUp = (event: PointerEvent) => {
  dragStart = null;
  const target = event.currentTarget as HTMLCanvasElement;
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
};

const load = async () => {
  loading.value = true;
  error.value = null;
  image.value = null;
  frame.value = 0;

  try {
    const response = await fetcher.value(props.url, { mode: 'cors', credentials: 'omit', redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`文件加载失败 (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    const parsed = parseDicomImage(buffer);
    if (disposed) return;
    image.value = parsed;
    windowCenter.value = parsed.windowCenter;
    windowWidth.value = parsed.windowWidth;
    await nextTick();
    draw();
  } catch (err) {
    if (disposed) return;
    console.error('DICOM 解析错误:', err);
    error.value = err instanceof Error && err.message ? err.message : t.value('dcm.parse_failed');
  } finally {
    if (!disposed) loading.value = false;
  }
};

watch(() => props.url, load, { immediate: true });

// 窗宽窗位或帧变化时重绘
watch([windowCenter, windowWidth, frame], () => draw());

onBeforeUnmount(() => {
  disposed = true;
  rgbaBuffer = null;
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

  <RendererError v-else-if="error || !image" :message="error || t('dcm.parse_failed')" />

  <div v-else class="vfp-w-full vfp-h-full vfp-flex vfp-flex-col" style="min-height: 0; background: #000">
    <div
      class="vfp-flex vfp-items-center vfp-gap-2 vfp-px-4 vfp-text-xs"
      style="flex: 0 0 auto; height: 2rem; color: rgb(255 255 255 / 0.75); border-bottom: 1px solid rgb(255 255 255 / 0.12)"
    >
      <span>{{ t('dcm.window_level', { center: Math.round(windowCenter), width: Math.round(windowWidth) }) }}</span>
      <span v-if="image.meta.modality">· {{ image.meta.modality }}</span>
      <span v-if="image.meta.patientName">· {{ image.meta.patientName }}</span>

      <span v-if="image.frames > 1" class="vfp-flex vfp-items-center vfp-gap-1" style="margin-left: auto">
        <button
          type="button"
          :disabled="frame <= 0"
          class="vfp-flex vfp-items-center vfp-justify-center"
          style="width: 1.25rem; height: 1.25rem; border: none; background: transparent; color: inherit; cursor: pointer"
          :aria-label="t('toolbar.prev_page')"
          @click="frame = Math.max(0, frame - 1)"
        >
          <ChevronLeft :size="13" />
        </button>
        <span>{{ t('dcm.frame', { current: frame + 1, total: image.frames }) }}</span>
        <button
          type="button"
          :disabled="frame >= image.frames - 1"
          class="vfp-flex vfp-items-center vfp-justify-center"
          style="width: 1.25rem; height: 1.25rem; border: none; background: transparent; color: inherit; cursor: pointer"
          :aria-label="t('toolbar.next_page')"
          @click="frame = Math.min(image.frames - 1, frame + 1)"
        >
          <ChevronRight :size="13" />
        </button>
      </span>
    </div>

    <div class="vfp-flex-1 vfp-min-h-0 vfp-flex vfp-items-center vfp-justify-center" style="overflow: hidden">
      <canvas
        ref="canvasRef"
        :title="t('dcm.window_level_hint')"
        style="max-width: 100%; max-height: 100%; cursor: crosshair; image-rendering: pixelated"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />
    </div>

    <div
      class="vfp-text-xs vfp-px-4"
      style="flex: 0 0 auto; height: 1.5rem; line-height: 1.5rem; color: rgb(255 255 255 / 0.5)"
    >
      {{ t('dcm.window_level_hint') }}
    </div>
  </div>
</template>
