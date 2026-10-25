<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { browser, type Browser } from 'wxt/browser';
import { createZip, validateGuide, type GuideDocument } from '@interactive-learning/protocol';
import { GuideStore } from '../../lib/guide-store';
import { guideArchive, guideFromFile } from '../../lib/guide-archive';
import {
  Icon,
  StepEditor,
  StepList,
  markerNumber,
  type StepDraft,
} from '@interactive-learning/editor';
import {
  CHANNEL,
  SESSION_KEY,
  idleState,
  type Command,
  type RecorderState,
  type Reply,
} from '../../lib/messages';

type Request = Command extends infer Entry
  ? Entry extends { channel: string }
    ? Omit<Entry, 'channel'>
    : never
  : never;

// The background opens one panel per tab and names it in the address.
const panelTabId = Number(new URLSearchParams(location.search).get('tab')) || undefined;
const tab = shallowRef<Browser.tabs.Tab>();
const state = ref<RecorderState>(idleState());
const store = new GuideStore();
const guide = shallowRef<GuideDocument>();
const name = ref('');
const busy = ref(false);
const error = ref('');
const flash = ref('');
const confirmDiscard = ref(false);
const editingId = ref<string | null>(null);
const stepList = ref<{ $el: HTMLElement } | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
let flashTimer: ReturnType<typeof setTimeout> | undefined;
let preview: { guideId: string; windowId: number } | undefined;

/** Without access, Chrome hides the address of the tab from the extension. */
const page = computed(() => {
  const url = tab.value?.url;
  if (!tab.value) return { kind: 'loading', host: '' } as const;
  if (!url) return { kind: 'locked', host: '' } as const;
  if (url.startsWith('file:')) return { kind: 'file', host: 'Local file' } as const;
  if (!/^https?:\/\//.test(url)) return { kind: 'protected', host: new URL(url).protocol } as const;
  return { kind: 'ready', host: new URL(url).host } as const;
});
const sessionHost = computed(() => (state.value.origin ? new URL(state.value.origin).host : ''));
const onThisTab = computed(() => tab.value?.id !== undefined && state.value.tabId === tab.value.id);
const view = computed(() => {
  const { status } = state.value;
  if (status === 'recording' || status === 'paused') {
    if (!onThisTab.value) return 'elsewhere';
    return editedStep.value ? 'editor' : 'recording';
  }
  if (status === 'stopped' && state.value.guideId) return editedStep.value ? 'editor' : 'review';
  return 'home';
});
const editedIndex = computed(
  () => guide.value?.steps.findIndex((step) => step.id === editingId.value) ?? -1,
);
const editedStep = computed(() => guide.value?.steps[editedIndex.value]);
const size = computed(() => `${(state.value.imageBytes / 1024 / 1024).toFixed(1)} MB`);
const summary = computed(() =>
  [
    view.value === 'review' ? 'Ready to export' : '',
    state.value.stepCount === 1 ? '1 step' : `${state.value.stepCount} steps`,
    size.value,
    onThisTab.value ? '' : sessionHost.value,
  ]
    .filter(Boolean)
    .join(' · '),
);
const notice = computed(() => state.value.diagnostics[0]?.message);
/** Chrome hides the tab from the extension: only a click on the toolbar icon gives it back. */
const accessLost = computed(
  () =>
    onThisTab.value &&
    state.value.status === 'paused' &&
    state.value.pausedFor !== 'user' &&
    (page.value.kind === 'locked' || state.value.pausedFor === 'access'),
);

function imageOf(assetId: string): string {
  return guide.value?.assets.find((asset) => asset.id === assetId)?.src ?? '';
}

async function loadTab(): Promise<void> {
  tab.value =
    panelTabId !== undefined
      ? await browser.tabs.get(panelTabId).catch(() => undefined)
      : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
}

async function loadGuide(): Promise<void> {
  guide.value = state.value.guideId ? await store.read(state.value.guideId) : undefined;
  if (!editedStep.value) editingId.value = null;
}

function showFlash(message: string): void {
  flash.value = message;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = ''), 2200);
}

