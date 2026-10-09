<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { Lock, X } from 'lucide-vue-next';
import { useTranslator } from '../composables/useTranslator';

interface Props {
  maxRetries?: number;
  retriesLeft: number;
  errorMessage: string;
  autoFocus?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  maxRetries: 3,
  autoFocus: true,
});

const emit = defineEmits<{
  (e: 'submit', password: string): void;
  (e: 'close'): void;
}>();

const { t } = useTranslator();

const password = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.errorMessage,
  () => {
    password.value = '';
  }
);

watch(
  () => props.retriesLeft,
  () => {
    password.value = '';
  }
);

nextTick(() => {
  if (props.autoFocus && inputRef.value) {
    inputRef.value.focus();
  }
});

function handleSubmit() {
  if (!password.value.trim()) return;
  emit('submit', password.value);
  password.value = '';
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    handleSubmit();
  } else if (e.key === 'Escape') {
    emit('close');
  }
}

const isMaxReached = computed(() => props.retriesLeft <= 0);
</script>

<template>
  <div
    class="vfp-absolute vfp-inset-0 vfp-flex vfp-items-center vfp-justify-center vfp-z-[20] vfp-bg-black/40 vfp-backdrop-blur-sm"
    @click="emit('close')"
  >
    <div
      class="vfp-relative vfp-w-80 vfp-max-w-[90%] vfp-bg-surface-panel vfp-rounded-lg vfp-shadow-2xl vfp-border vfp-border-line vfp-p-5 vfp-flex vfp-flex-col vfp-gap-4"
      @click.stop
    >
      <button
        class="vfp-absolute vfp-top-3 vfp-right-3 vfp-p-1 vfp-text-fg-muted hover:vfp-text-fg-primary vfp-transition-colors"
        @click="emit('close')"
        :title="t('common.close')"
      >
        <X class="vfp-w-4 vfp-h-4" />
      </button>

      <div class="vfp-flex vfp-items-center vfp-gap-3">
        <div class="vfp-p-2 vfp-rounded-lg vfp-bg-surface-2">
          <Lock class="vfp-w-5 vfp-h-5 vfp-text-fg-primary" />
        </div>
        <h3 class="vfp-font-medium vfp-text-sm vfp-text-fg-primary">
          {{ t('encrypted.title') }}
        </h3>
      </div>

      <div class="vfp-flex vfp-flex-col vfp-gap-2">
        <input
          ref="inputRef"
          type="password"
          v-model="password"
          @keydown="handleKeyDown"
          :placeholder="t('encrypted.password_placeholder')"
          :disabled="isMaxReached"
          class="vfp-w-full vfp-px-3 vfp-py-2 vfp-text-sm vfp-rounded-md vfp-border vfp-border-line vfp-bg-surface-input vfp-text-fg-primary vfp-outline-none focus:vfp-border-fg-primary focus:vfp-ring-1 focus:vfp-ring-fg-primary/30 vfp-placeholder:text-fg-muted disabled:vfp-opacity-50 disabled:vfp-cursor-not-allowed"
        />

        <p v-if="errorMessage" class="vfp-text-xs vfp-text-red-500">
          {{ errorMessage }}
        </p>

        <p v-else-if="!isMaxReached" class="vfp-text-xs vfp-text-fg-muted">
          {{ t('encrypted.retries_left', { count: retriesLeft }) }}
        </p>
      </div>

      <button
        @click="handleSubmit"
        :disabled="isMaxReached || !password.trim()"
        class="vfp-w-full vfp-py-2 vfp-text-sm vfp-font-medium vfp-rounded-md vfp-bg-fg-primary vfp-text-fg-inverse vfp-transition-colors hover:vfp-opacity-90 disabled:vfp-opacity-40 disabled:vfp-cursor-not-allowed"
      >
        {{ isMaxReached ? t('encrypted.max_attempts') : t('encrypted.confirm') }}
      </button>
    </div>
  </div>
</template>
