import type {
  GuideAnnotation,
  GuideCursor,
  GuideTransition,
  GuideViewport,
} from '@interactive-learning/protocol';

export const CHANNEL = 'interactive-learning/recorder';
export const SESSION_KEY = 'interactive-learning:session';

export interface CaptureContext {
  url: string;
  title: string;
  documentToken: string;
  revision: number;
  viewport: { width: number; height: number };
  scroll: { x: number; y: number };
  dpr: number;
}

export interface Diagnostic {
  id: string;
  message: string;
  at: string;
}

export interface RecorderState {
  status: 'idle' | 'recording' | 'paused' | 'stopped';
  guideId?: string;
  title: string;
  tabId?: number;
  windowId?: number;
  /** Origin where the recording started. Pages of the same site are recorded too. */
  origin?: string;
  /**
   * Why a paused recording stopped. A click on the toolbar icon resumes it, except after `user`:
   * `site` when the tab left the site, `access` when Chrome withdrew the access to the tab.
   */
  pausedFor?: 'user' | 'site' | 'access';
  stepCount: number;
  imageBytes: number;
  lastCaptureAt: number;
  lastCapture?: { stepId: string; context: CaptureContext };
  diagnostics: Diagnostic[];
}

export type Command =
  | { channel: typeof CHANNEL; type: 'state' }
  | { channel: typeof CHANNEL; type: 'start'; title: string; tabId: number }
  | { channel: typeof CHANNEL; type: 'pause' | 'resume' | 'capture' | 'stop' | 'discard' }
  | { channel: typeof CHANNEL; type: 'retake' | 'delete-step'; stepId: string }
  | { channel: typeof CHANNEL; type: 'import'; guideId: string }
  | {
      channel: typeof CHANNEL;
      type: 'edit-step';
      stepId: string;
      title: string;
      description: string;
      cursor: GuideCursor | null;
      annotations: GuideAnnotation[];
      /** Address of the page of the step. Empty removes it, undefined keeps it. */
      url?: string;
      viewport?: GuideViewport | null;
      transition?: GuideTransition;
      durationMs?: number;
    }
  | {
      channel: typeof CHANNEL;
      type: 'observation';
      reason: string;
      context: CaptureContext;
      point?: { x: number; y: number };
    };

export type Reply = { ok: true; state: RecorderState } | { ok: false; error: string };

export function idleState(): RecorderState {
  return {
    status: 'idle',
    title: '',
    stepCount: 0,
    imageBytes: 0,
    lastCaptureAt: 0,
    diagnostics: [],
  };
}

// Second-level labels that form a public suffix with a country code, as in example.co.uk.
const SHARED_SECOND_LEVELS = new Set(['ac', 'co', 'com', 'edu', 'gov', 'net', 'org']);

/**
 * The site of an address: its registrable domain, so www.shop.test, app.shop.test and shop.test
 * belong together whatever the scheme, plus the port, so two local servers stay apart.
 */
export function siteOf(address: string): string {
  const url = new URL(address);
  const labels = url.hostname.split('.');
  let site = url.hostname;
  if (labels.length > 2 && !/^[\d.]+$/.test(url.hostname)) {
    const top = labels.at(-1) ?? '';
    const second = labels.at(-2) ?? '';
    site = labels.slice(top.length === 2 && SHARED_SECOND_LEVELS.has(second) ? -3 : -2).join('.');
  }
  return url.port ? `${site}:${url.port}` : site;
}

export function sameSite(a: string, b: string): boolean {
  try {
    return siteOf(a) === siteOf(b);
  } catch {
    return false;
  }
}

/** Strict matching favours an omitted pointer over one pointing at the wrong screen. */
export function sameView(a: CaptureContext, b: CaptureContext): boolean {
  return (
    a.documentToken === b.documentToken &&
    a.url === b.url &&
    a.revision === b.revision &&
    a.viewport.width === b.viewport.width &&
    a.viewport.height === b.viewport.height &&
    Math.abs(a.scroll.x - b.scroll.x) < 1 &&
    Math.abs(a.scroll.y - b.scroll.y) < 1 &&
    a.dpr === b.dpr
  );
}

export function isCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.channel === CHANNEL &&
    typeof candidate.type === 'string' &&
    [
      'state',
      'start',
      'pause',
      'resume',
      'capture',
      'stop',
      'discard',
      'import',
      'edit-step',
      'retake',
      'delete-step',
      'observation',
    ].includes(candidate.type)
  );
}
