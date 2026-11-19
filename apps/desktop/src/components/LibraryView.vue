<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { open as pickFolder } from '@tauri-apps/plugin-dialog';
import { createGuide } from '@interactive-learning/protocol';
import Icon from './Icon.vue';
import Logo from './Logo.vue';
import {
  THEME_COLORS,
  library,
  timecode,
  tutorialStatus,
  tutorialUrl,
  type SiteEntry,
  type ThemeColor,
  type ThemeEntry,
  type TutorialEntry,
} from '../library';
import { presence } from '../agent/bridge';
import { t } from '../i18n';
import { buttonMenu, contextMenu, type MenuEntry } from '../menus';
import { bin, canRecord, revealLabel } from '../platform';
import { update } from '../settings';
import { notify, since, warn } from '../ui';

const props = defineProps<{ selectedSite: string | null }>();
const emit = defineEmits<{
  open: [path: string, mode: 'record' | 'edit'];
  'select-site': [id: string];
  settings: [];
}>();

const sites = ref<SiteEntry[]>([]);
const root = ref('');
const loaded = ref(false);
const search = ref('');
const gallery = ref<HTMLElement | null>(null);

type Form =
  | { kind: 'site'; id?: string; name: string; address: string; publishTo: string | null }
  | { kind: 'theme'; site: string; id?: string; name: string; color: ThemeColor }
  | { kind: 'tutorial'; site: string; theme: string; title: string }
  | { kind: 'rename'; path: string; title: string }
  | { kind: 'delete'; path: string; what: string; detail: string };
const form = ref<Form | null>(null);
const formError = ref('');
const dialog = ref<HTMLDialogElement | null>(null);

const site = computed(
  () => sites.value.find((entry) => entry.id === props.selectedSite) ?? sites.value[0],
);
const tutorialCount = (entry: SiteEntry) =>
  entry.themes.reduce((total, theme) => total + theme.tutorials.length, 0);
const themeRuntime = (theme: ThemeEntry) =>
  timecode(theme.tutorials.reduce((total, tutorial) => total + tutorial.durationMs, 0));

/** Themes of the open site, with only the tutorials that match the search. */
const rooms = computed(() => {
  const words = search.value.trim().toLowerCase();
  return (site.value?.themes ?? []).map((theme) => ({
    ...theme,
    shown: words
      ? theme.tutorials.filter((tutorial) => tutorial.title.toLowerCase().includes(words))
      : theme.tutorials,
  }));
});
/** Themes a new tutorial can go to: those of the site it is created in. */
const formThemes = computed(() => {
  const current = form.value;
  if (current?.kind !== 'tutorial') return [];
  return sites.value.find((entry) => entry.id === current.site)?.themes ?? [];
});
const nothingFound = computed(
  () => search.value.trim() !== '' && rooms.value.every((room) => room.shown.length === 0),
);

async function refresh(): Promise<void> {
  try {
    sites.value = await library.scan();
  } catch (cause) {
    warn(cause, t('library.readFailed'));
  } finally {
    loaded.value = true;
  }
}

onMounted(async () => {
  root.value = await library.root().catch(() => '');
  await refresh();
});

defineExpose({ refresh });

function status(tutorial: TutorialEntry): { label: string; tone: 'done' | 'changed' | 'draft' } {
  const state = tutorialStatus(tutorial);
  if (state === 'draft') return { label: t('library.draft'), tone: 'draft' };
  return state === 'published'
    ? { label: t('library.published'), tone: 'done' }
    : { label: t('library.changed'), tone: 'changed' };
}

/** The part of the first screenshot its step shows, as a cover. */
function coverStyle(tutorial: TutorialEntry): Record<string, string> {
  const view = tutorial.coverViewport;
  const top = view && view.height < 1 ? (view.y / (1 - view.height)) * 100 : 0;
  return { objectPosition: `0 ${Math.min(100, Math.max(0, top))}%` };
}

function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 3 ? `…\\${parts.slice(-3).join('\\')}` : path;
}

/** What deleting a site or a theme takes with it. */
function goesWith(count: number): string {
  return count === 0 ? t('library.holdsNothing') : t('library.goesWith', { count });
}

function reveal(path: string, absolute = false): void {
  library.reveal(path, absolute).catch((cause) => warn(cause, t('library.revealFailed')));
}

// Forms.

async function openForm(next: Form): Promise<void> {
  form.value = next;
  formError.value = '';
  await nextTick();
  dialog.value?.showModal();
  dialog.value?.querySelector<HTMLInputElement>('input')?.select();
}

