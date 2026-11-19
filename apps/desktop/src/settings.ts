import { reactive, shallowRef } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  formatMegabytes,
  matchLocale,
  resolveLocale,
  setLocale,
  t,
  type LanguageChoice,
} from './i18n';

/** What the creator chose in Settings, kept by the studio in its own folder. */
export interface Settings {
  checkUpdates: boolean;
  agents: boolean;
  /** The library folder, when it is not the default one. */
  library: string | null;
  language: LanguageChoice;
}

/** How this copy of the studio installs a new version. */
export type Install = 'installer' | 'appImage' | 'package' | 'source' | 'manual';

export interface AppInfo {
  version: string;
  exe: string;
  install: Install;
  library: string;
  defaultLibrary: string;
  home: string;
  releases: string;
}

export interface Release {
  version: string;
  name: string;
  notes: string[];
  publishedAt: string;
  page: string;
  asset: { name: string; url: string; size: number; sha256: string | null } | null;
}

export interface UpdateCheck {
  current: string;
  latest: Release | null;
  available: boolean;
  install: Install;
  releases: string;
}

export type SettingsTab = 'general' | 'updates' | 'mcp' | 'library' | 'shortcuts';

export const settings = shallowRef<Settings | null>(null);
export const info = shallowRef<AppInfo | null>(null);
/** The language of the computer, such as `fr-FR`, which `auto` follows. */
export const systemLocale = shallowRef('en');

/**
 * Speaks the chosen language from the first screen on: the one of Settings, or the language of
 * the computer as the system gives it, or as the webview reports it when the system says nothing.
 */
export async function startLanguage(): Promise<void> {
  try {
    const [stored, system] = await Promise.all([
      loadSettings(),
      invoke<string>('system_locale').catch(() => navigator.language),
    ]);
    systemLocale.value = system;
    setLocale(resolveLocale(stored.language, system));
  } catch {
    systemLocale.value = navigator.language;
    setLocale(matchLocale(navigator.language));
  }
}

/** Changes the language at once, and keeps the choice for the next starts. */
export async function chooseLanguage(choice: LanguageChoice): Promise<void> {
  setLocale(resolveLocale(choice, systemLocale.value));
  await saveSettings({ language: choice });
}

export async function loadSettings(): Promise<Settings> {
  settings.value = await invoke<Settings>('settings_read');
  return settings.value;
}

export async function saveSettings(change: Partial<Settings>): Promise<void> {
  const current = settings.value ?? (await loadSettings());
  settings.value = await invoke<Settings>('settings_write', {
    settings: { ...current, ...change },
  });
}

export async function loadInfo(): Promise<AppInfo> {
  info.value = await invoke<AppInfo>('app_info');
  return info.value;
}

export type UpdatePhase =
  'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'installing' | 'failed';

/** Where the update stands, shared by the Settings button and the Updates tab. */
export const update = reactive({
  phase: 'idle' as UpdatePhase,
  check: null as UpdateCheck | null,
  error: '',
  done: 0,
  total: 0,
  checkedAt: null as string | null,
  /** How the downloaded version installs: `installer`, `appimage` or `package`. */
  installedBy: '',
});

function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return typeof cause === 'string' && cause ? cause : t('common.failed');
}

export const busyUpdating = () =>
  update.phase === 'checking' || update.phase === 'downloading' || update.phase === 'installing';

export async function checkForUpdates(): Promise<void> {
  if (busyUpdating()) return;
  update.phase = 'checking';
  update.error = '';
  try {
    const check = await invoke<UpdateCheck>('update_check');
    update.check = check;
    update.checkedAt = new Date().toISOString();
    update.phase = check.available ? 'available' : 'current';
  } catch (cause) {
    update.phase = 'failed';
    update.error = messageOf(cause);
  }
}

/**
 * Downloads the new version, checks it, and installs it. On Windows and with an AppImage the
 * studio closes and opens again on the new version; a package opens in the system installer.
 */
export async function installUpdate(): Promise<void> {
  if (busyUpdating() || !update.check?.available) return;
  update.phase = 'downloading';
  update.error = '';
  update.done = 0;
  update.total = update.check.latest?.asset?.size ?? 0;
  const stop = await listen<{ done: number; total: number }>('update-progress', ({ payload }) => {
    update.done = payload.done;
    update.total = payload.total;
  });
  try {
    await invoke<string>('update_download');
    update.phase = 'installing';
    update.installedBy = await invoke<string>('update_install');
  } catch (cause) {
    update.phase = 'failed';
    update.error = messageOf(cause);
  } finally {
    stop();
  }
}

/** `2.1 MB` or `2,1 Mo`, the size of a download. */
export function megabytes(bytes: number): string {
  return formatMegabytes(bytes);
}
