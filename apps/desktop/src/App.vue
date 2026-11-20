<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { createGuide } from '@interactive-learning/protocol';
import EditorView from './components/EditorView.vue';
import ContextMenu from './components/ContextMenu.vue';
import Icon from './components/Icon.vue';
import LibraryView from './components/LibraryView.vue';
import SettingsView from './components/SettingsView.vue';
import { startBridge } from './agent/bridge';
import type { AgentHost, EditorAgent } from './agent/types';
import { t } from './i18n';
import { library } from './library';
import { closeMenu, keepsNativeMenu } from './menus';
import { checkForUpdates, loadSettings, update, type SettingsTab } from './settings';
import { dismiss, notify, toast } from './ui';

// The site open in the library is remembered on this computer between two launches.
const SITE_KEY = 'interactive-learning-desktop:site';
/** The studio looks for a new version a moment after it starts, once the library shows. */
const UPDATE_CHECK_DELAY_MS = 4000;

const opened = ref<{ path: string; startIn: 'record' | 'edit' } | null>(null);
const screen = ref<'library' | 'settings'>('library');
const settingsTab = ref<SettingsTab>('general');
const siteId = ref<string | null>(readSite());
const editor = ref<InstanceType<typeof EditorView> | null>(null);
const libraryView = ref<InstanceType<typeof LibraryView> | null>(null);
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
  screen.value = 'library';
  opened.value = { path, startIn };
}

/** Settings, from the library or the editor, which saves and closes first. */
async function openSettings(tab?: SettingsTab): Promise<void> {
  if (tab) settingsTab.value = tab;
  if (editor.value) await editor.value.close();
  opened.value = null;
  screen.value = 'settings';
}

// A menu belongs to the screen it was opened on.
watch([opened, screen], () => closeMenu());

// Tutorials an agent waits to see open in the editor.
const waiting = new Map<
  string,
  { resolve: (editor: EditorAgent) => void; reject: (cause: Error) => void }
>();

function onReady(): void {
  const path = opened.value?.path;
  const agent = editor.value?.agent;
  if (!path || !agent) return;
  waiting.get(path)?.resolve(agent);
  waiting.delete(path);
}

function onClose(): void {
  const path = opened.value?.path;
  opened.value = null;
  if (!path) return;
  waiting.get(path)?.reject(new Error('This tutorial could not be opened.'));
  waiting.delete(path);
}

/** What agents may do with the window: the same moves as the creator. */
const host: AgentHost = {
  editor() {
    const agent = editor.value?.agent;
    return opened.value && agent?.path === opened.value.path ? agent : null;
  },
  async open(path, mode) {
    const current = host.editor();
    // Already open: an agent or a script may have rewritten it since, so the editor reads it again.
    if (current?.path === path) {
      await editor.value?.reload();
      return current;
    }
    if (editor.value) await editor.value.close();
    return new Promise<EditorAgent>((resolve, reject) => {
      const entry = { resolve, reject };
      waiting.set(path, entry);
      open(path, mode);
      setTimeout(() => {
        if (waiting.get(path) !== entry) return;
        waiting.delete(path);
        reject(new Error('The editor did not open in time. Call the tool again.'));
      }, 30_000);
    });
  },
  async closeEditor() {
    if (editor.value) await editor.value.close();
  },
  libraryChanged() {
    void libraryView.value?.refresh();
  },
  view: () => (opened.value ? 'editor' : screen.value),
};

async function lookForUpdates(): Promise<void> {
  await checkForUpdates();
  if (update.phase !== 'available') return;
  notify(t('updates.toast', { version: update.check?.latest?.version ?? '' }), {
    label: t('updates.see'),
    run: () => void openSettings('updates'),
  });
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
    await listen<SettingsTab>('selftest-settings', ({ payload }) => void openSettings(payload)),
    await listen('selftest-menu', () => {
      // A right click on the first tutorial of the library.
      const card = document.querySelector<HTMLElement>('.work:not(.add)');
      const box = card?.getBoundingClientRect();
      card?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: (box?.left ?? 0) + 80,
          clientY: (box?.top ?? 0) + 70,
        }),
      );
    }),
  );
  await emit('selftest-ready');
}

/**
 * The menu of the webview, with Back, Reload and Inspect, has no place in a desktop app: a right
 * click shows the menu of what is under the pointer, and fields keep their Cut, Copy and Paste.
 */
function quietNativeMenu(event: MouseEvent): void {
  if (!keepsNativeMenu(event.target)) event.preventDefault();
}

onMounted(async () => {
  window.addEventListener('contextmenu', quietNativeMenu);
  unlisten.push(() => window.removeEventListener('contextmenu', quietNativeMenu));
  unlisten.push(await startBridge(host));
  const preferences = await loadSettings().catch(() => null);
  if (preferences?.checkUpdates !== false) {
    setTimeout(() => void lookForUpdates(), UPDATE_CHECK_DELAY_MS);
  }
  if (import.meta.env.DEV) void selftest();
});
onUnmounted(() => {
  for (const stop of unlisten) stop();
});
</script>

<template>
  <SettingsView
    v-if="!opened && screen === 'settings'"
    :tab="settingsTab"
    @tab="settingsTab = $event"
    @close="screen = 'library'"
    @open="(path) => open(path, 'edit')"
  />
  <LibraryView
    v-else-if="!opened"
    ref="libraryView"
    :selected-site="siteId"
    @open="open"
    @select-site="selectSite"
    @settings="openSettings()"
  />
  <EditorView
    v-else
    ref="editor"
    :key="opened.path"
    :path="opened.path"
    :start-in="opened.startIn"
    @close="onClose"
    @ready="onReady"
    @settings="openSettings()"
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
    <button
      type="button"
      class="button icon small quiet"
      :aria-label="t('common.dismiss')"
      @click="dismiss"
    >
      <Icon name="close" :size="14" />
    </button>
  </div>

  <ContextMenu />
</template>
