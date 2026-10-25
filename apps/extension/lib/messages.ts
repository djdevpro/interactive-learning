import type { GuideAnnotation, GuideCursor } from '@interactive-learning/protocol';

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
  origin?: string;
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
