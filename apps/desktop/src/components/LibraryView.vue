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
  tutorialUrl,
  type SiteEntry,
  type ThemeColor,
  type ThemeEntry,
  type TutorialEntry,
} from '../library';
import { bin, canRecord, revealLabel } from '../platform';
import { notify, since, warn } from '../ui';

const props = defineProps<{ selectedSite: string | null }>();
const emit = defineEmits<{
  open: [path: string, mode: 'record' | 'edit'];
  'select-site': [id: string];
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
    warn(cause, 'The library could not be read.');
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
  if (!tutorial.publishedAt) return { label: 'Draft', tone: 'draft' };
  return tutorial.publishedAt >= tutorial.updatedAt
    ? { label: 'Published', tone: 'done' }
    : { label: 'Changed since publishing', tone: 'changed' };
}

/** The part of the first screenshot its step shows, as a cover. */
function coverStyle(tutorial: TutorialEntry): Record<string, string> {
  const view = tutorial.coverViewport;
  const top = view && view.height < 1 ? (view.y / (1 - view.height)) * 100 : 0;
  return { objectPosition: `0 ${Math.min(100, Math.max(0, top))}%` };
}

/** An id for a menu, from a library path that may hold spaces. */
function menuId(prefix: string, path: string): string {
  return `${prefix}-${path.replace(/[^\w-]/g, '_')}`;
}

function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 3 ? `…\\${parts.slice(-3).join('\\')}` : path;
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
  const folder = await pickFolder({
    directory: true,
    title: 'Where this site publishes its tutorials',
  });
  if (typeof folder === 'string') form.value.publishTo = folder;
}