function closeForm(): void {
  dialog.value?.close();
  form.value = null;
}

function newSite(): void {
  void openForm({ kind: 'site', name: '', address: '', publishTo: null });
}

function editSite(entry: SiteEntry): void {
  void openForm({
    kind: 'site',
    id: entry.id,
    name: entry.name,
    address: entry.address,
    publishTo: entry.publishTo,
  });
}

function newTheme(entry: SiteEntry): void {
  const used = new Set(entry.themes.map((theme) => theme.color));
  const color = THEME_COLORS.find((candidate) => !used.has(candidate)) ?? 'blue';
  void openForm({ kind: 'theme', site: entry.id, name: '', color });
}

function editTheme(entry: SiteEntry, theme: ThemeEntry): void {
  void openForm({
    kind: 'theme',
    site: entry.id,
    id: theme.id,
    name: theme.name,
    color: theme.color,
  });
}

function newTutorial(entry: SiteEntry, theme?: ThemeEntry): void {
  const first = theme ?? entry.themes[0];
  void openForm({ kind: 'tutorial', site: entry.id, theme: first?.id ?? '', title: '' });
}

async function chooseFolder(): Promise<void> {
  if (form.value?.kind !== 'site') return;
  const folder = await pickFolder({ directory: true, title: t('library.publishDialog') });
  if (typeof folder === 'string') form.value.publishTo = folder;
}

