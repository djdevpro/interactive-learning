<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open as pickFolder } from '@tauri-apps/plugin-dialog';
import catalog from '../agent/tools.json';
import Icon, { type IconName } from './Icon.vue';
import Logo from './Logo.vue';
import { summaryText } from '../agent/bridge';
import type { Summary } from '../agent/types';
import {
  LANGUAGE_NAMES,
  formatDate,
  isMessageKey,
  locale,
  matchLocale,
  since,
  t,
  type LanguageChoice,
  type MessageKey,
} from '../i18n';
import { library } from '../library';
import { contextMenu } from '../menus';
import { revealLabel } from '../platform';
import {
  busyUpdating,
  checkForUpdates,
  chooseLanguage,
  info,
  installUpdate,
  loadInfo,
  loadSettings,
  megabytes,
  saveSettings,
  settings,
  systemLocale,
  update,
  type SettingsTab,
} from '../settings';
import { notify, warn } from '../ui';

const props = defineProps<{ tab: SettingsTab }>();
const emit = defineEmits<{ close: []; tab: [tab: SettingsTab]; open: [path: string] }>();

const tabs: { id: SettingsTab; label: MessageKey; icon: IconName }[] = [
  { id: 'general', label: 'settings.tabGeneral', icon: 'settings' },
  { id: 'updates', label: 'settings.tabUpdates', icon: 'download' },
  { id: 'mcp', label: 'settings.tabMcp', icon: 'plug' },
  { id: 'library', label: 'settings.tabLibrary', icon: 'folder' },
  { id: 'shortcuts', label: 'settings.tabShortcuts', icon: 'keyboard' },
];

// General.

const languages: { id: LanguageChoice; label: () => string }[] = [
  { id: 'auto', label: () => t('general.automatic') },
  { id: 'en', label: () => LANGUAGE_NAMES.en },
  { id: 'fr', label: () => LANGUAGE_NAMES.fr },
];
const choice = computed<LanguageChoice>(() => settings.value?.language ?? 'auto');
const computerLanguage = computed(() => LANGUAGE_NAMES[matchLocale(systemLocale.value)]);

async function pickLanguage(next: LanguageChoice): Promise<void> {
  await chooseLanguage(next).catch((cause) => warn(cause, t('settings.saveFailed')));
}

// Updates.

const latest = computed(() => update.check?.latest ?? null);
const canInstall = computed(
  () =>
    Boolean(latest.value?.asset) &&
    (update.check?.install === 'installer' ||
      update.check?.install === 'appImage' ||
      update.check?.install === 'package'),
);
const installNote = computed(() => {
  switch (info.value?.install) {
    case 'installer':
      return t('updates.installInstaller');
    case 'appImage':
      return t('updates.installAppImage');
    case 'package':
      return t('updates.installPackage');
    case 'source':
      return t('updates.installSource');
    default:
      return t('updates.installManual');
  }
});
const progress = computed(() =>
  update.total ? Math.min(100, Math.round((update.done / update.total) * 100)) : 0,
);
const published = computed(() => {
  const at = latest.value?.publishedAt;
  return at ? formatDate(at) : '';
});

function openPage(url: string | undefined): void {
  if (url) {
    void invoke('open_external', { url }).catch((cause) => warn(cause, t('settings.pageFailed')));
  }
}

async function toggleChecks(event: Event): Promise<void> {
  await saveSettings({ checkUpdates: (event.target as HTMLInputElement).checked }).catch((cause) =>
    warn(cause, t('settings.saveFailed')),
  );
}

// MCP.

interface Client {
  declared: string | null;
  connected: boolean;
  local: string[];
  skill: 'missing' | 'current' | 'outdated';
}
interface Agents {
  exe: string;
  name: string;
  claude: Client;
  codex: Client;
  claudeCommand: string;
  codexCommand: string;
  json: string;
  tools: string[];
}
interface Activity {
  at: string;
  agent: string;
  tool: string;
  ok: boolean;
  summary: Summary | string | null;
  tutorial: string | null;
}

const agents = shallowRef<Agents | null>(null);
const listening = shallowRef<{ port: number; ready: boolean } | null>(null);
const activity = ref<Activity[]>([]);
const working = ref('');
const unlisten: UnlistenFn[] = [];

const clients = computed(() => {
  const status = agents.value;
  if (!status) return [];
  return [
    { id: 'claude', name: 'Claude Code', client: status.claude },
    { id: 'codex', name: 'Codex', client: status.codex },
  ];
});
const recent = computed(() => [...activity.value].reverse().slice(0, 40));

