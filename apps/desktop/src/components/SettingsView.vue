<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open as pickFolder } from '@tauri-apps/plugin-dialog';
import catalog from '../agent/tools.json';
import Icon, { type IconName } from './Icon.vue';
import Logo from './Logo.vue';
import { library } from '../library';
import { revealLabel } from '../platform';
import {
  busyUpdating,
  checkForUpdates,
  info,
  installUpdate,
  loadInfo,
  loadSettings,
  megabytes,
  saveSettings,
  settings,
  update,
  type SettingsTab,
} from '../settings';
import { notify, since, warn } from '../ui';

const props = defineProps<{ tab: SettingsTab }>();
const emit = defineEmits<{ close: []; tab: [tab: SettingsTab]; open: [path: string] }>();

const tabs: { id: SettingsTab; label: string; icon: IconName }[] = [
  { id: 'updates', label: 'Updates', icon: 'download' },
  { id: 'mcp', label: 'MCP', icon: 'plug' },
  { id: 'library', label: 'Library', icon: 'folder' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
];

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
      return 'Installed on this computer. A new version installs in place, then the studio opens again.';
    case 'appImage':
      return 'Runs as an AppImage. A new version takes its place, then the studio opens again.';
    case 'package':
      return 'Installed from a package. A new version opens in the software installer of your system.';
    case 'source':
      return 'Built from the source code, so it never replaces itself. Install a release to get updates.';
    default:
      return 'Copied by hand. Download a new version from the releases page.';
  }
});
const progress = computed(() =>
  update.total ? Math.min(100, Math.round((update.done / update.total) * 100)) : 0,
);
const published = computed(() => {
  const at = latest.value?.publishedAt;
  if (!at) return '';
  return new Date(at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
});

function openPage(url: string | undefined): void {
  if (url)
    void invoke('open_external', { url }).catch((cause) => warn(cause, 'The page could not open.'));
}

async function toggleChecks(event: Event): Promise<void> {
  await saveSettings({ checkUpdates: (event.target as HTMLInputElement).checked }).catch((cause) =>
    warn(cause, 'The setting could not be saved.'),
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
  summary: string;
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
    { id: 'claude', name: 'Claude Code', client: status.claude, command: status.claudeCommand },
    { id: 'codex', name: 'Codex', client: status.codex, command: status.codexCommand },
  ];
});
const recent = computed(() => [...activity.value].reverse().slice(0, 40));

function clientState(client: Client): {
  label: string;
  tone: 'on' | 'warn' | 'off';
  detail: string;
} {
  if (client.connected) {
    return { label: 'Connected', tone: 'on', detail: 'It starts this studio in every project.' };
  }
  if (client.local.length) {
    return {
      label: 'One project only',
      tone: 'warn',
      detail: `${client.local.length === 1 ? 'A folder declares' : `${client.local.length} folders declare`} the studio on its own. Connect again to reach it from every project.`,
    };
  }
  if (client.declared) {
    return {
      label: 'Another copy',
      tone: 'warn',
      detail: `It starts another copy of the studio: ${client.declared}`,
    };
  }
  return { label: 'Not connected', tone: 'off', detail: 'It does not know the studio yet.' };
}

const skillLabel = (client: Client) =>
  client.skill === 'current'
    ? 'Skill up to date'
    : client.skill === 'outdated'
      ? 'Update the skill'
      : 'Install the skill';

async function refreshAgents(): Promise<void> {
  try {
    agents.value = await invoke<Agents>('agents_status');
    listening.value = await invoke<{ port: number; ready: boolean }>('agent_listening');
    activity.value = await invoke<Activity[]>('agent_activity');
  } catch (cause) {
    warn(cause, 'The agents could not be read.');
  }
}

async function connect(id: string, name: string): Promise<void> {
  working.value = `connect-${id}`;
  try {
    await invoke('agents_connect', { client: id });
    notify(`${name} now reaches the studio. Start a new session of ${name} to use it.`);
  } catch (cause) {
    warn(cause, `${name} could not be connected.`);
  } finally {
    working.value = '';
    await refreshAgents();
  }
}

