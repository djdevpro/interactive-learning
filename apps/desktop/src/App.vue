<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { createGuide } from '@interactive-learning/protocol';
import EditorView from './components/EditorView.vue';
import Icon from './components/Icon.vue';
import LibraryView from './components/LibraryView.vue';
import { library } from './library';
import { dismiss, toast } from './ui';

// The site open in the library is remembered on this computer between two launches.
const SITE_KEY = 'interactive-learning-desktop:site';

const opened = ref<{ path: string; startIn: 'record' | 'edit' } | null>(null);
const siteId = ref<string | null>(readSite());
const editor = ref<InstanceType<typeof EditorView> | null>(null);
const unlisten: UnlistenFn[] = [];

function readSite(): string | null {
  try {
    return localStorage.getItem(SITE_KEY);
  } catch {
    return null;
  }
}

function selectSite(id: string): void {
  siteId.value = id;
  try {
    localStorage.setItem(SITE_KEY, id);
  } catch {
    // The choice is only a convenience; the library works without it.
  }
}

function open(path: string, startIn: 'record' | 'edit'): void {
  selectSite(path.split('/')[0] ?? '');
  opened.value = { path, startIn };
}

// Steps of the self-test the Rust side runs with IL_DESKTOP_SELFTEST.
async function selftest(): Promise<void> {
  const ready = () => nextTick().then(() => new Promise((resolve) => setTimeout(resolve, 300)));
  unlisten.push(
    await listen<{ address: string; publishTo: string }>(
      'selftest-library',
      async ({ payload }) => {
        const site = await library.saveSite({ name: 'Demo workspace', ...payload });
        const theme = await library.saveTheme(site, { name: 'Billing', color: 'orange' });
        await library.saveTheme(site, { name: 'Onboarding', color: 'teal' });
        const path = await library.createTutorial(
          site,
          theme,
          createGuide('Change the payment method'),
        );
        open(path, 'record');
      },
    ),
    await listen('selftest-record', () => void editor.value?.toggleRecording()),
    await listen('selftest-stop', () => void editor.value?.toggleRecording()),
    await listen<number>('selftest-select', async ({ payload }) => {
      const step = editor.value?.guide?.steps[payload];
      if (!editor.value || !step) return;
      editor.value.stage = 'canvas';
      await ready();
      editor.value.select(step.id);
    }),
    await listen<number>('selftest-seek', ({ payload }) => void editor.value?.previewAt(payload)),
    await listen('selftest-pause', () => editor.value?.pause()),
    await listen('selftest-publish', () => void editor.value?.publish()),
    await listen<string>('selftest-export', ({ payload }) => void editor.value?.exportTo(payload)),
    await listen('selftest-library-view', () => void editor.value?.close()),
  );
  await emit('selftest-ready');
}

onMounted(() => {
  if (import.meta.env.DEV) void selftest();
});
onUnmounted(() => {
  for (const stop of unlisten) stop();
});
</script>

<template>
  <LibraryView v-if="!opened" :selected-site="siteId" @open="open" @select-site="selectSite" />
  <EditorView
    v-else
    ref="editor"
    :key="opened.path"
    :path="opened.path"
    :start-in="opened.startIn"
    @close="opened = null"
  />

  <div
    v-if="toast"
    :key="toast.id"
    class="toast"
    :class="{ error: toast.tone === 'error' }"
    role="status"
  >
    <Icon :name="toast.tone === 'error' ? 'alert' : 'check'" :size="16" />
    <span class="toast-text">{{ toast.message }}</span>
    <button
      v-if="toast.action"
      type="button"
      class="button small"
      @click="
        toast.action.run();
        dismiss();
      "
    >
      {{ toast.action.label }}
    </button>
    <button type="button" class="button icon small quiet" aria-label="Dismiss" @click="dismiss">
      <Icon name="close" :size="14" />
    </button>
  </div>
</template>