async function run(request: Request): Promise<boolean> {
  busy.value = true;
  error.value = '';
  try {
    const reply: Reply = await browser.runtime.sendMessage({ channel: CHANNEL, ...request });
    if (!reply.ok) throw new Error(reply.error);
    state.value = reply.state;
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The recorder cannot be reached.';
    return false;
  } finally {
    busy.value = false;
  }
}

async function start(): Promise<void> {
  if (tab.value?.id === undefined) return;
  const title = name.value.trim() || tab.value.title?.trim() || 'Untitled guide';
  if (await run({ type: 'start', tabId: tab.value.id, title })) name.value = '';
}

async function discard(): Promise<void> {
  if (await run({ type: 'discard' })) confirmDiscard.value = false;
}

async function showRecordedTab(): Promise<void> {
  if (state.value.tabId === undefined) return;
  await browser.tabs.update(state.value.tabId, { active: true }).catch(() => {});
  if (state.value.windowId !== undefined)
    await browser.windows.update(state.value.windowId, { focused: true }).catch(() => {});
}

async function saveStep(draft: StepDraft): Promise<boolean> {
  const stepId = editingId.value;
  if (!stepId) return false;
  const saved = await run({ type: 'edit-step', stepId, ...draft });
  if (saved) await loadGuide();
  return saved;
}

async function save(draft: StepDraft): Promise<void> {
  if (!(await saveStep(draft))) return;
  editingId.value = null;
  showFlash('Step saved');
}

async function go(offset: number, draft: StepDraft | null): Promise<void> {
  if (draft && !(await saveStep(draft))) return;
  const next = guide.value?.steps[editedIndex.value + offset];
  if (next) editingId.value = next.id;
}

async function removeStep(): Promise<void> {
  const stepId = editingId.value;
  if (!stepId || !(await run({ type: 'delete-step', stepId }))) return;
  editingId.value = null;
  await loadGuide();
  showFlash('Step deleted');
}

async function retake(): Promise<void> {
  const stepId = editingId.value;
  if (stepId && (await run({ type: 'retake', stepId }))) await loadGuide();
}

/** Opens a ZIP or a self-contained guide.json for editing. It replaces nothing until it is valid. */
async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  let document: GuideDocument;
  try {
    document = await guideFromFile(file);
    await store.write(document);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'This file could not be imported.';
    return;
  }
  if (await run({ type: 'import', guideId: document.id })) showFlash('Guide imported');
}

/**
 * Plays the guide in a window beside the recorded tab, which keeps its panel open for edits.
 * A second click brings the same window back instead of opening another one.
 */
async function openPreview(): Promise<void> {
  const guideId = state.value.guideId;
  if (!guideId) return;
  if (preview?.guideId === guideId) {
    const focused = await browser.windows
      .update(preview.windowId, { focused: true })
      .then(() => true)
      .catch(() => false);
    if (focused) return;
  }
  const url = `${browser.runtime.getURL('/preview.html')}?guide=${encodeURIComponent(guideId)}`;
  const opened = await browser.windows.create({ url, type: 'popup', width: 1100, height: 760 });
  preview = opened?.id === undefined ? undefined : { guideId, windowId: opened.id };
}

/** Downloads `guide.json` and its screenshots as separate files in one ZIP archive. */
async function exportGuide(): Promise<void> {
  if (!state.value.guideId) return;
  busy.value = true;
  error.value = '';
  try {
    const document = validateGuide(await store.read(state.value.guideId));
    const archive = createZip(guideArchive(document));
    const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${
      document.title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'guide'
    }.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    showFlash('ZIP downloaded');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The export failed.';
  } finally {
    busy.value = false;
  }
}

watch(
  () => [state.value.guideId, state.value.stepCount],
  async ([, count], previous) => {
    await loadGuide();
    // Keeps the newest step in sight while recording.
    if (view.value === 'recording' && previous && Number(count) > Number(previous[1])) {
      await nextTick();
      stepList.value?.$el.lastElementChild?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  },
);
watch(view, () => {
  confirmDiscard.value = false;
  error.value = '';
});

const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
  if (area === 'local' && changes[SESSION_KEY]?.newValue)
    state.value = changes[SESSION_KEY].newValue as RecorderState;
};
const onTabUpdated = (tabId: number, _change: unknown, updated: Browser.tabs.Tab) => {
  if (tabId === tab.value?.id) tab.value = updated;
};
const onTabActivated = () => {
  if (panelTabId === undefined) void loadTab();
};
// A click on the toolbar icon grants access again after the tab left its site.
const onMessage = (message: unknown) => {
  const entry = message as { channel?: string; type?: string; tabId?: number } | undefined;
  if (entry?.channel === CHANNEL && entry.type === 'tab-access' && entry.tabId === tab.value?.id)
    void loadTab();
};