async function installSkill(id: string, name: string): Promise<void> {
  working.value = `skill-${id}`;
  try {
    await invoke<string>('agents_install_skill', { client: id });
    notify(`The skill is ready for ${name}.`);
  } catch (cause) {
    warn(cause, 'The skill could not be installed.');
  } finally {
    working.value = '';
    await refreshAgents();
  }
}

async function toggleAgents(event: Event): Promise<void> {
  await saveSettings({ agents: (event.target as HTMLInputElement).checked }).catch((cause) =>
    warn(cause, 'The setting could not be saved.'),
  );
}

async function copy(text: string, what: string): Promise<void> {
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
  notify(`${what} copied`);
}

const toolTitles = computed(() => catalog.map((tool) => ({ name: tool.name, title: tool.title })));

// Library.

const customLibrary = computed(() => Boolean(settings.value?.library));

async function chooseLibrary(): Promise<void> {
  const folder = await pickFolder({ directory: true, title: 'Folder of the library' }).catch(
    () => null,
  );
  if (typeof folder !== 'string') return;
  await moveLibrary(folder);
}

async function moveLibrary(folder: string | null): Promise<void> {
  try {
    await saveSettings({ library: folder });
    await loadInfo();
    notify('The studio now shows this library');
  } catch (cause) {
    warn(cause, 'The library could not be changed.');
  }
}

