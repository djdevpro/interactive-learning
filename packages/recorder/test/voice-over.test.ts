import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import type { GuideDocument } from '@interactive-learning/protocol';
import { RecordingSession } from '../src/recording-session.js';
import { addVoiceOver, splitWords } from '../src/voice-over.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1UAAAAASUVORK5CYII=',
  'base64',
);
let directory: string;
let guideDirectory: string;
let built = 0;

beforeEach(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'interactive-learning-voice-'));
  guideDirectory = resolve(directory, 'guide');
  vi.stubEnv('ELEVENLABS_API_KEY', '');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (!basename(directory).startsWith('interactive-learning-voice-'))
    throw new Error('Refusing to clean a path outside the test directory.');
  await rm(directory, { recursive: true, force: true });
});

/** A guide of three 2-second steps that tells `lines`, each starting with the step of its index. */
async function guideTelling(lines: Array<[step: number, text: string]>): Promise<GuideDocument> {
  const imagePath = resolve(directory, 'screen.png');
  await writeFile(imagePath, png);
  // Each guide is built apart; its voice goes to the same `guideDirectory`.
  const session = await RecordingSession.create({
    filePath: resolve(directory, 'work', String(++built), 'guide.json'),
    title: 'Banque',
  });
  for (const title of ['Ouvrir', 'Voir', 'Régler'])
    await session.addCapture({ imagePath, title, durationMs: 2000 });
  const guide = await session.validate();
  guide.story = lines.map(([step, text]) => ({ atMs: step * 2000, text }));
  return guide;
}

/** The answer of ElevenLabs for `text`, each character lasting `msPerCharacter`. */
function answer(text: string, msPerCharacter: number): Response {
  const characters = [...text];
  return Response.json({
    audio_base64: Buffer.from(`mp3 of ${text}`).toString('base64'),
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, i) => (i * msPerCharacter) / 1000),
      character_end_times_seconds: characters.map((_, i) => ((i + 1) * msPerCharacter) / 1000),
    },
  });
}

/** A `fetch` that reads each line at `msPerCharacter` and remembers each request. */
function fakeElevenLabs(msPerCharacter = 10) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { text: string };
    return answer(body.text, msPerCharacter);
  });
}

