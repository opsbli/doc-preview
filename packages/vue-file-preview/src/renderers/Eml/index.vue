<script setup lang="ts">
import type { RendererHandle } from '../base.types';
import type { ToolbarGroup } from '../toolbar.types';
import type { ParsedEml } from '@opsbli/file-preview-core';

import { ref, watch, onBeforeUnmount } from 'vue';
import { User, Users, Paperclip, Calendar, Mail, Hash, Tag } from 'lucide-vue-next';
import { parseEml } from '@opsbli/file-preview-core';
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
const email = ref<ParsedEml | null>(null);
const bodyHtml = ref<string | null>(null);
const inlineUrls = ref<string[]>([]);

/** 归一化 Content-ID：去掉尖括号与 cid: 前缀，便于与正文引用匹配 */
const normalizeContentId = (contentId: string) =>
  contentId.replace(/^cid:/i, '').replace(/^</, '').replace(/>$/, '').trim();

const formatAddress = (name: string | undefined, address: string | undefined) => {
  if (name && address && name !== address) return `${name} <${address}>`;
  return name || address || '';
};

const formatAddressList = (list: { name?: string; address?: string }[]) =>
  list.map((item) => formatAddress(item.name, item.address)).filter(Boolean).join('; ');

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
};

const formatSize = (bytes: number) => {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

const releaseInlineUrls = () => {
  inlineUrls.value.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
  inlineUrls.value = [];
};

/** 内联图片（Content-ID 引用）→ blob URL，并在 HTML 中替换 cid: 引用 */
const buildBody = (parsed: ParsedEml) => {
  releaseInlineUrls();

  const idMap = new Map<string, string>();
  const urls: string[] = [];

  for (const attachment of parsed.attachments) {
    if (!attachment.inline || !attachment.contentId) continue;
    const blob = new Blob([attachment.content as unknown as BlobPart], { type: attachment.mimeType });
    const blobUrl = URL.createObjectURL(blob);
    urls.push(blobUrl);
    idMap.set(normalizeContentId(attachment.contentId), blobUrl);
  }

  inlineUrls.value = urls;

  let html = parsed.html ?? null;
  if (html && idMap.size > 0) {
    html = html.replace(/(["'(])\s*cid:([^"')]+)/gi, (match, prefix: string, rawId: string) => {
      const blobUrl = idMap.get(rawId.trim());
      return blobUrl ? `${prefix}${blobUrl}` : match;
    });
  }
  bodyHtml.value = html;
};

const load = async () => {
  loading.value = true;
  error.value = null;
  email.value = null;
  bodyHtml.value = null;
  releaseInlineUrls();

  try {
    const response = await fetcher.value(props.url);
    if (!response.ok) {
      throw new Error(`文件加载失败 (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    const parsed = await parseEml(buffer);
    email.value = parsed;
    buildBody(parsed);
  } catch (err) {
    console.error('EML 解析错误:', err);
    error.value = t.value('eml.parse_failed');
  } finally {
    loading.value = false;
  }
};

watch(() => props.url, load, { immediate: true });

onBeforeUnmount(() => releaseInlineUrls());

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

  <RendererError v-else-if="error || !email" :message="error || t('eml.parse_failed')" />

  <div v-else class="vfp-w-full vfp-h-full vfp-overflow-auto" style="background: white">
    <div style="width: 100%; background: white; min-height: 100%">
      <!-- 邮件头部 -->
      <div style="border-bottom: 1px solid #e5e7eb; padding: clamp(12px, 3vw, 24px) clamp(16px, 3vw, 28px); background: #f9fafb">
        <h2 style="margin: 0 0 16px 0; font-size: clamp(16px, 2.5vw, 20px); font-weight: 600; color: #111827; line-height: 1.4">
          {{ email.subject || t('eml.no_subject') }}
        </h2>

        <div style="display: flex; flex-direction: column; font-size: clamp(12px, 1.8vw, 14px); color: #4b5563">
          <div v-if="formatAddressList(email.from)" style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 0">
            <span style="flex-shrink: 0; display: flex; align-items: center; height: 1.4em">
              <User :size="16" style="color: #9ca3af" />
            </span>
            <div style="display: flex; flex: 1">
              <span style="flex-shrink: 0; color: #6b7280; font-weight: 500; margin-right: 8px; white-space: nowrap">From</span>
              <span style="color: #111827; word-break: break-word; flex: 1">{{ formatAddressList(email.from) }}</span>
            </div>
          </div>

          <div v-if="formatAddressList(email.to)" style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 0">
            <span style="flex-shrink: 0; display: flex; align-items: center; height: 1.4em">
              <Users :size="16" style="color: #9ca3af" />
            </span>
            <div style="display: flex; flex: 1">
              <span style="flex-shrink: 0; color: #6b7280; font-weight: 500; margin-right: 8px; white-space: nowrap">To</span>
              <span style="color: #111827; word-break: break-word; flex: 1">{{ formatAddressList(email.to) }}</span>
            </div>
          </div>

          <div v-if="formatAddressList(email.cc)" style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 0">
            <span style="flex-shrink: 0; display: flex; align-items: center; height: 1.4em">
              <Users :size="16" style="color: #9ca3af" />
            </span>
            <div style="display: flex; flex: 1">
              <span style="flex-shrink: 0; color: #6b7280; font-weight: 500; margin-right: 8px; white-space: nowrap">Cc</span>
              <span style="color: #111827; word-break: break-word; flex: 1">{{ formatAddressList(email.cc) }}</span>
            </div>
          </div>

          <div v-if="formatAddressList(email.bcc)" style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 0">
            <span style="flex-shrink: 0; display: flex; align-items: center; height: 1.4em">
              <Users :size="16" style="color: #9ca3af" />
            </span>
            <div style="display: flex; flex: 1">
              <span style="flex-shrink: 0; color: #6b7280; font-weight: 500; margin-right: 8px; white-space: nowrap">Bcc</span>
              <span style="color: #111827; word-break: break-word; flex: 1">{{ formatAddressList(email.bcc) }}</span>
            </div>
          </div>

          <div v-if="formatDate(email.date)" style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 0">
            <span style="flex-shrink: 0; display: flex; align-items: center; height: 1.4em">
              <Calendar :size="16" style="color: #9ca3af" />
            </span>
            <div style="display: flex; flex: 1">
              <span style="flex-shrink: 0; color: #6b7280; font-weight: 500; margin-right: 8px; white-space: nowrap">Date</span>
              <span style="color: #111827; word-break: break-word; flex: 1">{{ formatDate(email.date) }}</span>
            </div>
          </div>

          <div
            v-if="email.attachments.filter((attachment) => !attachment.inline).length > 0"
            style="display: flex; align-items: flex-start; gap: 8px; padding: 10px 0 6px; border-top: 1px solid #e5e7eb; margin-top: 4px"
          >
            <span style="flex-shrink: 0; display: flex; align-items: center; height: 1.4em">
              <Paperclip :size="16" style="color: #9ca3af" />
            </span>
            <div style="display: flex; flex: 1">
              <span style="flex-shrink: 0; color: #6b7280; font-weight: 500; margin-right: 8px; white-space: nowrap">Attachments</span>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; flex: 1">
                <span
                  v-for="(attachment, index) in email.attachments.filter((item) => !item.inline)"
                  :key="`${attachment.filename}-${index}`"
                  :title="attachment.mimeType"
                  style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #f3f4f6; border-radius: 4px; font-size: 13px; color: #374151; border: 1px solid #e5e7eb"
                >
                  <Tag :size="12" style="color: #9ca3af" />
                  {{ attachment.filename }}
                  <span style="color: #9ca3af; font-size: 12px">({{ formatSize(attachment.size) }})</span>
                </span>
              </div>
            </div>
          </div>

          <div v-if="email.messageId" style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; margin-top: 4px">
            <span style="flex-shrink: 0; display: flex; align-items: center; height: 1.4em">
              <Hash :size="16" style="color: #9ca3af" />
            </span>
            <div style="display: flex; flex: 1">
              <span style="flex-shrink: 0; color: #6b7280; font-weight: 500; margin-right: 8px; white-space: nowrap">Message-ID</span>
              <span style="color: #9ca3af; word-break: break-word; flex: 1; font-size: 12px; font-family: monospace">{{ email.messageId }}</span>
            </div>
          </div>

          <div
            v-if="email.attachments.some((attachment) => attachment.inline)"
            style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 0"
          >
            <span style="flex-shrink: 0; display: flex; align-items: center; height: 1.4em">
              <Mail :size="16" style="color: #9ca3af" />
            </span>
            <div style="display: flex; flex: 1">
              <span style="flex-shrink: 0; color: #6b7280; font-weight: 500; margin-right: 8px; white-space: nowrap">Inline</span>
              <span style="color: #9ca3af; word-break: break-word; flex: 1; font-size: 12px">
                {{ email.attachments.filter((attachment) => attachment.inline).length }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 邮件正文 -->
      <div
        v-if="bodyHtml"
        style="padding: clamp(12px, 3vw, 24px) clamp(16px, 3vw, 28px); font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; overflow-x: auto"
        v-html="bodyHtml"
      />
      <div
        v-else
        :style="{
          padding: 'clamp(12px, 3vw, 24px) clamp(16px, 3vw, 28px)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          lineHeight: 1.6,
          color: email.text ? '#333' : '#9ca3af',
          whiteSpace: email.text ? 'pre-wrap' : 'normal',
          wordBreak: 'break-word',
        }"
      >
        {{ email.text || t('eml.empty_body') }}
      </div>
    </div>
  </div>
</template>
