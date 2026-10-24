import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuideDocument } from '@interactive-learning/protocol';
import { CHANNEL, SESSION_KEY, type CaptureContext, type RecorderState } from './messages';

const environment = vi.hoisted(() => ({
  stored: {} as Record<string, unknown>,
  guides: new Map<string, GuideDocument>(),
  activeId: 7,
  imageNumber: 0,
  captures: [] as number[],
  context: {} as CaptureContext,
  failCapture: false,
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async () => structuredClone(environment.stored)),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(environment.stored, structuredClone(values));
        }),
      },
    },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
    scripting: { executeScript: vi.fn(async () => []) },
    tabs: {
      query: vi.fn(async () => [
        { id: environment.activeId, windowId: 1, url: environment.context.url },
      ]),
      get: vi.fn(async () => ({ id: 7, windowId: 1, url: environment.context.url })),
      sendMessage: vi.fn(async () => structuredClone(environment.context)),
      captureVisibleTab: vi.fn(async () => {
        environment.captures.push(Date.now());
        if (environment.failCapture) throw new Error('Capture refusée');
        return `data:image/png;base64,${btoa(String(++environment.imageNumber))}`;
      }),
    },
  },
}));

vi.mock('./guide-store', () => ({
  GuideStore: class {
    async read(id: string) {
      return structuredClone(environment.guides.get(id));
    }
    async write(guide: GuideDocument) {
      environment.guides.set(guide.id, structuredClone(guide));
    }
  },
}));

import { RecorderController } from './recorder-controller';

async function finish<T>(task: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return task;
}

function currentGuide(): GuideDocument {
  const state = environment.stored[SESSION_KEY] as RecorderState;
  return environment.guides.get(state.guideId!)!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  environment.stored = {};
  environment.guides.clear();
  environment.activeId = 7;
  environment.imageNumber = 0;
  environment.captures = [];
  environment.failCapture = false;
  environment.context = {
    url: 'https://demo.example/form',
    title: 'Formulaire',
    documentToken: 'document-a',
    revision: 1,
    viewport: { width: 1200, height: 800 },
    scroll: { x: 0, y: 0 },
    dpr: 1,
  };
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1200, height: 800, close() {} }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('recorder capture boundaries', () => {
  it('attaches a click only to the previous compatible screen', async () => {
    const controller = new RecorderController();
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', title: 'Créer un dossier' }),
    );
    await finish(
      controller.observe(
        {
          channel: CHANNEL,
          type: 'observation',
          reason: 'click',
          context: environment.context,
          point: { x: 300, y: 200 },
        },
        7,
        0,
      ),
    );
    expect(currentGuide().steps[0]?.cursor).toEqual({ x: 0.25, y: 0.25, action: 'click' });
    expect(currentGuide().steps[1]?.cursor).toBeUndefined();
  });

  it('omits a pointer when the click belongs to a new page', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', title: 'Navigation' }));
    environment.context = {
      ...environment.context,
      documentToken: 'document-b',
      url: 'https://demo.example/result',
    };
    await finish(
      controller.observe(
        {
          channel: CHANNEL,
          type: 'observation',
          reason: 'click',
          context: environment.context,
          point: { x: 300, y: 200 },
        },
        7,
        0,
      ),
    );
    expect(currentGuide().steps.every((step) => !step.cursor)).toBe(true);
    expect((environment.stored[SESSION_KEY] as RecorderState).diagnostics[0]?.message).toContain(
      'omis',
    );
  });

  it('does not photograph a different active tab', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', title: 'Onglets' }));
    environment.activeId = 8;
    await finish(controller.command({ channel: CHANNEL, type: 'capture' }));
    expect(environment.captures).toHaveLength(1);
    expect(currentGuide().steps).toHaveLength(1);
  });

  it('keeps captures at least 600 ms apart, including a new session', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', title: 'Premier guide' }));
    await finish(controller.command({ channel: CHANNEL, type: 'capture' }));
    await finish(controller.command({ channel: CHANNEL, type: 'start', title: 'Second guide' }));
    expect(environment.captures).toHaveLength(3);
    for (let index = 1; index < environment.captures.length; index++) {
      expect(
        environment.captures[index]! - environment.captures[index - 1]!,
      ).toBeGreaterThanOrEqual(600);
    }
  });

  it('pauses at a different origin and preserves captured steps', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', title: 'Connexion' }));
    await finish(controller.navigation(7, 'https://identity.example/login'));
    expect((environment.stored[SESSION_KEY] as RecorderState).status).toBe('paused');
    expect(currentGuide().steps).toHaveLength(1);
  });

  it('retains the last successful capture when screenshot fails', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', title: 'Guide' }));
    environment.failCapture = true;
    const state = await finish(controller.command({ channel: CHANNEL, type: 'capture' }));
    expect(state.stepCount).toBe(1);
    expect(state.diagnostics[0]?.message).toBe('Capture refusée');
    expect(currentGuide().assets).toHaveLength(1);
  });
});