describe('addVoiceOver', () => {
  it('reads each line, writes its sound and gives it the words with their moments', async () => {
    const guide = await guideTelling([
      [0, 'Le groupe :'],
      [2, 'Chaque filiale.'],
    ]);
    const fetch = fakeElevenLabs();

    const result = await addVoiceOver(guide, { guideDirectory, apiKey: 'key', fetch });

    expect(result).toEqual({ spoken: 2, reused: 0, silent: 0, addedMs: 0 });
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/YxrwjAKoUKULGd0g8K9Y/with-timestamps?output_format=mp3_44100_128',
    );
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['xi-api-key']).toBe('key');
    expect(JSON.parse(String(init?.body))).toEqual({
      text: 'Le groupe :',
      model_id: 'eleven_v4_turbo',
      next_text: 'Chaque filiale.',
    });
    expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body)).previous_text).toBe('Le groupe :');

    const [first] = guide.story!;
    expect(first!.audio).toMatch(/^voice\/[0-9a-f]{16}\.mp3$/);
    // The colon said alone stays with the word before it.
    expect(first!.words).toEqual([
      { text: 'Le', atMs: 0, endMs: 20 },
      { text: 'groupe :', atMs: 30, endMs: 110 },
    ]);
    const sound = await readFile(resolve(guideDirectory, first!.audio!), 'utf8');
    expect(sound).toBe('mp3 of Le groupe :');
    expect((await readdir(resolve(guideDirectory, 'voice'))).sort()).toHaveLength(4);
  });

  it('lengthens the steps of a line that lasts longer than them, and moves the next lines', async () => {
    // 30 characters at 100 ms: 3 s, plus the 800 ms pause, over one 2 s step.
    const guide = await guideTelling([
      [0, 'Une phrase lue en trois s.....'],
      [1, 'Courte.'],
    ]);

    const result = await addVoiceOver(guide, {
      guideDirectory,
      apiKey: 'key',
      fetch: fakeElevenLabs(100),
    });

    expect(result.addedMs).toBe(1800);
    expect(guide.steps.map((step) => step.durationMs)).toEqual([3800, 2000, 2000]);
    expect(guide.story!.map((line) => line.atMs)).toEqual([0, 3800]);
  });

  it('shares the extra time among the steps a line covers, in proportion to their length', async () => {
    const guide = await guideTelling([[1, 'Une phrase lue en cinq secondes, sur deux étapes.']]);
    guide.steps[2]!.durationMs = 1000;

    await addVoiceOver(guide, { guideDirectory, apiKey: 'key', fetch: fakeElevenLabs(100) });

    // 4.9 s read plus 0.8 s of pause over 3 s of steps: 2.7 s more, two thirds to the longer step.
    expect(guide.steps.map((step) => step.durationMs)).toEqual([2000, 3800, 1900]);
    expect(guide.story![0]!.atMs).toBe(2000);
  });

  it('reuses a line already read without calling ElevenLabs, even without a key', async () => {
    const first = await guideTelling([[0, 'Le groupe a trois filiales.']]);
    await addVoiceOver(first, { guideDirectory, apiKey: 'key', fetch: fakeElevenLabs() });

    const again = await guideTelling([[0, 'Le groupe a trois filiales.']]);
    const fetch = fakeElevenLabs();
    const result = await addVoiceOver(again, { guideDirectory, fetch });

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ spoken: 0, reused: 1, silent: 0 });
    expect(again.story![0]).toEqual(first.story![0]);
  });

  it('reads the line again with another voice', async () => {
    const guide = await guideTelling([[0, 'Le groupe a trois filiales.']]);
    await addVoiceOver(guide, { guideDirectory, apiKey: 'key', fetch: fakeElevenLabs() });
    const before = guide.story![0]!.audio;

    const fetch = fakeElevenLabs();
    await addVoiceOver(guide, { guideDirectory, apiKey: 'key', voiceId: 'other', fetch });

    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0]![0])).toContain('/text-to-speech/other/');
    expect(guide.story![0]!.audio).not.toBe(before);
  });

  it('leaves a new line silent without a key, and calls nothing', async () => {
    const guide = await guideTelling([[0, 'Le groupe a trois filiales.']]);
    guide.story![0]!.audio = 'voice/0000000000000000.mp3';
    const fetch = fakeElevenLabs();

    const result = await addVoiceOver(guide, { guideDirectory, fetch });

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual({ spoken: 0, reused: 0, silent: 1, addedMs: 0 });
    expect(guide.story![0]).toEqual({ atMs: 0, text: 'Le groupe a trois filiales.' });
  });

  it('deletes the sounds no line uses any more, and nothing else of the folder', async () => {
    const guide = await guideTelling([[0, 'Ancienne phrase.']]);
    await addVoiceOver(guide, { guideDirectory, apiKey: 'key', fetch: fakeElevenLabs() });
    await writeFile(resolve(guideDirectory, 'voice', 'notes.txt'), 'kept');

    guide.story![0]!.text = 'Nouvelle phrase.';
    await addVoiceOver(guide, { guideDirectory, apiKey: 'key', fetch: fakeElevenLabs() });

    const names = await readdir(resolve(guideDirectory, 'voice'));
    expect(names.sort()).toEqual(
      [
        basename(guide.story![0]!.audio!),
        basename(guide.story![0]!.audio!, '.mp3') + '.json',
        'notes.txt',
      ].sort(),
    );
  });

  it('keeps unused sounds when told not to prune', async () => {
    const guide = await guideTelling([[0, 'Ancienne phrase.']]);
    await addVoiceOver(guide, { guideDirectory, apiKey: 'key', fetch: fakeElevenLabs() });
    guide.story![0]!.text = 'Nouvelle phrase.';
    await addVoiceOver(guide, {
      guideDirectory,
      apiKey: 'key',
      fetch: fakeElevenLabs(),
      prune: false,
    });

    expect(await readdir(resolve(guideDirectory, 'voice'))).toHaveLength(4);
  });

  it('writes the sounds in the folder it is given', async () => {
    const guide = await guideTelling([[0, 'Le groupe.']]);
    await addVoiceOver(guide, {
      guideDirectory,
      apiKey: 'key',
      fetch: fakeElevenLabs(),
      folder: 'voix',
    });

    expect(dirname(guide.story![0]!.audio!)).toBe('voix');
    expect(await readdir(resolve(guideDirectory, 'voix'))).toHaveLength(2);
  });

  it('refuses a folder outside the guide folder', async () => {
    const guide = await guideTelling([[0, 'Le groupe.']]);
    for (const folder of ['..', '../voice', 'a/b', ''])
      await expect(addVoiceOver(guide, { guideDirectory, folder })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
  });

  it('refuses a line that does not start with a step, before anything is billed', async () => {
    const guide = await guideTelling([[0, 'Le groupe.']]);
    guide.story![0]!.atMs = 500;
    const fetch = fakeElevenLabs();

    await expect(
      addVoiceOver(guide, { guideDirectory, apiKey: 'key', fetch }),
    ).rejects.toMatchObject({ code: 'STORY_OFF_STEP' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports a refusal of ElevenLabs without the key, and keeps the lines already read', async () => {
    const guide = await guideTelling([
      [0, 'Première phrase.'],
      [1, 'Deuxième phrase.'],
    ]);
    const fetch = vi
      .fn()
      .mockImplementationOnce(async () => answer('Première phrase.', 10))
      .mockImplementationOnce(async () => new Response('quota_exceeded', { status: 401 }));

    const error = (await addVoiceOver(guide, {
      guideDirectory,
      apiKey: 'secret-key',
      fetch,
    }).catch((caught: unknown) => caught)) as Error & { code: string };

    expect(error.code).toBe('VOICE_OVER_FAILED');
    expect(error.message).toContain('HTTP 401 quota_exceeded');
    expect(error.message).not.toContain('secret-key');
    expect(await readdir(resolve(guideDirectory, 'voice'))).toHaveLength(2);
  });

  it('measures a sound without timestamps from its size', async () => {
    const guide = await guideTelling([[0, 'Deux mots']]);
    const fetch = vi.fn(async () =>
      Response.json({ audio_base64: Buffer.alloc(16_000).toString('base64'), alignment: null }),
    );

    await addVoiceOver(guide, { guideDirectory, apiKey: 'key', fetch });

    // 16 000 bytes at 128 kbit/s last one second, shared by the words in proportion to their length.
    expect(guide.story![0]!.words).toEqual([
      { text: 'Deux', atMs: 0, endMs: 500 },
      { text: 'mots', atMs: 500, endMs: 1000 },
    ]);
  });

  it('does nothing for a guide without a story', async () => {
    const guide = await guideTelling([]);
    delete guide.story;
    const fetch = fakeElevenLabs();

    expect(await addVoiceOver(guide, { guideDirectory, apiKey: 'key', fetch })).toEqual({
      spoken: 0,
      reused: 0,
      silent: 0,
      addedMs: 0,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('splitWords', () => {
  it('keeps a lone mark with the word before it', () => {
    expect(splitWords(null, 'Ouvrez la Banque !', 900).map((word) => word.text)).toEqual([
      'Ouvrez',
      'la',
      'Banque !',
    ]);
  });
});
