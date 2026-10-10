<script setup lang="ts">
import type { MindmapNode } from '@opsbli/file-preview-core';
import { ChevronRight, ChevronDown, Tag, StickyNote } from 'lucide-vue-next';
import { useTranslator } from '../../composables/useTranslator';

const props = defineProps<{
  node: MindmapNode;
  nodeId: string;
  depth: number;
  collapsedIds: string[];
}>();

const emit = defineEmits<{ toggle: [id: string] }>();

const { t } = useTranslator();

const isCollapsed = (id: string) => props.collapsedIds.includes(id);
</script>

<template>
  <li style="list-style: none">
    <div
      class="vfp-flex vfp-items-start vfp-gap-1"
      :style="{
        paddingLeft: depth === 0 ? '0' : '1.1rem',
        borderLeft: depth === 0 ? 'none' : '1px solid var(--fp-line-weak)',
      }"
    >
      <button
        v-if="node.children.length > 0"
        type="button"
        class="vfp-flex vfp-items-center vfp-justify-center"
        style="width: 1.25rem; height: 1.25rem; margin-top: 0.15rem; flex: 0 0 auto; color: var(--fp-fg-tertiary); background: transparent; border: none; cursor: pointer"
        :aria-expanded="!isCollapsed(nodeId)"
        :aria-label="node.title || t('mindmap.untitled')"
        @click="emit('toggle', nodeId)"
      >
        <ChevronRight v-if="isCollapsed(nodeId)" :size="14" />
        <ChevronDown v-else :size="14" />
      </button>
      <span v-else style="width: 1.25rem; flex: 0 0 auto" />

      <div style="min-width: 0; flex: 1 1 auto; padding-bottom: 0.35rem">
        <div
          :style="{
            color: depth === 0 ? 'var(--fp-fg-primary)' : 'var(--fp-fg-secondary)',
            fontWeight: depth === 0 ? 600 : depth === 1 ? 500 : 400,
            fontSize: depth === 0 ? '0.95rem' : '0.875rem',
            lineHeight: 1.5,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }"
        >
          {{ node.title || t('mindmap.untitled') }}
          <span
            v-if="node.children.length > 0"
            style="margin-left: 0.4rem; color: var(--fp-fg-muted); font-size: 0.75rem"
            >{{ node.children.length }}</span
          >
        </div>

        <div
          v-if="node.labels && node.labels.length > 0"
          class="vfp-flex vfp-flex-wrap vfp-items-center"
          style="gap: 0.25rem; margin-top: 0.2rem"
        >
          <span
            v-for="label in node.labels"
            :key="label"
            class="vfp-flex vfp-items-center"
            style="gap: 0.2rem; padding: 0.05rem 0.35rem; border-radius: 0.25rem; font-size: 0.7rem; color: var(--fp-fg-tertiary); background: var(--fp-surface-2)"
          >
            <Tag :size="10" />
            {{ label }}
          </span>
        </div>

        <div
          v-if="node.notes"
          class="vfp-flex vfp-items-start"
          style="gap: 0.3rem; margin-top: 0.25rem; padding: 0.3rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; color: var(--fp-fg-tertiary); background: var(--fp-surface-1); white-space: pre-wrap; word-break: break-word"
        >
          <StickyNote :size="12" style="flex: 0 0 auto; margin-top: 0.15rem" />
          <span>{{ node.notes }}</span>
        </div>
      </div>
    </div>

    <ul v-if="node.children.length > 0 && !isCollapsed(nodeId)" style="margin: 0; padding: 0">
      <TreeNode
        v-for="(child, index) in node.children"
        :key="`${nodeId}-${index}`"
        :node="child"
        :node-id="`${nodeId}-${index}`"
        :depth="depth + 1"
        :collapsed-ids="collapsedIds"
        @toggle="emit('toggle', $event)"
      />
    </ul>
  </li>
</template>
