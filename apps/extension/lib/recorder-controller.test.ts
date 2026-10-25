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
  otherUrl: undefined as string | undefined,
  failInject: false,
  hideUrl: false,
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
    scripting: {
      executeScript: vi.fn(async () => {
        if (environment.failInject) throw new Error('Cannot access contents of the page.');
        return [];
      }),
    },
    tabs: {
      query: vi.fn(async () => [
        { id: environment.activeId, windowId: 1, url: environment.context.url },
      ]),
      get: vi.fn(async (id: number) => ({
        id,
        windowId: 1,
        url:
          id === 7
            ? environment.hideUrl
              ? undefined
              : environment.context.url
            : environment.otherUrl,
      })),
      sendMessage: vi.fn(async () => structuredClone(environment.context)),
      captureVisibleTab: vi.fn(async () => {
        environment.captures.push(Date.now());
        if (environment.failCapture) throw new Error('Capture denied');
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
    async delete(id: string) {
      environment.guides.delete(id);
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
  environment.otherUrl = undefined;
  environment.failInject = false;
  environment.hideUrl = false;
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
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Create a folder' }),
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
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Navigation' }),
    );
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
      'left out',
    );
  });

  it('does not photograph a different active tab', async () => {
    const controller = new RecorderController();
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Onglets' }),
    );
    environment.activeId = 8;
    await finish(controller.command({ channel: CHANNEL, type: 'capture' }));
    expect(environment.captures).toHaveLength(1);
    expect(currentGuide().steps).toHaveLength(1);
  });

  it('keeps captures at least 600 ms apart, including a new session', async () => {
    const controller = new RecorderController();
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'First guide' }),
    );
    await finish(controller.command({ channel: CHANNEL, type: 'capture' }));
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Second guide' }),
    );
    expect(environment.captures).toHaveLength(3);
    for (let index = 1; index < environment.captures.length; index++) {
      expect(
        environment.captures[index]! - environment.captures[index - 1]!,
      ).toBeGreaterThanOrEqual(600);
    }
  });

  it('pauses at a different origin and preserves captured steps', async () => {
    const controller = new RecorderController();
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Connexion' }),
    );
    await finish(controller.navigation(7, 'https://identity.example/login'));
    expect((environment.stored[SESSION_KEY] as RecorderState).status).toBe('paused');
    expect(currentGuide().steps).toHaveLength(1);
  });

  it('retains the last successful capture when screenshot fails', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Guide' }));
    environment.failCapture = true;
    const state = await finish(controller.command({ channel: CHANNEL, type: 'capture' }));
    expect(state.stepCount).toBe(1);
    expect(state.diagnostics[0]?.message).toBe('Capture denied');
    expect(currentGuide().assets).toHaveLength(1);
  });
});

describe('step editing from the panel', () => {
  it('saves markers, the click point and texts of one step', async () => {
    const controller = new RecorderController();
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Markers' }),
    );
    const step = currentGuide().steps[0]!;
    await finish(
      controller.command({
        channel: CHANNEL,
        type: 'edit-step',
        stepId: step.id,
        title: 'Open the form',
        description: 'Click New project.',
        cursor: { x: 0.8, y: 0.2, action: 'click' },
        annotations: [
          { id: 'marker-1', x: 0.8, y: 0.2, title: 'New project', body: '' },
          { id: 'marker-2', x: 0.3, y: 0.6, title: 'List', body: 'Existing projects.' },
        ],
      }),
    );
    const edited = currentGuide().steps[0]!;
    expect(edited.title).toBe('Open the form');
    expect(edited.cursor).toEqual({ x: 0.8, y: 0.2, action: 'click' });
    expect(edited.annotations.map((annotation) => annotation.id)).toEqual(['marker-1', 'marker-2']);

    await finish(
      controller.command({
        channel: CHANNEL,
        type: 'edit-step',
        stepId: step.id,
        title: edited.title,
        description: edited.description,
        cursor: null,
        annotations: [],
      }),
    );
    expect(currentGuide().steps[0]?.cursor).toBeUndefined();
    expect(currentGuide().steps[0]?.annotations).toEqual([]);
  });

  it('rejects a marker outside the screenshot', async () => {
    const controller = new RecorderController();
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Markers' }),
    );
    const step = currentGuide().steps[0]!;
    await expect(
      finish(
        controller.command({
          channel: CHANNEL,
          type: 'edit-step',
          stepId: step.id,
          title: step.title,
          description: '',
          cursor: null,
          annotations: [{ id: 'marker-1', x: 1.4, y: 0.2, title: 'Outside', body: '' }],
        }),
      ),
    ).rejects.toThrow();
    expect(currentGuide().steps[0]?.annotations).toEqual([]);
  });
});