async function submit(): Promise<void> {
  const current = form.value;
  if (!current) return;
  formError.value = '';
  try {
    if (current.kind === 'site') {
      if (!current.name.trim()) return void (formError.value = 'Give the site a name.');
      const id = await library.saveSite({
        ...(current.id ? { id: current.id } : {}),
        name: current.name,
        address: current.address,
        publishTo: current.publishTo,
      });
      // A new site starts with one theme, so a first tutorial has a place to go.
      if (!current.id) await library.saveTheme(id, { name: 'General', color: 'blue' });
      emit('select-site', id);
    } else if (current.kind === 'theme') {
      if (!current.name.trim()) return void (formError.value = 'Give the theme a name.');
      await library.saveTheme(current.site, {
        ...(current.id ? { id: current.id } : {}),
        name: current.name,
        color: current.color,
      });
    } else if (current.kind === 'tutorial') {
      const title = current.title.trim() || 'Untitled tutorial';
      let theme = current.theme;
      if (!theme) theme = await library.saveTheme(current.site, { name: 'General', color: 'blue' });
      const path = await library.createTutorial(current.site, theme, createGuide(title));
      closeForm();
      emit('open', path, 'record');
      return;
    } else if (current.kind === 'rename') {
      const title = current.title.trim();
      if (!title) return void (formError.value = 'Give the tutorial a title.');
      const guide = await library.readTutorial(current.path);
      await library.writeTutorial(current.path, {
        ...guide,
        title,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await library.remove(current.path);
      notify(`${current.what} moved to the ${bin}`);
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
    notify('Tutorial duplicated');
  } catch (cause) {
    warn(cause, 'The tutorial could not be duplicated.');
  }
}

async function move(tutorial: TutorialEntry, target: SiteEntry, theme: ThemeEntry): Promise<void> {
  try {
    await library.moveTutorial(tutorial.path, target.id, theme.id);
    await refresh();
    notify(`Moved to ${theme.name}`);
  } catch (cause) {
    warn(cause, 'The tutorial could not be moved.');
  }
}

async function publish(tutorial: TutorialEntry): Promise<void> {
  try {
    await library.publish(tutorial.path);
    await refresh();
    notify(`“${tutorial.title}” published`);
  } catch (cause) {
    warn(cause, 'The tutorial could not be published.');
  }
}

function hideMenus(): void {
  for (const menu of document.querySelectorAll<HTMLElement>('.menu:popover-open')) {
    menu.hidePopover();
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
</script>

<template>
  <div class="library">
    <aside class="plan" aria-label="Library">
      <header class="plan-head">
        <Logo :size="26" />
        <span class="plan-name">Interactive Learning</span>
      </header>

      <nav class="plan-sites" aria-label="Sites">
        <h2 class="plan-title">Sites</h2>
        <p v-if="loaded && !sites.length" class="plan-empty">No site yet.</p>
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
              >
                <span class="label-dot" aria-hidden="true"></span>
                <span class="room-name">{{ theme.name }}</span>
                <span class="count tabular">{{ theme.tutorials.length }}</span>
              </button>
            </li>
            <li>
              <button type="button" class="room-link add" @click="newTheme(entry)">
                <Icon name="plus" :size="14" />
                <span>New theme</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <footer class="plan-foot">
        <button type="button" class="button quiet plan-add" @click="newSite">
          <Icon name="plus" />
          New site
        </button>
        <button
          type="button"
          class="folder-link"
          :title="root"
          @click="
            library
              .reveal(root, true)
              .catch((cause) => warn(cause, 'The folder could not be shown.'))
          "
        >
          <Icon name="folder" :size="15" />
          <span>Library folder</span>
        </button>
      </footer>
    </aside>

    <main ref="gallery" class="gallery">
      <section v-if="loaded && !sites.length" class="welcome">
        <Logo :size="56" />
        <h1>Your tutorials start with a site</h1>
        <p>
          A site is the web application you document. Its tutorials are grouped by theme, and each
          tutorial is a tour of numbered steps recorded in the browser built into the studio.
        </p>
        <button type="button" class="button primary large" @click="newSite">
          <Icon name="plus" />
          Add a site
        </button>
        <p class="hint">Everything is saved in {{ root || 'your Documents folder' }}.</p>
      </section>

      <template v-else-if="site">
        <header class="gallery-head">
          <div class="site-heading">
            <h1>{{ site.name }}</h1>
            <p class="site-meta">
              <span v-if="site.address" class="site-address"
                ><Icon name="globe" :size="15" />{{ site.address }}</span
              >
              <span v-if="site.publishTo" class="publish-target" :title="site.publishTo">
                <Icon name="link" :size="15" />Publishes to {{ shortPath(site.publishTo) }}
              </span>
              <button v-else type="button" class="link-button" @click="editSite(site)">
                <Icon name="link" :size="15" />Link a project folder to publish
              </button>
            </p>
          </div>
          <div class="head-actions">
            <label class="search">
              <Icon name="search" :size="16" />
              <span class="visually-hidden">Search tutorials</span>
              <input v-model="search" type="search" placeholder="Search tutorials" />
            </label>
            <button type="button" class="button" @click="newTheme(site)">
              <Icon name="room" />
              New theme
            </button>
            <button type="button" class="button primary" @click="newTutorial(site)">
              <Icon name="plus" />
              New tutorial
            </button>
            <button
              type="button"
              class="button icon quiet"
              title="Site options"
              popovertarget="site-menu"
            >
              <Icon name="more" />
            </button>
            <div id="site-menu" popover class="menu" @click="hideMenus">
              <button type="button" @click="editSite(site)"><Icon name="edit" />Edit site</button>
              <button type="button" @click="library.reveal(site.id)">
                <Icon name="folder" />{{ revealLabel }}
              </button>
              <hr />
              <button
                type="button"
                class="danger-item"
                @click="
                  openForm({
                    kind: 'delete',
                    path: site.id,
                    what: site.name,
                    detail: `Its ${tutorialCount(site)} tutorials go with it.`,
                  })
                "
              >
                <Icon name="trash" />Delete site
              </button>
            </div>
          </div>
        </header>

        <p v-if="nothingFound" class="no-result">No tutorial matches “{{ search }}”.</p>

        <section
          v-for="room in rooms"
          v-show="!search.trim() || room.shown.length"
          :key="room.id"
          class="room"
          :data-label="room.color"
          :data-theme="room.id"
          :aria-label="room.name"
        >
          <header class="room-head">
            <span class="label-dot" aria-hidden="true"></span>
            <h2>{{ room.name }}</h2>
            <span class="room-facts tabular">
              {{
                room.tutorials.length === 1 ? '1 tutorial' : `${room.tutorials.length} tutorials`
              }}
              <template v-if="room.tutorials.length">· {{ themeRuntime(room) }}</template>
            </span>
            <button
              type="button"
              class="button icon small quiet"
              :title="`Options of ${room.name}`"
              :popovertarget="menuId('room', room.id)"
            >
              <Icon name="more" />
            </button>
            <div :id="menuId('room', room.id)" popover class="menu" @click="hideMenus">
              <button type="button" @click="newTutorial(site, room)">
                <Icon name="plus" />New tutorial here
              </button>
              <button type="button" @click="editTheme(site, room)">
                <Icon name="edit" />Rename or recolor
              </button>
              <hr />
              <button
                type="button"
                class="danger-item"
                @click="
                  openForm({
                    kind: 'delete',
                    path: `${site.id}/${room.id}`,
                    what: room.name,
                    detail: `Its ${room.tutorials.length} tutorials go with it.`,
                  })
                "
              >
                <Icon name="trash" />Delete theme
              </button>
            </div>
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
                  ><Icon name="record" :size="16" />Not recorded yet</span
                >
                <span class="visually-hidden">Open {{ tutorial.title }}</span>
              </button>
              <div class="work-label">
                <h3>{{ tutorial.title || 'Untitled tutorial' }}</h3>
                <p class="work-facts tabular">
                  {{ tutorial.steps === 1 ? '1 step' : `${tutorial.steps} steps` }} ·
                  {{ timecode(tutorial.durationMs) }}
                </p>
                <p class="work-status" :data-tone="status(tutorial).tone">
                  <span class="dot" aria-hidden="true"></span>{{ status(tutorial).label }}
                  <span class="when">· {{ since(tutorial.updatedAt) }}</span>
                </p>
              </div>
              <button
                type="button"
                class="button icon small quiet work-more"
                :title="`Options of ${tutorial.title}`"
                :popovertarget="menuId('work', tutorial.path)"
              >
                <Icon name="more" />
              </button>
              <div :id="menuId('work', tutorial.path)" popover class="menu" @click="hideMenus">
                <button type="button" @click="emit('open', tutorial.path, 'edit')">
                  <Icon name="edit" />Open
                </button>
                <button type="button" @click="emit('open', tutorial.path, 'record')">
                  <Icon name="record" />Record more steps
                </button>
                <button v-if="site.publishTo" type="button" @click="publish(tutorial)">
                  <Icon name="publish" />Publish
                </button>
                <button
                  type="button"
                  @click="openForm({ kind: 'rename', path: tutorial.path, title: tutorial.title })"
                >
                  <Icon name="text" />Rename
                </button>
                <button type="button" @click="duplicate(tutorial)">
                  <Icon name="copy" />Duplicate
                </button>
                <template v-for="target in sites" :key="target.id">
                  <span class="menu-label"
                    >Move to {{ target.id === site.id ? 'theme' : target.name }}</span
                  >
                  <button
                    v-for="theme in target.themes.filter(
                      (candidate) => !tutorial.path.startsWith(`${target.id}/${candidate.id}/`),
                    )"
                    :key="theme.id"
                    type="button"
                    @click="move(tutorial, target, theme)"
                  >
                    <Icon name="move" />{{ theme.name }}
                  </button>
                </template>
                <hr />
                <button type="button" @click="library.reveal(tutorial.path)">
                  <Icon name="folder" />{{ revealLabel }}
                </button>
                <button
                  type="button"
                  class="danger-item"
                  @click="
                    openForm({
                      kind: 'delete',
                      path: tutorial.path,
                      what: tutorial.title,
                      detail: 'Its screenshots go with it.',
                    })
                  "
                >
                  <Icon name="trash" />Delete
                </button>
              </div>
            </article>

            <button
              v-if="!search.trim()"
              type="button"
              class="work add"
              @click="newTutorial(site, room)"
            >
              <Icon name="plus" :size="20" />
              <span>New tutorial in {{ room.name }}</span>
            </button>
          </div>
        </section>
      </template>
    </main>

    <dialog ref="dialog" class="dialog" @close="form = null">
      <form v-if="form" method="dialog" @submit.prevent="submit">
        <template v-if="form.kind === 'site'">
          <h2>{{ form.id ? 'Edit site' : 'New site' }}</h2>
          <label class="field">
            <span>Name</span>
            <input v-model="form.name" class="input" placeholder="Customer portal" required />
          </label>
          <label class="field">
            <span>Address</span>
            <input v-model="form.address" class="input" placeholder="https://app.example.com" />
            <small class="hint">The browser of the studio opens it when you record.</small>
          </label>
          <div class="field">
            <span>Publish to</span>
            <div class="folder-pick">
              <span class="folder-value" :title="form.publishTo ?? ''">
                {{ form.publishTo ? shortPath(form.publishTo) : 'Not linked yet' }}
              </span>
              <button type="button" class="button small" @click="chooseFolder">
                Choose folder…
              </button>
              <button
                v-if="form.publishTo"
                type="button"
                class="button small quiet"
                @click="form.publishTo = null"
              >
                Unlink
              </button>
            </div>
            <small class="hint"
              >The folder of the web project that serves the tutorials, such as
              public/guides.</small
            >
          </div>
        </template>

        <template v-else-if="form.kind === 'theme'">
          <h2>{{ form.id ? 'Edit theme' : 'New theme' }}</h2>
          <label class="field">
            <span>Name</span>
            <input v-model="form.name" class="input" placeholder="Billing" required />
          </label>
          <div class="field">
            <span id="theme-color">Label color</span>
            <div class="chips" role="radiogroup" aria-labelledby="theme-color">
              <button
                v-for="color in THEME_COLORS"
                :key="color"
                type="button"
                class="chip"
                role="radio"
                :data-label="color"
                :aria-checked="form.color === color"
                :aria-label="color"
                @click="form.color = color"
              ></button>
            </div>
          </div>
        </template>

        <template v-else-if="form.kind === 'tutorial'">
          <h2>New tutorial</h2>
          <label class="field">
            <span>Title</span>
            <input v-model="form.title" class="input" placeholder="Download an invoice" />
          </label>
          <label class="field">
            <span>Theme</span>
            <select v-model="form.theme" class="select">
              <option v-for="theme in formThemes" :key="theme.id" :value="theme.id">
                {{ theme.name }}
              </option>
            </select>
          </label>
          <small class="hint">The studio opens the browser on the site, ready to record.</small>
        </template>

        <template v-else-if="form.kind === 'rename'">
          <h2>Rename tutorial</h2>
          <label class="field">
            <span>Title</span>
            <input v-model="form.title" class="input" required />
          </label>
        </template>

        <template v-else>
          <h2>Delete “{{ form.what }}”?</h2>
          <p>{{ form.detail }} It goes to the {{ bin }}, where you can restore it.</p>
        </template>

        <p v-if="formError" class="error-text" role="alert">{{ formError }}</p>
        <footer>
          <button type="button" class="button" @click="closeForm">Cancel</button>
          <button v-if="form.kind === 'delete'" type="submit" class="button danger">
            Move to {{ bin }}
          </button>
          <button v-else-if="form.kind === 'tutorial'" type="submit" class="button primary">
            <template v-if="canRecord"><Icon name="record" />Create and record</template>
            <template v-else>Create</template>
          </button>
          <button v-else type="submit" class="button primary">
            {{ 'id' in form && form.id ? 'Save' : form.kind === 'rename' ? 'Rename' : 'Create' }}
          </button>
        </footer>
      </form>
    </dialog>
  </div>
</template>