onMounted(() => {
  browser.storage.onChanged.addListener(onStorage);
  browser.tabs.onUpdated.addListener(onTabUpdated);
  browser.tabs.onActivated.addListener(onTabActivated);
  browser.runtime.onMessage.addListener(onMessage);
  void loadTab();
  void run({ type: 'state' }).then(loadGuide);
});
onUnmounted(() => {
  browser.storage.onChanged.removeListener(onStorage);
  browser.tabs.onUpdated.removeListener(onTabUpdated);
  browser.tabs.onActivated.removeListener(onTabActivated);
  browser.runtime.onMessage.removeListener(onMessage);
});
</script>

<template>
  <div class="shell">
    <header class="tab-chip" :data-status="onThisTab ? state.status : 'idle'">
      <Icon name="lock" />
      <span class="tab-host" :title="tab?.url">{{ page.host || 'This tab' }}</span>
      <span v-if="onThisTab && state.status === 'recording'" class="tab-state recording">
        <span class="dot" aria-hidden="true"></span>Recording
      </span>
      <span v-else-if="accessLost" class="tab-state paused">Access needed</span>
      <span v-else-if="onThisTab && state.status === 'paused'" class="tab-state paused">
        Paused
      </span>
      <span v-else class="tab-state">This tab only</span>
    </header>

    <StepEditor
      v-if="view === 'editor' && guide && editedStep"
      :step="editedStep"
      :image="imageOf(editedStep.assetId)"
      :number="editedIndex + 1"
      :total="guide.steps.length"
      :marker-number="markerNumber(guide.steps, editedIndex)"
      :replace="onThisTab ? 'retake' : undefined"
      :busy="busy"
      @save="save"
      @cancel="editingId = null"
      @go="go"
      @remove="removeStep"
      @retake="retake"
    />

    <template v-else-if="view === 'home'">
      <main class="content">
        <template v-if="page.kind === 'ready' || page.kind === 'loading'">
          <h1>Record a guide</h1>
          <p class="lead">
            Walk through your flow on this tab. Each click and each new page becomes a step with its
            screenshot.
          </p>
          <div class="field">
            <label for="guide-name">Guide name</label>
            <input
              id="guide-name"
              v-model="name"
              maxlength="200"
              autocomplete="off"
              :placeholder="tab?.title || 'Create a project'"
              @keydown.enter="start"
            />
          </div>
          <ol class="how">
            <li><span>Click through your flow as usual.</span></li>
            <li>
              <span>Before you submit a form, press <strong>Capture step</strong> to keep it.</span>
            </li>
            <li><span>Finish, place markers on each step, then export a ZIP.</span></li>
          </ol>
        </template>
        <div v-else class="empty">
          <span class="empty-icon"><Icon :name="page.kind === 'locked' ? 'lock' : 'alert'" /></span>
          <template v-if="page.kind === 'locked'">
            <h1>Allow this page</h1>
            <p>
              The extension lost access when this tab changed site. Click the Interactive Learning
              icon in the toolbar to record here.
            </p>
          </template>
          <template v-else-if="page.kind === 'file'">
            <h1>Local files can't be recorded</h1>
            <p>Serve the page with a local server, then open its http://localhost address.</p>
          </template>
          <template v-else>
            <h1>This page can't be recorded</h1>
            <p>Chrome pages and the Chrome Web Store are protected. Open a website to record it.</p>
          </template>
        </div>
        <p class="hint">
          Already have a guide? Import its ZIP, made by the extension or by an AI agent, to edit it
          here.
        </p>
      </main>
      <footer class="actions">
        <button
          v-if="page.kind === 'ready'"
          class="primary grow"
          type="button"
          :disabled="busy"
          @click="start"
        >
          <span class="rec" aria-hidden="true"></span>Start recording
        </button>
        <button
          class="secondary"
          :class="{ grow: page.kind !== 'ready' }"
          type="button"
          :disabled="busy"
          @click="importInput?.click()"
        >
          <Icon name="upload" />Import
        </button>
        <input
          ref="importInput"
          class="visually-hidden"
          type="file"
          accept=".zip,.json,application/zip,application/json"
          tabindex="-1"
          aria-hidden="true"
          @change="importFile"
        />
      </footer>
    </template>

    <template v-else-if="view === 'elsewhere'">
      <main class="content">
        <div class="empty">
          <span class="empty-icon"><Icon name="tab" /></span>
          <h1>Recording in another tab</h1>
          <p>
            <strong>{{ state.title }}</strong> is being recorded on {{ sessionHost }}. One guide is
            recorded at a time.
          </p>
        </div>
      </main>
      <footer class="actions">
        <button class="primary grow" type="button" @click="showRecordedTab">Show that tab</button>
        <button class="secondary" type="button" :disabled="busy" @click="run({ type: 'stop' })">
          Finish
        </button>
      </footer>
    </template>

    <template v-else>
      <main class="content">
        <div class="guide-head">
          <h1>{{ state.title }}</h1>
          <p class="meta">{{ summary }}</p>
        </div>

        <div v-if="notice && view === 'recording'" class="notice" role="status">
          <Icon name="alert" :size="16" />
          <span>{{ notice }}</span>
        </div>

        <p v-if="view === 'review' && guide?.steps.length" class="hint">
          Open a step to place markers, write their texts and check its page address.
        </p>

        <StepList
          v-if="guide?.steps.length"
          ref="stepList"
          :steps="guide.steps"
          :image-of="imageOf"
          @select="editingId = $event"
        />
        <p v-else class="hint">No steps yet. Capture one from the page.</p>

        <p v-if="view === 'recording'" class="tip">
          Before you submit a form, press <strong>Capture step</strong> to keep the filled fields.
        </p>
      </main>

      <footer v-if="view === 'recording'" class="actions">
        <button
          v-if="state.status === 'recording'"
          class="primary grow"
          type="button"
          :disabled="busy"
          @click="run({ type: 'capture' })"
        >
          <Icon name="camera" />Capture step
        </button>
        <p v-else-if="accessLost" class="access-hint grow">
          <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
          <span>Click this icon in the toolbar to continue.</span>
        </p>
        <button
          v-else
          class="primary grow"
          type="button"
          :disabled="busy"
          @click="run({ type: 'resume' })"
        >
          <Icon name="play" />Resume
        </button>
        <button
          v-if="state.status === 'recording'"
          class="secondary square"
          type="button"
          aria-label="Pause"
          title="Pause"
          :disabled="busy"
          @click="run({ type: 'pause' })"
        >
          <Icon name="pause" />
        </button>
        <button class="secondary" type="button" :disabled="busy" @click="run({ type: 'stop' })">
          <Icon name="stop" />Finish
        </button>
      </footer>

      <footer v-else-if="confirmDiscard" class="actions confirm-bar">
        <p>Delete this guide and start over? Export it first to keep it.</p>
        <div class="row">
          <button class="danger grow" type="button" :disabled="busy" @click="discard">
            Delete guide
          </button>
          <button class="text" type="button" @click="confirmDiscard = false">Cancel</button>
        </div>
      </footer>

      <footer v-else class="actions">
        <button
          class="primary grow"
          type="button"
          :disabled="busy || !state.stepCount"
          @click="exportGuide"
        >
          <Icon name="download" />Export ZIP
        </button>
        <button
          class="secondary"
          type="button"
          :disabled="!state.stepCount"
          title="Play the guide in a window, as the site will show it"
          @click="openPreview"
        >
          <Icon name="eye" />Preview
        </button>
        <button class="secondary" type="button" @click="confirmDiscard = true">New guide</button>
      </footer>
    </template>

    <div class="toasts" aria-live="polite">
      <p v-if="error" class="toast error" role="alert">
        <span>{{ error }}</span>
        <button class="ghost square small" type="button" aria-label="Dismiss" @click="error = ''">
          <Icon name="close" :size="14" />
        </button>
      </p>
      <p v-else-if="flash" class="toast">{{ flash }}</p>
    </div>
  </div>
</template>
