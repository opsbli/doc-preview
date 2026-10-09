<script setup lang="ts">
import { ref, nextTick, computed } from 'vue';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-vue-next';
import { useTranslator } from '../composables/useTranslator';

interface Props {
  onClose: () => void;
  onSearch: (query: string, options: { caseSensitive: boolean }) => void;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  matchCount: number;
  totalCount: number;
}

const props = defineProps<Props>();

const { t } = useTranslator();

const query = ref('');
const caseSensitive = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

nextTick(() => {
  if (inputRef.value) {
    inputRef.value.focus();
  }
});

function handleChange(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  query.value = val;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    props.onSearch(val, { caseSensitive: caseSensitive.value });
  }, 300);
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    props.onSearch(query.value, { caseSensitive: caseSensitive.value });
  } else if (e.key === 'Escape') {
    props.onClose();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    props.onPrevMatch();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    props.onNextMatch();
  }
}

function toggleCaseSensitive() {
  caseSensitive.value = !caseSensitive.value;
  if (query.value) {
    props.onSearch(query.value, { caseSensitive: caseSensitive.value });
  }
}

const displayCount = computed(() =>
  props.totalCount > 0 ? `${props.matchCount + 1} / ${props.totalCount}` : t.value('search.no_results')
);

defineExpose({
  query,
  caseSensitive,
});
</script>

<template>
  <div class="vfp-flex vfp-items-center vfp-gap-2 vfp-px-3 md:vfp-px-5 vfp-py-1.5 vfp-border-b vfp-border-line-weak vfp-bg-surface-toolbar">
    <div class="vfp-flex vfp-items-center vfp-gap-1 vfp-flex-1 vfp-min-w-0 vfp-max-w-sm vfp-px-2 vfp-py-1 vfp-rounded-md vfp-border vfp-border-line vfp-bg-surface-input focus-within:vfp-border-fg-primary">
      <Search class="vfp-w-3.5 vfp-h-3.5 vfp-text-fg-muted vfp-shrink-0" />
      <input
        ref="inputRef"
        type="text"
        :value="query"
        @input="handleChange"
        @keydown="handleKeyDown"
        :placeholder="t('search.placeholder')"
        class="vfp-flex-1 vfp-min-w-0 vfp-text-xs vfp-bg-transparent vfp-text-fg-primary vfp-outline-none vfp-placeholder:text-fg-muted"
      />
    </div>

    <span class="vfp-text-xs vfp-text-fg-muted vfp-tabular-nums vfp-shrink-0">
      {{ displayCount }}
    </span>

    <button
      @click="props.onPrevMatch"
      :disabled="props.totalCount === 0"
      :title="t('search.prev_match')"
      class="vfp-p-1 vfp-text-fg-muted hover:vfp-text-fg-primary vfp-transition-colors vfp-disabled:text-fg-disabled vfp-disabled:cursor-not-allowed"
    >
      <ChevronUp class="vfp-w-4 vfp-h-4" />
    </button>
    <button
      @click="props.onNextMatch"
      :disabled="props.totalCount === 0"
      :title="t('search.next_match')"
      class="vfp-p-1 vfp-text-fg-muted hover:vfp-text-fg-primary vfp-transition-colors vfp-disabled:text-fg-disabled vfp-disabled:cursor-not-allowed"
    >
      <ChevronDown class="vfp-w-4 vfp-h-4" />
    </button>

    <button
      @click="toggleCaseSensitive"
      :title="t('search.case_sensitive')"
      :class="caseSensitive ? 'vfp-text-fg-primary' : 'vfp-text-fg-muted hover:vfp-text-fg-primary'"
      class="vfp-p-1 vfp-transition-colors"
    >
      <Search class="vfp-w-4 vfp-h-4" />
    </button>

    <button
      @click="props.onClose"
      :title="t('search.close')"
      class="vfp-p-1 vfp-text-fg-muted hover:vfp-text-fg-primary vfp-transition-colors"
    >
      <X class="vfp-w-4 vfp-h-4" />
    </button>
  </div>
</template>