const shortcuts: { keys: string[]; what: string }[] = [
  { keys: ['Space'], what: 'Play or pause the tutorial' },
  { keys: ['←', '→'], what: 'Previous or next step' },
  { keys: ['Alt', '↑ / ↓'], what: 'Move the selected step in the steps panel' },
  { keys: ['Delete'], what: 'Delete the selected marker, or the step' },
  { keys: ['Ctrl', 'D'], what: 'Duplicate the step' },
  { keys: ['Ctrl', 'Z'], what: 'Undo' },
  { keys: ['Ctrl', 'Y'], what: 'Redo' },
  { keys: ['Ctrl', 'R'], what: 'Start or stop recording' },
  { keys: ['Esc'], what: 'Leave the player or the browser' },
];

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
    <aside class="plan" aria-label="Settings">
      <header class="plan-head">
        <Logo :size="26" />
        <span class="plan-name">Interactive Learning</span>
      </header>
      <nav class="plan-sites" aria-label="Sections of the settings">
        <button type="button" class="room-link settings-back" @click="emit('close')">
          <Icon name="left" :size="15" />
          <span>Library</span>
        </button>
        <h2 class="plan-title">Settings</h2>
        <button
          v-for="entry in tabs"
          :key="entry.id"
          type="button"
          class="settings-tab"
          :aria-current="entry.id === props.tab ? 'page' : undefined"
          @click="emit('tab', entry.id)"
        >
          <Icon :name="entry.icon" :size="16" />
          <span class="site-name">{{ entry.label }}</span>
          <span
            v-if="entry.id === 'updates' && update.phase === 'available'"
            class="badge-dot"
            aria-label="A new version is available"
          ></span>
        </button>
      </nav>
      <footer class="plan-foot">
        <p class="settings-version tabular">Version {{ info?.version ?? '…' }}</p>
      </footer>
    </aside>

    <main class="settings-page">
      <!-- Updates -->
      <section v-if="props.tab === 'updates'" class="settings-body" aria-labelledby="updates-title">
        <header class="settings-head">
          <h1 id="updates-title">Updates</h1>
          <p>
            New versions of the studio come from its releases on GitHub. Installing one keeps your
            library and your settings.
          </p>
        </header>

        <div class="settings-group">
          <div class="setting-row">
            <div class="setting-text">
              <strong>Interactive Learning Studio {{ info?.version }}</strong>
              <span class="hint">{{ installNote }}</span>
            </div>
            <button
              type="button"
              class="button"
              :disabled="busyUpdating()"
              @click="checkForUpdates"
            >
              <Icon name="reload" :size="15" />Check now
            </button>
          </div>

          <p class="update-line" :data-phase="update.phase" role="status">
            <template v-if="update.phase === 'checking'">
              <span class="spinner" aria-hidden="true"></span>Looking for a new version…
            </template>
            <template v-else-if="update.phase === 'current'">
              <Icon name="published" :size="16" />The studio is up to date.
              <span class="hint">Checked {{ since(update.checkedAt) }}</span>
            </template>
            <template v-else-if="update.phase === 'available'">
              <Icon name="info" :size="16" />Version {{ latest?.version }} is available.
            </template>
            <template v-else-if="update.phase === 'downloading'">
              <span class="spinner" aria-hidden="true"></span>Downloading version
              {{ latest?.version }}…
              <span class="hint tabular"
                >{{ megabytes(update.done) }} of {{ megabytes(update.total) }}</span
              >
            </template>
            <template v-else-if="update.phase === 'installing'">
              <span class="spinner" aria-hidden="true"></span>
              <template v-if="update.installedBy === 'package'"
                >The package of version {{ latest?.version }} opened in your software installer.
                Finish there, then open the studio again.</template
              >
              <template v-else
                >Installing version {{ latest?.version }}. The studio closes and opens again in a
                moment.</template
              >
            </template>
            <template v-else-if="update.phase === 'failed'">
              <Icon name="alert" :size="16" /><span class="error-text">{{ update.error }}</span>
            </template>
            <template v-else>Not checked yet.</template>
          </p>

          <div v-if="update.phase === 'downloading'" class="progress" aria-hidden="true">
            <span :style="{ width: `${progress}%` }"></span>
          </div>

          <article
            v-if="latest && update.check?.available && update.phase !== 'checking'"
            class="release"
            aria-label="The new version"
          >
            <header class="release-head">
              <h2>Version {{ latest.version }}</h2>
              <span class="hint tabular">
                <template v-if="published">{{ published }}</template>
                <template v-if="latest.asset"> · {{ megabytes(latest.asset.size) }}</template>
              </span>
            </header>
            <ul v-if="latest.notes.length" class="release-notes">
              <li v-for="note in latest.notes" :key="note">{{ note }}</li>
            </ul>
            <p v-else class="hint">This version has no notes.</p>
            <footer class="release-actions">
              <button
                type="button"
                class="button primary"
                :disabled="!canInstall || busyUpdating()"
                @click="installUpdate"
              >
                <Icon name="download" :size="16" />Download and install
              </button>
              <button type="button" class="button quiet" @click="openPage(latest.page)">
                <Icon name="external" :size="15" />See on GitHub
              </button>
            </footer>
            <p v-if="!canInstall" class="hint">{{ installNote }}</p>
          </article>
        </div>

        <div class="settings-group">
          <h2 class="group-title">Automatic</h2>
          <label class="setting-row">
            <span class="setting-text">
              <strong>Look for a new version each time the studio starts</strong>
              <span class="hint"
                >The studio says when one is ready to install, and you choose when.</span
              >
            </span>
            <input
              type="checkbox"
              class="switch"
              :checked="settings?.checkUpdates ?? true"
              @change="toggleChecks"
            />
          </label>
          <button type="button" class="link-button" @click="openPage(info?.releases)">
            <Icon name="external" :size="14" />Every version of the studio
          </button>
        </div>
      </section>

      <!-- MCP -->
      <section v-else-if="props.tab === 'mcp'" class="settings-body" aria-labelledby="mcp-title">
        <header class="settings-head">
          <h1 id="mcp-title">MCP</h1>
          <p>
            AI agents such as Claude Code and Codex can drive the studio through its MCP server. An
            agent opens your site in the browser of the studio, records its clicks as steps, writes
            the texts and publishes, here in this window, where you watch and can take over. What it
            makes joins your library, so you can come back to it.
          </p>
        </header>

        <div class="settings-group">
          <label class="setting-row">
            <span class="setting-text">
              <strong>Let AI agents drive the studio</strong>
              <span class="hint">
                <template v-if="settings?.agents === false"
                  >Off: agents can no longer change anything in the studio.</template
                >
                <template v-else-if="listening?.port"
                  >On. Agents reach this studio from this computer only, never from a
                  website.</template
                >
                <template v-else>The studio could not open its address for agents.</template>
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
          <h2 class="group-title">Connect an agent</h2>
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
                  entry.client.connected ? 'Connect again' : `Connect ${entry.name}`
                }}
              </button>
              <button
                type="button"
                class="button quiet"
                :disabled="working !== '' || entry.client.skill === 'current'"
                :title="'The skill teaches the agent how to make a good tutorial with the studio'"
                @click="installSkill(entry.id, entry.name)"
              >
                <Icon
                  :name="entry.client.skill === 'current' ? 'check' : 'download'"
                  :size="15"
                />{{ skillLabel(entry.client) }}
              </button>
            </div>
          </div>
          <p class="hint">
            After connecting, start a new session of the agent, then ask it to record a tutorial of
            your site.
          </p>
        </div>

        <div v-if="agents" class="settings-group">
          <h2 class="group-title">Other agents</h2>
          <p class="hint">
            Claude Desktop, Cursor and other clients start the studio with this configuration.
          </p>
          <div class="code-block">
            <pre class="code">{{ agents.json }}</pre>
            <button
              type="button"
              class="button small"
              @click="copy(agents.json, 'The configuration')"
            >
              <Icon name="copy" :size="14" />Copy
            </button>
          </div>
          <p class="hint">Or in a terminal, for Claude Code:</p>
          <div class="code-block">
            <pre class="code">{{ agents.claudeCommand }}</pre>
            <button
              type="button"
              class="button small"
              @click="copy(agents.claudeCommand, 'The command')"
            >
              <Icon name="copy" :size="14" />Copy
            </button>
          </div>
        </div>

        <div class="settings-group">
          <h2 class="group-title">What an agent can do</h2>
          <ul class="tool-list">
            <li v-for="tool in toolTitles" :key="tool.name">
              <span>{{ tool.title }}</span>
              <code>{{ tool.name }}</code>
            </li>
          </ul>
        </div>

        <div class="settings-group">
          <h2 class="group-title">Recent activity</h2>
          <ol v-if="recent.length" class="activity">
            <li v-for="(entry, index) in recent" :key="`${entry.at}-${index}`" :data-ok="entry.ok">
              <time class="tabular" :datetime="entry.at">{{ since(entry.at) }}</time>
              <span class="activity-agent">{{ entry.agent }}</span>
              <span class="activity-text">{{ entry.summary || entry.tool }}</span>
              <button
                v-if="entry.tutorial"
                type="button"
                class="button small quiet"
                @click="emit('open', entry.tutorial)"
              >
                Open
              </button>
            </li>
          </ol>
          <p v-else class="hint">
            Nothing yet. What agents make in the studio shows here, with a way back to each
            tutorial.
          </p>
        </div>
      </section>

      <!-- Library -->
      <section
        v-else-if="props.tab === 'library'"
        class="settings-body"
        aria-labelledby="library-title"
      >
        <header class="settings-head">
          <h1 id="library-title">Library</h1>
          <p>
            Your sites, themes and tutorials live in one folder on this computer, with a folder for
            each of them. Every Interactive Learning tool opens them, and you can back them up or
            share them like any other file.
          </p>
        </header>
        <div class="settings-group">
          <h2 class="group-title">Folder</h2>
          <div class="folder-pick">
            <span class="folder-value" :title="info?.library">{{ info?.library }}</span>
            <button
              type="button"
              class="button"
              @click="
                library
                  .reveal(info?.library ?? '', true)
                  .catch((cause) => warn(cause, 'The folder could not be shown.'))
              "
            >
              <Icon name="folder" :size="15" />{{ revealLabel }}
            </button>
            <button type="button" class="button" @click="chooseLibrary">Change…</button>
          </div>
          <button v-if="customLibrary" type="button" class="link-button" @click="moveLibrary(null)">
            Use the default folder, {{ info?.defaultLibrary }}
          </button>
          <p class="hint">
            Another folder does not move your tutorials: the studio shows the library of the folder
            you choose, and the previous one stays where it is.
          </p>
        </div>
      </section>

      <!-- Shortcuts -->
      <section v-else class="settings-body" aria-labelledby="shortcuts-title">
        <header class="settings-head">
          <h1 id="shortcuts-title">Shortcuts</h1>
          <p>The keys of the editor. A text field keeps its own keys while you type in it.</p>
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
