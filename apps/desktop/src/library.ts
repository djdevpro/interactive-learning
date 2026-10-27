import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {
  validateGuide,
  type GuideDocument,
  type GuideViewport,
} from '@interactive-learning/protocol';

/** A tutorial as the library lists it, read from its folder. */
export interface TutorialEntry {
  /** `site/theme/tutorial`, its place in the library. */
  path: string;
  title: string;
  steps: number;
  durationMs: number;
  updatedAt: string;
  publishedAt: string | null;
  /** First screenshot, relative to the tutorial folder, and the part its first step shows. */
  cover: string | null;
  coverViewport: GuideViewport | null;
}

export interface ThemeEntry {
  id: string;
  name: string;
  color: ThemeColor;
  position: number;
  tutorials: TutorialEntry[];
}

export interface SiteEntry {
  id: string;
  name: string;
  address: string;
  /** Folder of the web project where tutorials are published, when the site has one. */
  publishTo: string | null;
  themes: ThemeEntry[];
}

/** Each theme gets a label color, as clips do in a video editor. */
export const THEME_COLORS = [
  'blue',
  'teal',
  'green',
  'yellow',
  'orange',
  'pink',
  'purple',
  'slate',
] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

// Each part of a path is encoded on its own: a guide resolves its images against its folder.
const LIBRARY_ORIGIN = convertFileSrc('', 'library');

/** Address of a file of the library for the studio view, such as a screenshot or a guide. */
export function libraryUrl(path: string): string {
  return LIBRARY_ORIGIN + path.split('/').map(encodeURIComponent).join('/');
}

/** Address of a file inside a tutorial folder. */
export function tutorialUrl(tutorial: string, file: string): string {
  return libraryUrl(`${tutorial}/${file}`);
}

export const library = {
  root: () => invoke<string>('library_root'),
  scan: () => invoke<SiteEntry[]>('library_scan'),
  remove: (path: string) => invoke<void>('library_delete', { path }),
  reveal: (path: string, absolute = false) => invoke<void>('library_reveal', { path, absolute }),

  saveSite: (site: { id?: string; name: string; address: string; publishTo: string | null }) =>
    invoke<string>('site_save', {
      id: site.id ?? null,
      name: site.name,
      address: site.address,
      publishTo: site.publishTo,
    }),

  saveTheme: (site: string, theme: { id?: string; name: string; color: ThemeColor }) =>
    invoke<string>('theme_save', {
      site,
      id: theme.id ?? null,
      name: theme.name,
      color: theme.color,
    }),

  createTutorial: (site: string, theme: string, guide: GuideDocument) =>
    invoke<string>('tutorial_create', {
      site,
      theme,
      title: guide.title,
      guide: serialize(guide),
    }),

  async readTutorial(path: string): Promise<GuideDocument> {
    return validateGuide(JSON.parse(await invoke<string>('tutorial_read', { path })));
  },

  writeTutorial: (path: string, guide: GuideDocument) =>
    invoke<void>('tutorial_write', { path, guide: serialize(guide) }),

  /** Writes one file in a tutorial folder, such as an imported screenshot. */
  writeFile: (path: string, name: string, data: Uint8Array) =>
    invoke<void>('tutorial_file', data, {
      headers: { 'x-tutorial': encodeURIComponent(path), 'x-name': encodeURIComponent(name) },
    }),

  moveTutorial: (path: string, site: string, theme: string) =>
    invoke<string>('tutorial_move', { path, site, theme }),

  /** A copy beside the tutorial, with its own identity and title. */
  async duplicate(path: string): Promise<string> {
    const copy = await invoke<string>('tutorial_duplicate', { path });
    const guide = await this.readTutorial(copy);
    await this.writeTutorial(copy, {
      ...guide,
      id: crypto.randomUUID(),
      title: `${guide.title} copy`,
      updatedAt: new Date().toISOString(),
    });
    return copy;
  },

  prune: (path: string, keep: string[] = []) => invoke<number>('tutorial_prune', { path, keep }),

  publish: (path: string) => invoke<string>('tutorial_publish', { path }),

  /** `guide.json` and its images in one ZIP archive, at `target`. */
  exportZip: (path: string, target: string) => invoke<void>('tutorial_export', { path, target }),
};

function serialize(guide: GuideDocument): string {
  return `${JSON.stringify(guide, null, 2)}\n`;
}

/** Where a tutorial sits: its site and theme folders, and its own. */
export function partsOf(path: string): { site: string; theme: string; tutorial: string } {
  const [site = '', theme = '', tutorial = ''] = path.split('/');
  return { site, theme, tutorial };
}

/** `0:07.5`, a moment of a tutorial in tenths of a second, as the transport shows it. */
export function timecode(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const seconds = Math.floor(tenths / 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.${tenths % 10}`;
}

/** `1:05`, the running time of a tutorial or a step, counted like the player counts it. */
export function runtime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
