import { describe, it, expect } from 'vitest';
import { createGuide, validateGuide, isSafeAssetSource, sanitizeSourceUrl } from './index';

function fixture() {
  const guide = createGuide('Un parcours');
  guide.assets.push({
    id: 'a1',
    src: 'assets/screen.png',
    width: 1200,
    height: 800,
    mimeType: 'image/png',
  });
  guide.steps.push({
    id: 's1',
    assetId: 'a1',
    title: 'Créer un dossier',
    description: 'Cliquez sur Ajouter.',
    durationMs: 4000,
    annotations: [],
    cursor: { x: 0.25, y: 0.5 },
  });
  return guide;
}
describe('guide contract', () => {
  it('round trips a standalone JSON document', () => {
    const guide = fixture();
    expect(validateGuide(JSON.parse(JSON.stringify(guide)))).toEqual(guide);
  });
  it('allows a new recording without screenshots yet', () =>
    expect(validateGuide(createGuide('Nouveau')).steps).toEqual([]));
  it('rejects an unsupported version instead of guessing a migration', () =>
    expect(() => validateGuide({ ...fixture(), schemaVersion: '2.0.0' })).toThrow(/version/));
  it('rejects dangling references and duplicate steps', () => {
    const guide = fixture();
    guide.steps[0]!.assetId = 'missing';
    expect(() => validateGuide(guide)).toThrow(/screenshot not found/);
    const duplicate = fixture();
    duplicate.steps.push({ ...duplicate.steps[0]! });
    expect(() => validateGuide(duplicate)).toThrow(/duplicate/);
  });
  it('requires finite normalized cursor and annotation coordinates', () => {
    for (const x of [-0.1, 1.1, NaN, Infinity]) {
      const guide = fixture();
      guide.steps[0]!.cursor!.x = x;
      expect(() => validateGuide(guide)).toThrow(/number/);
    }
  });
  it('rejects cursor actions that only become valid after string coercion', () => {
    for (const action of [['click'], ['move'], { toString: () => 'click' }]) {
      const guide = fixture();
      const cursor = guide.steps[0]!.cursor as unknown as Record<string, unknown>;
      cursor.action = action;
      expect(() => validateGuide(guide)).toThrow(/action/);
    }
  });
  it('rejects active content, remote resources and directory traversal', () => {
    for (const src of [
      'https://example.test/p.png',
      '//host/p.png',
      '../p.png',
      'assets/%2e%2e/p.png',
      'assets/%5cp.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'javascript:alert(1)',
      'C:\\x.png',
    ])
      expect(isSafeAssetSource(src)).toBe(false);
    expect(isSafeAssetSource('assets/a-123.png')).toBe(true);
    expect(isSafeAssetSource('data:image/png;base64,AAAA')).toBe(true);
  });
  it('rejects a mismatched embedded image MIME', () => {
    const guide = fixture();
    guide.assets[0]!.src = 'data:image/jpeg;base64,AAAA';
    expect(() => validateGuide(guide)).toThrow(/MIME/);
  });
  it('removes credentials, query strings and fragments from source URLs', () => {
    expect(sanitizeSourceUrl('https://user:password@example.test/form?token=secret#private')).toBe(
      'https://example.test/form',
    );
    expect(sanitizeSourceUrl('https://app.test/#/projects/new?invite=secret')).toBe(
      'https://app.test/#/projects/new',
    );
    expect(sanitizeSourceUrl('https://app.test/callback#access_token=secret')).toBe(
      'https://app.test/callback',
    );
    expect(sanitizeSourceUrl('file:///private')).toBeUndefined();
  });
});

describe('full-page screenshots and transitions', () => {
  it('keeps the visible part of a step and its transition', () => {
    const guide = fixture();
    guide.steps[0]!.viewport = { x: 0, y: 0.4, width: 1, height: 0.2 };
    guide.steps[0]!.transition = 'cut';
    expect(validateGuide(JSON.parse(JSON.stringify(guide))).steps[0]).toMatchObject({
      viewport: { x: 0, y: 0.4, width: 1, height: 0.2 },
      transition: 'cut',
    });
  });

  it('refuses a visible part outside the image or an unknown transition', () => {
    const outside = fixture();
    outside.steps[0]!.viewport = { x: 0, y: 0.9, width: 1, height: 0.2 };
    expect(() => validateGuide(outside)).toThrow(/inside the image/);
    const transition = fixture() as unknown as { steps: { transition: string }[] };
    transition.steps[0]!.transition = 'spin';
    expect(() => validateGuide(transition)).toThrow(/fade or cut/);
  });

  it('accepts a guide without these fields, as before', () => {
    const step = validateGuide(fixture()).steps[0]!;
    expect(step.viewport).toBeUndefined();
    expect(step.transition).toBeUndefined();
    expect(step.zoom).toBeUndefined();
  });
});