async function submit(): Promise<void> {
  const current = form.value;
  if (!current) return;
  formError.value = '';
  try {
    if (current.kind === 'site') {
      if (!current.name.trim()) return void (formError.value = t('library.siteNameMissing'));
      const id = await library.saveSite({
        ...(current.id ? { id: current.id } : {}),
        name: current.name,
        address: current.address,
        publishTo: current.publishTo,
      });
      // A new site starts with one theme, so a first tutorial has a place to go.
      if (!current.id)
        await library.saveTheme(id, { name: t('library.generalTheme'), color: 'blue' });
      emit('select-site', id);
    } else if (current.kind === 'theme') {
      if (!current.name.trim()) return void (formError.value = t('library.themeNameMissing'));
      await library.saveTheme(current.site, {
        ...(current.id ? { id: current.id } : {}),
        name: current.name,
        color: current.color,
      });
    } else if (current.kind === 'tutorial') {
      const title = current.title.trim() || t('common.untitledTutorial');
      let theme = current.theme;
      if (!theme) {
        theme = await library.saveTheme(current.site, {
          name: t('library.generalTheme'),
          color: 'blue',
        });
      }
      const path = await library.createTutorial(current.site, theme, createGuide(title));
      closeForm();
      emit('open', path, 'record');
      return;
    } else if (current.kind === 'rename') {
      const title = current.title.trim();
      if (!title) return void (formError.value = t('library.titleMissing'));
      const guide = await library.readTutorial(current.path);
      await library.writeTutorial(current.path, {
        ...guide,
        title,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await library.remove(current.path);
      notify(t('library.movedToBin', { name: current.what, bin: bin() }));
    }
    closeForm();
    await refresh();
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : String(cause);
  }
}

// Actions on tutorials.

async function duplicate(tutorial: TutorialEntry): Promise<void> {
  try {
    await library.duplicate(tutorial.path);
    await refresh();
    notify(t('library.duplicated'));
  } catch (cause) {
    warn(cause, t('library.duplicateFailed'));
  }
}

async function move(tutorial: TutorialEntry, target: SiteEntry, theme: ThemeEntry): Promise<void> {
  try {
    await library.moveTutorial(tutorial.path, target.id, theme.id);
    await refresh();
    notify(t('library.moved', { theme: theme.name }));
  } catch (cause) {
    warn(cause, t('library.moveFailed'));
  }
}

async function publish(tutorial: TutorialEntry): Promise<void> {
  try {
    await library.publish(tutorial.path);
    await refresh();
    notify(t('library.publishedToast', { title: tutorial.title }));
  } catch (cause) {
    warn(cause, t('library.publishFailed'));
  }
}

function scrollToTheme(id: string): void {
  gallery.value
    ?.querySelector(`[data-theme="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectSite(id: string): void {
  search.value = '';
  emit('select-site', id);
  gallery.value?.scrollTo({ top: 0 });
}

// Menus: the same entries for a right click and for the More button of each thing.

function siteEntries(entry: SiteEntry): MenuEntry[] {
  return [
    { label: t('library.newTutorial'), icon: 'plus', run: () => newTutorial(entry) },
    { label: t('library.newTheme'), icon: 'room', run: () => newTheme(entry) },
    { separator: true },
    { label: t('library.editSite'), icon: 'edit', run: () => editSite(entry) },
    { label: revealLabel(), icon: 'folder', run: () => reveal(entry.id) },
    { separator: true },
    {
      label: t('library.deleteSite'),
      icon: 'trash',
      danger: true,
      run: () =>
        void openForm({
          kind: 'delete',
          path: entry.id,
          what: entry.name,
          detail: goesWith(tutorialCount(entry)),
        }),
    },
  ];
}

function themeEntries(entry: SiteEntry, theme: ThemeEntry): MenuEntry[] {
  return [
    { label: t('library.newTutorialHere'), icon: 'plus', run: () => newTutorial(entry, theme) },
    { label: t('library.renameTheme'), icon: 'edit', run: () => editTheme(entry, theme) },
    { label: revealLabel(), icon: 'folder', run: () => reveal(`${entry.id}/${theme.id}`) },
    { separator: true },
    {
      label: t('library.deleteTheme'),
      icon: 'trash',
      danger: true,
      run: () =>
        void openForm({
          kind: 'delete',
          path: `${entry.id}/${theme.id}`,
          what: theme.name,
          detail: goesWith(theme.tutorials.length),
        }),
    },
  ];
}

function tutorialEntries(entry: SiteEntry, tutorial: TutorialEntry): MenuEntry[] {
  const moves: MenuEntry[] = sites.value.flatMap((target) => {
    const themes = target.themes.filter(
      (candidate) => !tutorial.path.startsWith(`${target.id}/${candidate.id}/`),
    );
    if (!themes.length) return [];
    return [
      {
        heading:
          target.id === entry.id
            ? t('library.moveToTheme')
            : t('library.moveToSite', { site: target.name }),
      },
      ...themes.map((theme) => ({
        label: theme.name,
        icon: 'move' as const,
        run: () => void move(tutorial, target, theme),
      })),
    ];
  });
  return [
    { label: t('common.open'), icon: 'edit', run: () => emit('open', tutorial.path, 'edit') },
    {
      label: t('library.recordMore'),
      icon: 'record',
      disabled: !canRecord,
      run: () => emit('open', tutorial.path, 'record'),
    },
    ...(entry.publishTo
      ? [
          {
            label: t('library.publish'),
            icon: 'publish' as const,
            run: () => void publish(tutorial),
          },
        ]
      : []),
    {
      label: t('common.rename'),
      icon: 'text',
      run: () => void openForm({ kind: 'rename', path: tutorial.path, title: tutorial.title }),
    },
    { label: t('library.duplicate'), icon: 'copy', run: () => void duplicate(tutorial) },
    { separator: true },
    ...moves,
    { separator: true },
    { label: revealLabel(), icon: 'folder', run: () => reveal(tutorial.path) },
    {
      label: t('common.delete'),
      icon: 'trash',
      danger: true,
      run: () =>
        void openForm({
          kind: 'delete',
          path: tutorial.path,
          what: tutorial.title,
          detail: t('library.screenshotsGo'),
        }),
    },
  ];
}

/** The empty part of the gallery: what to add to the open site. */
function galleryEntries(): MenuEntry[] {
  const entry = site.value;
  if (!entry) return [{ label: t('library.newSite'), icon: 'plus', run: newSite }];
  return [
    { label: t('library.newTutorial'), icon: 'plus', run: () => newTutorial(entry) },
    { label: t('library.newTheme'), icon: 'room', run: () => newTheme(entry) },
    { separator: true },
    { label: t('library.editSite'), icon: 'edit', run: () => editSite(entry) },
    { label: revealLabel(), icon: 'folder', run: () => reveal(entry.id) },
  ];
}

/** The empty part of the sites panel. */
function panelEntries(): MenuEntry[] {
  return [
    { label: t('library.newSite'), icon: 'plus', run: newSite },
    { label: t('library.showFolder'), icon: 'folder', run: () => reveal(root.value, true) },
  ];
}

/** A right click on a site opens it too, as a file manager selects what it shows a menu for. */
function onSiteMenu(event: MouseEvent, entry: SiteEntry): void {
  if (entry.id !== site.value?.id) selectSite(entry.id);
  contextMenu(event, siteEntries(entry), t('menu.ofSite', { name: entry.name }));
}
</script>

<template>
  <div class="library">
    <aside class="plan" :aria-label="t('common.library')">
      <header class="plan-head">
        <Logo :size="26" />
        <span class="plan-name">Interactive Learning</span>
      </header>

      <nav
        class="plan-sites"
        :aria-label="t('library.sites')"
        @contextmenu="contextMenu($event, panelEntries(), t('menu.ofLibrary'))"
      >
        <h2 class="plan-title">{{ t('library.sites') }}</h2>
        <p v-if="loaded && !sites.length" class="plan-empty">{{ t('library.noSite') }}</p>
        <div
          v-for="entry in sites"
          :key="entry.id"
          class="site-row"
          :class="{ current: entry.id === site?.id }"
        >
          <button
            type="button"
            class="site-button"
            :aria-current="entry.id === site?.id ? 'page' : undefined"
            @click="selectSite(entry.id)"
            @contextmenu="onSiteMenu($event, entry)"
          >
            <span class="monogram" aria-hidden="true">{{
              entry.name.charAt(0).toUpperCase()
            }}</span>
            <span class="site-name">{{ entry.name }}</span>
            <span class="count tabular">{{ tutorialCount(entry) }}</span>
          </button>
          <ul v-if="entry.id === site?.id" class="plan-rooms">
            <li v-for="theme in entry.themes" :key="theme.id">
              <button
                type="button"
                class="room-link"
                :data-label="theme.color"
                @click="scrollToTheme(theme.id)"
                @contextmenu="
                  contextMenu(
                    $event,
                    themeEntries(entry, theme),
                    t('menu.ofTheme', { name: theme.name }),
                  )
                "
              >
                <span class="label-dot" aria-hidden="true"></span>
                <span class="room-name">{{ theme.name }}</span>
                <span class="count tabular">{{ theme.tutorials.length }}</span>
              </button>
            </li>
            <li>
              <button type="button" class="room-link add" @click="newTheme(entry)">
                <Icon name="plus" :size="14" />
                <span>{{ t('library.newTheme') }}</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <footer class="plan-foot">
        <button type="button" class="button quiet plan-add" @click="newSite">
          <Icon name="plus" />
          {{ t('library.newSite') }}
        </button>
        <button type="button" class="folder-link" :title="root" @click="reveal(root, true)">
          <Icon name="folder" :size="15" />
          <span>{{ t('library.folder') }}</span>
        </button>
      </footer>
      <div class="plan-bottom">
        <span
          v-if="presence"
          class="agent-badge plan-agent"
          role="status"
          :title="t('common.agentDriving', { agent: presence.agent })"
        >
          <Icon name="spark" :size="13" />{{ t('common.agentWorking', { agent: presence.agent }) }}
        </span>
        <button
          type="button"
          class="button quiet plan-add plan-settings"
          :title="t('library.settingsTitle')"
          @click="emit('settings')"
        >
          <Icon name="settings" />
          {{ t('common.settings') }}
          <span
            v-if="update.phase === 'available'"
            class="badge-dot"
            :aria-label="t('common.newVersion')"
          ></span>
        </button>
      </div>
    </aside>

    <main
      ref="gallery"
      class="gallery"
      @contextmenu="contextMenu($event, galleryEntries(), t('menu.ofLibrary'))"
    >
      <section v-if="loaded && !sites.length" class="welcome">
        <Logo :size="56" />
        <h1>{{ t('library.welcomeTitle') }}</h1>
        <p>{{ t('library.welcomeBody') }}</p>
        <button type="button" class="button primary large" @click="newSite">
          <Icon name="plus" />
          {{ t('library.addSite') }}
        </button>
        <p class="hint">
          {{ t('library.savedIn', { folder: root || t('library.documentsFolder') }) }}
        </p>
      </section>

      <template v-else-if="site">
        <header
          class="gallery-head"
          @contextmenu="
            contextMenu($event, siteEntries(site), t('menu.ofSite', { name: site.name }))
          "
        >
          <div class="site-heading">
            <h1>{{ site.name }}</h1>
            <p class="site-meta">
              <span v-if="site.address" class="site-address"
                ><Icon name="globe" :size="15" />{{ site.address }}</span
              >
              <span v-if="site.publishTo" class="publish-target" :title="site.publishTo">
                <Icon name="link" :size="15" />{{
                  t('library.publishesTo', { folder: shortPath(site.publishTo) })
                }}
              </span>
              <button v-else type="button" class="link-button" @click="editSite(site)">
                <Icon name="link" :size="15" />{{ t('library.linkFolder') }}
              </button>
            </p>
          </div>
          <div class="head-actions">
            <label class="search">
              <Icon name="search" :size="16" />
              <span class="visually-hidden">{{ t('library.search') }}</span>
              <input v-model="search" type="search" :placeholder="t('library.search')" />
            </label>
            <button type="button" class="button" @click="newTheme(site)">
              <Icon name="room" />
              {{ t('library.newTheme') }}
            </button>
            <button type="button" class="button primary" @click="newTutorial(site)">
              <Icon name="plus" />
              {{ t('library.newTutorial') }}
            </button>
            <button
              type="button"
              class="button icon quiet"
              :title="t('library.siteOptions')"
              aria-haspopup="menu"
              @click="buttonMenu($event, siteEntries(site), t('menu.ofSite', { name: site.name }))"
            >
              <Icon name="more" />
            </button>
          </div>
        </header>

        <p v-if="nothingFound" class="no-result">{{ t('library.noMatch', { search }) }}</p>

        <section
          v-for="room in rooms"
          v-show="!search.trim() || room.shown.length"
          :key="room.id"
          class="room"
          :data-label="room.color"
          :data-theme="room.id"
          :aria-label="room.name"
        >
          <header
            class="room-head"
            @contextmenu="
              contextMenu($event, themeEntries(site, room), t('menu.ofTheme', { name: room.name }))
            "
          >
            <span class="label-dot" aria-hidden="true"></span>
            <h2>{{ room.name }}</h2>
            <span class="room-facts tabular">
              {{ t('common.tutorials', { count: room.tutorials.length }) }}
              <template v-if="room.tutorials.length">· {{ themeRuntime(room) }}</template>
            </span>
            <button
              type="button"
              class="button icon small quiet"
              :title="t('library.optionsOf', { name: room.name })"
              aria-haspopup="menu"
              @click="
                buttonMenu($event, themeEntries(site, room), t('menu.ofTheme', { name: room.name }))
              "
            >
              <Icon name="more" />
            </button>
          </header>

          <div class="works">
            <article
              v-for="tutorial in room.shown"
              :key="tutorial.path"
              class="work"
              tabindex="0"
              :aria-label="tutorial.title"
              @dblclick="emit('open', tutorial.path, 'edit')"
              @keydown.enter="emit('open', tutorial.path, 'edit')"
              @contextmenu="
                contextMenu(
                  $event,
                  tutorialEntries(site, tutorial),
                  t('menu.ofTutorial', { name: tutorial.title }),
                )
              "
            >
              <button type="button" class="work-frame" @click="emit('open', tutorial.path, 'edit')">
                <img
                  v-if="tutorial.cover"
                  :src="tutorialUrl(tutorial.path, tutorial.cover)"
                  :style="coverStyle(tutorial)"
                  alt=""
                  loading="lazy"
                />
                <span v-else class="work-empty"
                  ><Icon name="record" :size="16" />{{ t('library.notRecorded') }}</span
                >
                <span class="visually-hidden">{{
                  t('library.openTutorial', { title: tutorial.title })
                }}</span>
              </button>
              <div class="work-label">
                <h3>{{ tutorial.title || t('common.untitledTutorial') }}</h3>
                <p class="work-facts tabular">
                  {{ t('common.steps', { count: tutorial.steps }) }} ·
                  {{ timecode(tutorial.durationMs) }}
                  <span
                    v-if="tutorial.agent"
                    class="work-agent"
                    :title="t('library.madeBy', { agent: tutorial.agent })"
                    ><Icon name="spark" :size="12" />{{ tutorial.agent }}</span
                  >
                </p>
                <p class="work-status" :data-tone="status(tutorial).tone">
                  <span class="dot" aria-hidden="true"></span>{{ status(tutorial).label }}
                  <span class="when">· {{ since(tutorial.updatedAt) }}</span>
                </p>
              </div>
              <button
                type="button"
                class="button icon small quiet work-more"
                :title="t('library.optionsOf', { name: tutorial.title })"
                aria-haspopup="menu"
                @click="
                  buttonMenu(
                    $event,
                    tutorialEntries(site, tutorial),
                    t('menu.ofTutorial', { name: tutorial.title }),
                  )
                "
              >
                <Icon name="more" />
              </button>
            </article>

            <button
              v-if="!search.trim()"
              type="button"
              class="work add"
              @click="newTutorial(site, room)"
              @contextmenu="
                contextMenu(
                  $event,
                  themeEntries(site, room),
                  t('menu.ofTheme', { name: room.name }),
                )
              "
            >
              <Icon name="plus" :size="20" />
              <span>{{ t('library.newTutorialIn', { theme: room.name }) }}</span>
            </button>
          </div>
        </section>
      </template>
    </main>

    <dialog ref="dialog" class="dialog" @close="form = null">
      <form v-if="form" method="dialog" @submit.prevent="submit">
        <template v-if="form.kind === 'site'">
          <h2>{{ form.id ? t('library.editSiteTitle') : t('library.newSiteTitle') }}</h2>
          <label class="field">
            <span>{{ t('common.name') }}</span>
            <input
              v-model="form.name"
              class="input"
              :placeholder="t('library.siteNamePlaceholder')"
              required
            />
          </label>
          <label class="field">
            <span>{{ t('library.address') }}</span>
            <input v-model="form.address" class="input" placeholder="https://app.example.com" />
            <small class="hint">{{ t('library.addressHint') }}</small>
          </label>
          <div class="field">
            <span>{{ t('library.publishToLabel') }}</span>
            <div class="folder-pick">
              <span class="folder-value" :title="form.publishTo ?? ''">
                {{ form.publishTo ? shortPath(form.publishTo) : t('library.notLinked') }}
              </span>
              <button type="button" class="button small" @click="chooseFolder">
                {{ t('library.chooseFolder') }}
              </button>
              <button
                v-if="form.publishTo"
                type="button"
                class="button small quiet"
                @click="form.publishTo = null"
              >
                {{ t('library.unlink') }}
              </button>
            </div>
            <small class="hint">{{ t('library.publishHint') }}</small>
          </div>
        </template>

        <template v-else-if="form.kind === 'theme'">
          <h2>{{ form.id ? t('library.editThemeTitle') : t('library.newThemeTitle') }}</h2>
          <label class="field">
            <span>{{ t('common.name') }}</span>
            <input
              v-model="form.name"
              class="input"
              :placeholder="t('library.themeNamePlaceholder')"
              required
            />
          </label>
          <div class="field">
            <span id="theme-color">{{ t('library.labelColor') }}</span>
            <div class="chips" role="radiogroup" aria-labelledby="theme-color">
              <button
                v-for="color in THEME_COLORS"
                :key="color"
                type="button"
                class="chip"
                role="radio"
                :data-label="color"
                :aria-checked="form.color === color"
                :aria-label="t(`color.${color}`)"
                :title="t(`color.${color}`)"
                @click="form.color = color"
              ></button>
            </div>
          </div>
        </template>

        <template v-else-if="form.kind === 'tutorial'">
          <h2>{{ t('library.newTutorialTitle') }}</h2>
          <label class="field">
            <span>{{ t('common.title') }}</span>
            <input
              v-model="form.title"
              class="input"
              :placeholder="t('library.tutorialPlaceholder')"
            />
          </label>
          <label class="field">
            <span>{{ t('library.theme') }}</span>
            <select v-model="form.theme" class="select">
              <option v-for="theme in formThemes" :key="theme.id" :value="theme.id">
                {{ theme.name }}
              </option>
            </select>
          </label>
          <small class="hint">{{ t('library.tutorialHint') }}</small>
        </template>

        <template v-else-if="form.kind === 'rename'">
          <h2>{{ t('library.renameTutorialTitle') }}</h2>
          <label class="field">
            <span>{{ t('common.title') }}</span>
            <input v-model="form.title" class="input" required />
          </label>
        </template>

        <template v-else>
          <h2>{{ t('library.deleteTitle', { name: form.what }) }}</h2>
          <p>{{ t('library.deleteBody', { detail: form.detail, bin: bin() }) }}</p>
        </template>

        <p v-if="formError" class="error-text" role="alert">{{ formError }}</p>
        <footer>
          <button type="button" class="button" @click="closeForm">{{ t('common.cancel') }}</button>
          <button v-if="form.kind === 'delete'" type="submit" class="button danger">
            {{ t('library.moveToBin', { bin: bin() }) }}
          </button>
          <button v-else-if="form.kind === 'tutorial'" type="submit" class="button primary">
            <template v-if="canRecord"
              ><Icon name="record" />{{ t('library.createAndRecord') }}</template
            >
            <template v-else>{{ t('common.create') }}</template>
          </button>
          <button v-else type="submit" class="button primary">
            {{
              'id' in form && form.id
                ? t('common.save')
                : form.kind === 'rename'
                  ? t('common.rename')
                  : t('common.create')
            }}
          </button>
        </footer>
      </form>
    </dialog>
  </div>
</template>