function clientState(client: Client): {
  label: string;
  tone: 'on' | 'warn' | 'off';
  detail: string;
} {
  if (client.connected) {
    return { label: t('mcp.connected'), tone: 'on', detail: t('mcp.connectedDetail') };
  }
  if (client.local.length) {
    return {
      label: t('mcp.oneProject'),
      tone: 'warn',
      detail: t('mcp.oneProjectDetail', { count: client.local.length }),
    };
  }
  if (client.declared) {
    return {
      label: t('mcp.anotherCopy'),
      tone: 'warn',
      detail: t('mcp.anotherCopyDetail', { path: client.declared }),
    };
  }
  return { label: t('mcp.notConnected'), tone: 'off', detail: t('mcp.notConnectedDetail') };
}

const skillLabel = (client: Client) =>
  client.skill === 'current'
    ? t('mcp.skillCurrent')
    : client.skill === 'outdated'
      ? t('mcp.skillOutdated')
      : t('mcp.skillMissing');

/** What an entry of the journal says, in the language of the day. */
function entryText(entry: Activity): string {
  if (!entry.ok) {
    return t('mcp.failed', { message: typeof entry.summary === 'string' ? entry.summary : '' });
  }
  return summaryText(entry.summary) || toolTitle(entry.tool);
}

function toolTitle(name: string): string {
  const key = `tool.${name}`;
  return isMessageKey(key) ? t(key) : name;
}

async function refreshAgents(): Promise<void> {
  try {
    agents.value = await invoke<Agents>('agents_status');
    listening.value = await invoke<{ port: number; ready: boolean }>('agent_listening');
    activity.value = await invoke<Activity[]>('agent_activity');
  } catch (cause) {
    warn(cause, t('mcp.readFailed'));
  }
}

async function connect(id: string, name: string): Promise<void> {
  working.value = `connect-${id}`;
  try {
    await invoke('agents_connect', { client: id });
    notify(t('mcp.connectedToast', { agent: name }));
  } catch (cause) {
    warn(cause, t('mcp.connectFailed', { agent: name }));
  } finally {
    working.value = '';
    await refreshAgents();
  }
}

async function installSkill(id: string, name: string): Promise<void> {
  working.value = `skill-${id}`;
  try {
    await invoke<string>('agents_install_skill', { client: id });
    notify(t('mcp.skillReady', { agent: name }));
  } catch (cause) {
    warn(cause, t('mcp.skillFailed'));
  } finally {
    working.value = '';
    await refreshAgents();
  }
}

async function toggleAgents(event: Event): Promise<void> {
  await saveSettings({ agents: (event.target as HTMLInputElement).checked }).catch((cause) =>
    warn(cause, t('settings.saveFailed')),
  );
}

async function copy(text: string, done: MessageKey): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    document.body.append(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  }
  notify(t(done));
}

function activityMenu(event: MouseEvent, entry: Activity): void {
  if (!entry.tutorial) return;
  const path = entry.tutorial;
  contextMenu(
    event,
    [{ label: t('menu.openTutorial'), icon: 'edit', run: () => emit('open', path) }],
    t('mcp.activity'),
  );
}

// Library.

const customLibrary = computed(() => Boolean(settings.value?.library));

async function chooseLibrary(): Promise<void> {
  const folder = await pickFolder({ directory: true, title: t('librarySettings.dialog') }).catch(
    () => null,
  );
  if (typeof folder !== 'string') return;
  await moveLibrary(folder);
}

async function moveLibrary(folder: string | null): Promise<void> {
  try {
    await saveSettings({ library: folder });
    await loadInfo();
    notify(t('librarySettings.changed'));
  } catch (cause) {
    warn(cause, t('librarySettings.changeFailed'));
  }
}

const shortcuts = computed<{ keys: string[]; what: string }[]>(() => [
  { keys: [t('keys.space')], what: t('shortcuts.play') },
  { keys: ['←', '→'], what: t('shortcuts.steps') },
  { keys: [t('keys.alt'), '↑ / ↓'], what: t('shortcuts.move') },
  { keys: [t('keys.delete')], what: t('shortcuts.delete') },
  { keys: [t('keys.ctrl'), 'D'], what: t('shortcuts.duplicate') },
  { keys: [t('keys.ctrl'), 'Z'], what: t('shortcuts.undo') },
  { keys: [t('keys.ctrl'), 'Y'], what: t('shortcuts.redo') },
  { keys: [t('keys.ctrl'), 'R'], what: t('shortcuts.record') },
  { keys: [t('keys.escape')], what: t('shortcuts.escape') },
  { keys: [t('keys.shift'), 'F10'], what: t('shortcuts.menu') },
]);