describe('session lifecycle', () => {
  it('records the tab named by the panel, never another page', async () => {
    environment.otherUrl = 'chrome://extensions/';
    const controller = new RecorderController();
    await expect(
      finish(controller.command({ channel: CHANNEL, type: 'start', tabId: 9, title: 'Settings' })),
    ).rejects.toThrow('Only websites');
    environment.otherUrl = undefined;
    await expect(
      finish(controller.command({ channel: CHANNEL, type: 'start', tabId: 9, title: 'Hidden' })),
    ).rejects.toThrow('icon');
    expect(environment.stored[SESSION_KEY]).toBeUndefined();
  });

  it('replaces the previous guide when a new one starts', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'First' }));
    const first = (environment.stored[SESSION_KEY] as RecorderState).guideId!;
    await finish(controller.command({ channel: CHANNEL, type: 'stop' }));
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Second' }),
    );
    expect(environment.guides.has(first)).toBe(false);
    expect(currentGuide().title).toBe('Second');
  });

  it('discards the guide and returns to the idle state', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Draft' }));
    const state = await finish(controller.command({ channel: CHANNEL, type: 'discard' }));
    expect(state.status).toBe('idle');
    expect(state.guideId).toBeUndefined();
    expect(environment.guides.size).toBe(0);
  });

  it('deletes one step with its screenshot', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Steps' }));
    await finish(controller.command({ channel: CHANNEL, type: 'capture' }));
    const [first] = currentGuide().steps;
    const state = await finish(
      controller.command({ channel: CHANNEL, type: 'delete-step', stepId: first!.id }),
    );
    expect(state.stepCount).toBe(1);
    expect(currentGuide().assets).toHaveLength(1);
    expect(currentGuide().assets[0]?.id).toBe(currentGuide().steps[0]?.assetId);
  });

  it('retakes the screenshot of a step and keeps its texts', async () => {
    const controller = new RecorderController();
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Retake' }),
    );
    await finish(controller.command({ channel: CHANNEL, type: 'stop' }));
    const before = currentGuide().steps[0]!;
    await finish(controller.command({ channel: CHANNEL, type: 'retake', stepId: before.id }));
    const after = currentGuide().steps[0]!;
    expect(after.assetId).not.toBe(before.assetId);
    expect(after.title).toBe(before.title);
    expect(currentGuide().assets).toHaveLength(1);
  });
});

describe('imported guides and page addresses', () => {
  it('opens an imported guide as finished and keeps it on a second import', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Old' }));
    const old = (environment.stored[SESSION_KEY] as RecorderState).guideId!;
    const imported = structuredClone(currentGuide());
    imported.id = 'imported-guide';
    imported.title = 'Imported';
    environment.guides.set(imported.id, imported);

    const state = await finish(
      controller.command({ channel: CHANNEL, type: 'import', guideId: imported.id }),
    );
    expect(state).toMatchObject({ status: 'stopped', guideId: imported.id, stepCount: 1 });
    expect(state.origin).toBe('https://demo.example');
    expect(environment.guides.has(old)).toBe(false);

    await finish(controller.command({ channel: CHANNEL, type: 'import', guideId: imported.id }));
    expect(environment.guides.has(imported.id)).toBe(true);
  });

  it('changes or removes the page address of a step', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Pages' }));
    const step = currentGuide().steps[0]!;
    const edit = (url: string) =>
      finish(
        controller.command({
          channel: CHANNEL,
          type: 'edit-step',
          stepId: step.id,
          title: step.title,
          description: '',
          cursor: null,
          annotations: [],
          url,
        }),
      );
    await edit('https://demo.example/projects/new');
    expect(currentGuide().steps[0]?.source?.url).toBe('https://demo.example/projects/new');
    await expect(edit('javascript:alert(1)')).rejects.toThrow();
    await edit('');
    expect(currentGuide().steps[0]?.source).toBeDefined();
    expect(currentGuide().steps[0]?.source?.url).toBeUndefined();
  });
});

describe('pages of the same site and lost access', () => {
  const stateOf = () => environment.stored[SESSION_KEY] as RecorderState;

  it('keeps recording when the address moves to www on the same site', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Site' }));
    environment.context = { ...environment.context, url: 'https://www.demo.example/menu' };
    await finish(controller.navigation(7, 'https://www.demo.example/menu'));
    expect(stateOf().status).toBe('recording');
    expect(currentGuide().steps.at(-1)?.source?.url).toBe('https://www.demo.example/menu');
  });

  it('pauses when Chrome withdraws access, then resumes on a click on the icon', async () => {
    const controller = new RecorderController();
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Access' }),
    );
    environment.failInject = true;
    await finish(controller.navigation(7, 'https://www.demo.example/menu'));
    expect(stateOf()).toMatchObject({ status: 'paused', pausedFor: 'access' });
    expect(stateOf().diagnostics[0]?.message).toContain('icon in the toolbar');

    environment.failInject = false;
    const state = await finish(controller.accessGranted(7));
    expect(state.status).toBe('recording');
    expect(state.pausedFor).toBeUndefined();
    expect(currentGuide().steps.at(-1)?.title).toBe('Walkthrough resumed');
  });

  it('explains how to give access back instead of blaming the site', async () => {
    const controller = new RecorderController();
    await finish(
      controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Hidden' }),
    );
    await finish(controller.navigation(7, 'https://accounts.example/login'));
    expect(stateOf()).toMatchObject({ status: 'paused', pausedFor: 'site' });
    environment.hideUrl = true;
    await expect(finish(controller.command({ channel: CHANNEL, type: 'resume' }))).rejects.toThrow(
      'icon in the toolbar',
    );
    environment.hideUrl = false;
    environment.context = { ...environment.context, url: 'https://accounts.example/login' };
    await expect(finish(controller.command({ channel: CHANNEL, type: 'resume' }))).rejects.toThrow(
      'Go back to demo.example',
    );
  });

  it('keeps a pause chosen in the panel when the icon is clicked', async () => {
    const controller = new RecorderController();
    await finish(controller.command({ channel: CHANNEL, type: 'start', tabId: 7, title: 'Pause' }));
    await finish(controller.command({ channel: CHANNEL, type: 'pause' }));
    const state = await finish(controller.accessGranted(7));
    expect(state).toMatchObject({ status: 'paused', pausedFor: 'user' });
  });
});