describe('the zoom of a step', () => {
  it('keeps how close the camera goes', () => {
    const guide = fixture();
    guide.steps[0]!.zoom = 1.8;
    expect(validateGuide(JSON.parse(JSON.stringify(guide))).steps[0]!.zoom).toBe(1.8);
  });

  it('refuses a zoom that shrinks the screen or goes past four times', () => {
    for (const zoom of [0.5, 4.5, Number.NaN]) {
      const guide = fixture();
      guide.steps[0]!.zoom = zoom;
      expect(() => validateGuide(guide)).toThrow(/zoom/);
    }
    const text = fixture() as unknown as { steps: { zoom: string }[] };
    text.steps[0]!.zoom = '2';
    expect(() => validateGuide(text)).toThrow(/zoom/);
  });
});

describe('the story of a guide', () => {
  it('keeps its lines, in the order they are told', () => {
    const guide = fixture();
    guide.story = [
      { atMs: 0, text: 'Le groupe a trois filiales.' },
      { atMs: 2500, text: 'Chacune a son plan comptable.' },
    ];
    expect(validateGuide(JSON.parse(JSON.stringify(guide))).story).toEqual(guide.story);
  });

  it('refuses a line told before the one before it, or a line that says nothing', () => {
    const disorder = fixture();
    disorder.story = [
      { atMs: 2000, text: 'Ensuite.' },
      { atMs: 1000, text: 'Avant.' },
    ];
    expect(() => validateGuide(disorder)).toThrow(/after the one before/);
    const empty = fixture();
    empty.story = [{ atMs: 0, text: '  ' }];
    expect(() => validateGuide(empty)).toThrow(/tells something/);
  });

  it('leaves a guide without a story as it was', () => {
    expect(validateGuide(fixture()).story).toBeUndefined();
  });

  it('keeps the voice of a line, next to the guide or embedded', () => {
    const guide = fixture();
    guide.story = [
      { atMs: 0, text: 'Le groupe a trois filiales.', audio: 'voix/4f2a.mp3' },
      { atMs: 2500, text: 'Chacune a son plan comptable.', audio: 'data:audio/mpeg;base64,SUQz' },
      { atMs: 5000, text: 'Sans voix.' },
    ];
    expect(validateGuide(JSON.parse(JSON.stringify(guide))).story).toEqual(guide.story);
  });

  it('refuses a voice outside the folder of the guide, or an embedded file that is no sound', () => {
    for (const audio of [
      '../voix/a.mp3',
      '/voix/a.mp3',
      'https://cdn.test/a.mp3',
      'data:image/png;base64,AAAA',
    ]) {
      const guide = fixture();
      guide.story = [{ atMs: 0, text: 'Une phrase.', audio }];
      expect(() => validateGuide(guide)).toThrow(/sound/);
    }
  });

  it('keeps the words of a voice with the moment each is said', () => {
    const guide = fixture();
    guide.story = [
      {
        atMs: 0,
        text: 'Deuxième étape : les postes.',
        audio: 'voix/a.mp3',
        words: [
          { text: 'Deuxième', atMs: 80, endMs: 520 },
          { text: 'étape :', atMs: 540, endMs: 980 },
          { text: 'les', atMs: 1200, endMs: 1320 },
          { text: 'postes.', atMs: 1340, endMs: 1800 },
        ],
      },
    ];
    expect(validateGuide(JSON.parse(JSON.stringify(guide))).story).toEqual(guide.story);
  });

  it('refuses words out of order, a word that ends before it starts, or an empty word', () => {
    const cases = [
      [
        { text: 'un', atMs: 500, endMs: 600 },
        { text: 'deux', atMs: 100, endMs: 300 },
      ],
      [{ text: 'un', atMs: 500, endMs: 400 }],
      [{ text: ' ', atMs: 0, endMs: 100 }],
    ];
    const messages = [/order they are said/, /ends after it starts/, /says something/];
    for (const [index, words] of cases.entries()) {
      const guide = fixture();
      guide.story = [{ atMs: 0, text: 'Une phrase.', words }];
      expect(() => validateGuide(guide)).toThrow(messages[index]!);
    }
  });
});