onMounted(async () => {
  await Promise.all([loadSettings(), loadInfo()]).catch(() => undefined);
  await refreshAgents();
  unlisten.push(
    await listen<Activity>('agent-activity', ({ payload }) => {
      activity.value = [...activity.value, payload];
    }),
  );
  if (props.tab === 'updates' && update.phase === 'idle') void checkForUpdates();
});

watch(
  () => props.tab,
  (tab) => {
    if (tab === 'updates' && update.phase === 'idle') void checkForUpdates();
    if (tab === 'mcp') void refreshAgents();
  },
);

onUnmounted(() => {
  for (const stop of unlisten) stop();
});
</script>

<template>
  <div class="settings">
    <aside class="plan" :aria-label="t('common.settings')">
      <header class="plan-head">
        <Logo :size="26" />
        <span class="plan-name">Interactive Learning</span>
      </header>
      <nav class="plan-sites" :aria-label="t('settings.sections')">
        <button type="button" class="room-link settings-back" @click="emit('close')">
          <Icon name="left" :size="15" />
          <span>{{ t('common.library') }}</span>
        </button>
        <h2 class="plan-title">{{ t('common.settings') }}</h2>
        <div class="settings-tabs">
          <button
            v-for="entry in tabs"
            :key="entry.id"
            type="button"
            class="settings-tab"
            :aria-current="entry.id === props.tab ? 'page' : undefined"
            @click="emit('tab', entry.id)"
          >
            <Icon :name="entry.icon" :size="16" />
            <span class="site-name">{{ t(entry.label) }}</span>
            <span
              v-if="entry.id === 'updates' && update.phase === 'available'"
              class="badge-dot"
              :aria-label="t('common.newVersion')"
            ></span>
          </button>
        </div>
      </nav>
      <footer class="plan-foot">
        <p class="settings-version tabular">
          {{ t('settings.version', { version: info?.version ?? '…' }) }}
        </p>
      </footer>
    </aside>

    <main class="settings-page">
      <!-- General -->
      <section v-if="props.tab === 'general'" class="settings-body" aria-labelledby="general-title">
        <header class="settings-head">
          <h1 id="general-title">{{ t('general.title') }}</h1>
          <p>{{ t('general.intro') }}</p>
        </header>
        <div class="settings-group">
          <h2 class="group-title">{{ t('general.language') }}</h2>
          <div class="setting-row">
            <span class="setting-text">
              <span class="hint">{{ t('general.languageHint') }}</span>
              <span class="hint">{{ t('general.follows', { language: computerLanguage }) }}</span>
            </span>
            <div class="segmented" role="radiogroup" :aria-label="t('general.language')">
              <button
                v-for="language in languages"
                :key="language.id"
                type="button"
                role="radio"
                :aria-checked="choice === language.id"
                :lang="language.id === 'auto' ? locale : language.id"
                @click="pickLanguage(language.id)"
              >
                {{ language.label() }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Updates -->
      <section
        v-else-if="props.tab === 'updates'"
        class="settings-body"
        aria-labelledby="updates-title"
      >
        <header class="settings-head">
          <h1 id="updates-title">{{ t('updates.title') }}</h1>
          <p>{{ t('updates.intro') }}</p>
        </header>

        <div class="settings-group">
          <div class="setting-row">
            <div class="setting-text">
              <strong>{{ t('updates.product', { version: info?.version ?? '' }) }}</strong>
              <span class="hint">{{ installNote }}</span>
            </div>
            <button
              type="button"
              class="button"
              :disabled="busyUpdating()"
              @click="checkForUpdates"
            >
              <Icon name="reload" :size="15" />{{ t('updates.check') }}
            </button>
          </div>

          <p class="update-line" :data-phase="update.phase" role="status">
            <template v-if="update.phase === 'checking'">
              <span class="spinner" aria-hidden="true"></span>{{ t('updates.checking') }}
            </template>
            <template v-else-if="update.phase === 'current'">
              <Icon name="published" :size="16" />{{ t('updates.current') }}
              <span class="hint">{{
                t('updates.checked', { when: since(update.checkedAt) })
              }}</span>
            </template>
            <template v-else-if="update.phase === 'available'">
              <Icon name="info" :size="16" />{{
                t('updates.available', { version: latest?.version ?? '' })
              }}
            </template>
            <template v-else-if="update.phase === 'downloading'">
              <span class="spinner" aria-hidden="true"></span
              >{{ t('updates.downloading', { version: latest?.version ?? '' }) }}
              <span class="hint tabular">{{
                t('updates.progress', {
                  done: megabytes(update.done),
                  total: megabytes(update.total),
                })
              }}</span>
            </template>
            <template v-else-if="update.phase === 'installing'">
              <span class="spinner" aria-hidden="true"></span>
              <template v-if="update.installedBy === 'package'">{{
                t('updates.package', { version: latest?.version ?? '' })
              }}</template>
              <template v-else>{{
                t('updates.installing', { version: latest?.version ?? '' })
              }}</template>
            </template>
            <template v-else-if="update.phase === 'failed'">
              <Icon name="alert" :size="16" /><span class="error-text">{{ update.error }}</span>
            </template>
            <template v-else>{{ t('updates.idle') }}</template>
          </p>

          <div v-if="update.phase === 'downloading'" class="progress" aria-hidden="true">
            <span :style="{ width: `${progress}%` }"></span>
          </div>

          <article
            v-if="latest && update.check?.available && update.phase !== 'checking'"
            class="release"
            :aria-label="t('updates.newVersion')"
          >
            <header class="release-head">
              <h2>{{ t('updates.version', { version: latest.version }) }}</h2>
              <span class="hint tabular">
                <template v-if="published">{{ published }}</template>
                <template v-if="latest.asset"> · {{ megabytes(latest.asset.size) }}</template>
              </span>
            </header>
            <ul v-if="latest.notes.length" class="release-notes" lang="en">
              <li v-for="note in latest.notes" :key="note">{{ note }}</li>
            </ul>
            <p v-else class="hint">{{ t('updates.noNotes') }}</p>
            <footer class="release-actions">
              <button
                type="button"
                class="button primary"
                :disabled="!canInstall || busyUpdating()"
                @click="installUpdate"
              >
                <Icon name="download" :size="16" />{{ t('updates.install') }}
              </button>
              <button type="button" class="button quiet" @click="openPage(latest.page)">
                <Icon name="external" :size="15" />{{ t('updates.github') }}
              </button>
            </footer>
            <p v-if="!canInstall" class="hint">{{ installNote }}</p>
          </article>
        </div>

        <div class="settings-group">
          <h2 class="group-title">{{ t('updates.automatic') }}</h2>
          <label class="setting-row">
            <span class="setting-text">
              <strong>{{ t('updates.checkOnStart') }}</strong>
              <span class="hint">{{ t('updates.checkOnStartHint') }}</span>
            </span>
            <input
              type="checkbox"
              class="switch"
              :checked="settings?.checkUpdates ?? true"
              @change="toggleChecks"
            />
          </label>
          <button type="button" class="link-button" @click="openPage(info?.releases)">
            <Icon name="external" :size="14" />{{ t('updates.every') }}
          </button>
        </div>
      </section>

      <!-- MCP -->
      <section v-else-if="props.tab === 'mcp'" class="settings-body" aria-labelledby="mcp-title">
        <header class="settings-head">
          <h1 id="mcp-title">{{ t('mcp.title') }}</h1>
          <p>{{ t('mcp.intro') }}</p>
        </header>

        <div class="settings-group">
          <label class="setting-row">
            <span class="setting-text">
              <strong>{{ t('mcp.allow') }}</strong>
              <span class="hint">
                <template v-if="settings?.agents === false">{{ t('mcp.off') }}</template>
                <template v-else-if="listening?.port">{{ t('mcp.on') }}</template>
                <template v-else>{{ t('mcp.noAddress') }}</template>
              </span>
            </span>
            <input
              type="checkbox"
              class="switch"
              :checked="settings?.agents ?? true"
              @change="toggleAgents"
            />
          </label>
        </div>

        <div class="settings-group">
          <h2 class="group-title">{{ t('mcp.connect') }}</h2>
          <div v-for="entry in clients" :key="entry.id" class="agent-row">
            <div class="agent-head">
              <strong>{{ entry.name }}</strong>
              <span class="status-pill" :data-tone="clientState(entry.client).tone">
                <span class="dot" aria-hidden="true"></span>{{ clientState(entry.client).label }}
              </span>
            </div>
            <p class="hint">{{ clientState(entry.client).detail }}</p>
            <div class="agent-actions">
              <button
                type="button"
                class="button"
                :disabled="working !== ''"
                @click="connect(entry.id, entry.name)"
              >
                <Icon name="plug" :size="15" />{{
                  entry.client.connected
                    ? t('mcp.connectAgain')
                    : t('mcp.connectAgent', { agent: entry.name })
                }}
              </button>
              <button
                type="button"
                class="button quiet"
                :disabled="working !== '' || entry.client.skill === 'current'"
                :title="t('mcp.skillTitle')"
                @click="installSkill(entry.id, entry.name)"
              >
                <Icon
                  :name="entry.client.skill === 'current' ? 'check' : 'download'"
                  :size="15"
                />{{ skillLabel(entry.client) }}
              </button>
            </div>
          </div>
          <p class="hint">{{ t('mcp.afterConnect') }}</p>
        </div>

        <div v-if="agents" class="settings-group">
          <h2 class="group-title">{{ t('mcp.others') }}</h2>
          <p class="hint">{{ t('mcp.othersHint') }}</p>
          <div class="code-block">
            <pre class="code">{{ agents.json }}</pre>
            <button
              type="button"
              class="button small"
              @click="copy(agents.json, 'mcp.configCopied')"
            >
              <Icon name="copy" :size="14" />{{ t('common.copy') }}
            </button>
          </div>
          <p class="hint">{{ t('mcp.terminal') }}</p>
          <div class="code-block">
            <pre class="code">{{ agents.claudeCommand }}</pre>
            <button
              type="button"
              class="button small"
              @click="copy(agents.claudeCommand, 'mcp.commandCopied')"
            >
              <Icon name="copy" :size="14" />{{ t('common.copy') }}
            </button>
          </div>
        </div>

        <div class="settings-group">
          <h2 class="group-title">{{ t('mcp.tools') }}</h2>
          <ul class="tool-list">
            <li v-for="tool in catalog" :key="tool.name">
              <span>{{ toolTitle(tool.name) }}</span>
              <code>{{ tool.name }}</code>
            </li>
          </ul>
        </div>

        <div class="settings-group">
          <h2 class="group-title">{{ t('mcp.activity') }}</h2>
          <ol v-if="recent.length" class="activity">
            <li
              v-for="(entry, index) in recent"
              :key="`${entry.at}-${index}`"
              :data-ok="entry.ok"
              @contextmenu="activityMenu($event, entry)"
            >
              <time class="tabular" :datetime="entry.at">{{ since(entry.at) }}</time>
              <span class="activity-agent">{{ entry.agent }}</span>
              <span class="activity-text">{{ entryText(entry) }}</span>
              <button
                v-if="entry.tutorial"
                type="button"
                class="button small quiet"
                @click="emit('open', entry.tutorial)"
              >
                {{ t('common.open') }}
              </button>
            </li>
          </ol>
          <p v-else class="hint">{{ t('mcp.noActivity') }}</p>
        </div>
      </section>

      <!-- Library -->
      <section
        v-else-if="props.tab === 'library'"
        class="settings-body"
        aria-labelledby="library-title"
      >
        <header class="settings-head">
          <h1 id="library-title">{{ t('librarySettings.title') }}</h1>
          <p>{{ t('librarySettings.intro') }}</p>
        </header>
        <div class="settings-group">
          <h2 class="group-title">{{ t('librarySettings.folder') }}</h2>
          <div class="folder-pick">
            <span class="folder-value" :title="info?.library">{{ info?.library }}</span>
            <button
              type="button"
              class="button"
              @click="
                library
                  .reveal(info?.library ?? '', true)
                  .catch((cause) => warn(cause, t('library.revealFailed')))
              "
            >
              <Icon name="folder" :size="15" />{{ revealLabel() }}
            </button>
            <button type="button" class="button" @click="chooseLibrary">
              {{ t('librarySettings.change') }}
            </button>
          </div>
          <button v-if="customLibrary" type="button" class="link-button" @click="moveLibrary(null)">
            {{ t('librarySettings.useDefault', { folder: info?.defaultLibrary ?? '' }) }}
          </button>
          <p class="hint">{{ t('librarySettings.hint') }}</p>
        </div>
      </section>

      <!-- Shortcuts -->
      <section v-else class="settings-body" aria-labelledby="shortcuts-title">
        <header class="settings-head">
          <h1 id="shortcuts-title">{{ t('shortcuts.title') }}</h1>
          <p>{{ t('shortcuts.intro') }}</p>
        </header>
        <div class="settings-group">
          <dl class="keys">
            <template v-for="shortcut in shortcuts" :key="shortcut.what">
              <dt>
                <kbd v-for="key in shortcut.keys" :key="key">{{ key }}</kbd>
              </dt>
              <dd>{{ shortcut.what }}</dd>
            </template>
          </dl>
        </div>
      </section>
    </main>
  </div>
</template>
