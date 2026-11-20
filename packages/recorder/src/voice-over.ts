import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateGuide } from '@interactive-learning/protocol';
import type { GuideDocument, GuideWord } from '@interactive-learning/protocol';
import { isNodeError, RecorderError } from './errors.js';
import { rejectSymlink } from './files.js';

/** The voice read by default: a calm French voice of the ElevenLabs library. */
export const DEFAULT_VOICE_ID = 'YxrwjAKoUKULGd0g8K9Y';
/** The model read by default: v4 Turbo, the cheapest one. */
export const DEFAULT_MODEL_ID = 'eleven_v4_turbo';
/** MP3 at a constant 128 kbit/s, which every browser plays. */
const OUTPUT_FORMAT = 'mp3_44100_128';
/** 128 kbit/s is 16 bytes per millisecond. */
const BYTES_PER_MS = 16;
/** A sound of the voice-over folder: the 16 hex digits of its fingerprint. */
const VOICE_FILE = /^([0-9a-f]{16})\.(mp3|json)$/;

export interface VoiceOverOptions {
  /** The folder of `guide.json`: sound paths are relative to it, as the screenshots are. */
  guideDirectory: string;
  /** Defaults to the `ELEVENLABS_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to {@link DEFAULT_VOICE_ID}. */
  voiceId?: string;
  /** Defaults to {@link DEFAULT_MODEL_ID}. */
  modelId?: string;
  /** The folder of the sounds, inside `guideDirectory`. Defaults to `voice`. */
  folder?: string;
  /** The silence left after a line before the next one, in milliseconds. Defaults to 800. */
  pauseMs?: number;
  /** Deletes the sounds of the folder that no line uses any more. Defaults to `true`. */
  prune?: boolean;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Defaults to `https://api.elevenlabs.io`. */
  baseUrl?: string;
}

export interface VoiceOverResult {
  /** Lines read by ElevenLabs during this run, and billed. */
  spoken: number;
  /** Lines whose sound was already in the folder, and not billed again. */
  reused: number;
  /** Lines left without a voice because no API key was given. */
  silent: number;
  /** The time added to the steps so that each line ends before the next one, in milliseconds. */
  addedMs: number;
}

/** What the folder keeps next to each sound: its length and the moments of its words. */
interface Reading {
  durationMs: number;
  words: GuideWord[];
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/**
 * Reads each line of the story of `guide` aloud with ElevenLabs, like the voice-over of a video.
 * Each line gets its `audio`, a sound in `<guideDirectory>/<folder>/`, and its `words` with the
 * moment each is said, which the player shows as captions. Steps get longer where a line, plus a
 * pause, lasts longer than the steps it covers, and the lines that follow move with them.
 *
 * A sound is named after a fingerprint of its text, voice and model, so a line already read is
 * reused and never billed again. Without an API key, lines already read keep their voice and the
 * others stay silent. Changes `guide` in place; write it afterwards.
 *
 * Each line must start with a step, as a story built from the steps does.
 */
export async function addVoiceOver(
  guide: GuideDocument,
  options: VoiceOverOptions,
): Promise<VoiceOverResult> {
  const result: VoiceOverResult = { spoken: 0, reused: 0, silent: 0, addedMs: 0 };
  const story = guide.story ?? [];
  if (story.length === 0) return result;

  const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
  const voiceId = options.voiceId ?? DEFAULT_VOICE_ID;
  const modelId = options.modelId ?? DEFAULT_MODEL_ID;
  const folderName = options.folder ?? 'voice';
  const pauseMs = options.pauseMs ?? 800;
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(folderName)) {
    throw new RecorderError(
      'INVALID_ARGUMENT',
      'The voice-over folder is a single folder name inside the guide folder.',
    );
  }
  if (!Number.isFinite(pauseMs) || pauseMs < 0) {
    throw new RecorderError('INVALID_ARGUMENT', 'The pause after a line is zero or more.');
  }
  // Check the timing before anything is billed.
  const firstSteps = storySteps(guide);

  const folder = resolve(options.guideDirectory, folderName);
  await rejectSymlink(folder);
  await mkdir(folder, { recursive: true });

  const durations: Array<number | undefined> = [];
  for (const [index, line] of story.entries()) {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([modelId, voiceId, OUTPUT_FORMAT, line.text]))
      .digest('hex')
      .slice(0, 16);
    const soundPath = resolve(folder, `${fingerprint}.mp3`);
    const readingPath = resolve(folder, `${fingerprint}.json`);
    let reading = await readReading(soundPath, readingPath);
    if (reading) {
      result.reused++;
    } else if (apiKey) {
      const spoken = await speak({
        text: line.text,
        previousText: story[index - 1]?.text,
        nextText: story[index + 1]?.text,
        apiKey,
        voiceId,
        modelId,
        fetch: options.fetch ?? fetch,
        baseUrl: options.baseUrl ?? 'https://api.elevenlabs.io',
      });
      reading = { durationMs: spoken.durationMs, words: spoken.words };
      await writeFile(soundPath, spoken.mp3);
      await writeFile(
        readingPath,
        `${JSON.stringify(
          {
            durationMs: reading.durationMs,
            words: reading.words,
            text: line.text,
            voiceId,
            modelId,
          },
          null,
          2,
        )}\n`,
      );
      result.spoken++;
    }
    if (reading) {
      line.audio = `${folderName}/${fingerprint}.mp3`;
      line.words = reading.words;
      durations.push(reading.durationMs);
    } else {
      delete line.audio;
      delete line.words;
      durations.push(undefined);
      result.silent++;
    }
  }

  if (options.prune ?? true) {
    const kept = new Set(story.flatMap((line) => (line.audio ? [line.audio] : [])));
    for (const name of await readdir(folder)) {
      const match = VOICE_FILE.exec(name);
      if (match && !kept.has(`${folderName}/${match[1]}.mp3`)) {
        await unlink(resolve(folder, name)).catch((error: unknown) => {
          if (!isNodeError(error, 'ENOENT')) throw error;
        });
      }
    }
  }

  result.addedMs = fitSteps(guide, firstSteps, durations, pauseMs);
  validateGuide(guide);
  return result;
}

/** The index of the step each line starts with. */
function storySteps(guide: GuideDocument): number[] {
  const starts = stepStarts(guide);
  return (guide.story ?? []).map((line) => {
    const index = starts.indexOf(line.atMs);
    if (index < 0) {
      throw new RecorderError(
        'STORY_OFF_STEP',
        `The story line "${line.text.slice(0, 40)}" does not start with a step.`,
      );
    }
    return index;
  });
}

function stepStarts(guide: GuideDocument): number[] {
  let time = 0;
  return guide.steps.map((step) => {
    const start = time;
    time += step.durationMs;
    return start;
  });
}

/** A sound already read, with its reading, or nothing when either file is missing or broken. */
async function readReading(soundPath: string, readingPath: string): Promise<Reading | undefined> {
  try {
    await readFile(soundPath).then((bytes) => {
      if (bytes.length === 0) throw new Error('empty sound');
    });
    const reading = JSON.parse(await readFile(readingPath, 'utf8')) as Partial<Reading>;
    if (typeof reading.durationMs !== 'number' || !Array.isArray(reading.words)) return undefined;
    return { durationMs: reading.durationMs, words: reading.words };
  } catch {
    return undefined;
  }
}

async function speak(request: {
  text: string;
  previousText: string | undefined;
  nextText: string | undefined;
  apiKey: string;
  voiceId: string;
  modelId: string;
  fetch: typeof fetch;
  baseUrl: string;
}): Promise<Reading & { mp3: Buffer }> {
  const url = `${request.baseUrl}/v1/text-to-speech/${encodeURIComponent(request.voiceId)}/with-timestamps?output_format=${OUTPUT_FORMAT}`;
  let response: Response;
  try {
    response = await request.fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': request.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      // The neighbouring lines keep one tone from a line to the next.
      body: JSON.stringify({
        text: request.text,
        model_id: request.modelId,
        previous_text: request.previousText,
        next_text: request.nextText,
      }),
    });
  } catch (error) {
    throw new RecorderError('VOICE_OVER_FAILED', 'ElevenLabs could not be reached.', {
      cause: error,
    });
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new RecorderError(
      'VOICE_OVER_FAILED',
      `ElevenLabs refused to read "${request.text.slice(0, 40)}": HTTP ${response.status} ${detail}`.trim(),
    );
  }
  const body = (await response.json()) as { audio_base64?: string; alignment?: Alignment | null };
  if (typeof body.audio_base64 !== 'string' || body.audio_base64.length === 0) {
    throw new RecorderError('VOICE_OVER_FAILED', 'ElevenLabs answered without a sound.');
  }
  const mp3 = Buffer.from(body.audio_base64, 'base64');
  const end = body.alignment?.character_end_times_seconds.at(-1);
  // Without timestamps, the length follows from the constant bit rate of the MP3.
  const durationMs = Math.ceil(end !== undefined ? end * 1000 : mp3.length / BYTES_PER_MS);
  return { mp3, durationMs, words: splitWords(body.alignment, request.text, durationMs) };
}

/**
 * The words of a reading and the moment each is said, from the timestamp of each character. Without
 * timestamps, each word takes its share of the length, in proportion to its length. A lone mark,
 * such as the colon of « étape : », stays with the word before it.
 */
export function splitWords(
  alignment: Alignment | null | undefined,
  text: string,
  durationMs: number,
): GuideWord[] {
  const words: GuideWord[] = [];
  if (alignment?.characters.length) {
    let current: GuideWord | undefined;
    for (const [index, character] of alignment.characters.entries()) {
      if (/\s/.test(character)) {
        current = undefined;
        continue;
      }
      const start = Math.round((alignment.character_start_times_seconds[index] ?? 0) * 1000);
      const end = Math.round((alignment.character_end_times_seconds[index] ?? 0) * 1000);
      if (current) {
        current.text += character;
        current.endMs = Math.max(current.endMs, end);
      } else {
        current = { text: character, atMs: start, endMs: Math.max(start, end) };
        words.push(current);
      }
    }
  } else {
    const parts = text.split(/\s+/).filter(Boolean);
    const total = parts.reduce((sum, word) => sum + word.length + 1, 0);
    let time = 0;
    for (const word of parts) {
      const share = (durationMs * (word.length + 1)) / total;
      words.push({ text: word, atMs: Math.round(time), endMs: Math.round(time + share) });
      time += share;
    }
  }
  return words.reduce<GuideWord[]>((list, word) => {
    const previous = list.at(-1);
    if (previous && /^[\p{P}\p{S}]+$/u.test(word.text)) {
      previous.text += ` ${word.text}`;
      previous.endMs = Math.max(previous.endMs, word.endMs);
    } else list.push(word);
    return list;
  }, []);
}

/**
 * Gives each line the time to be said: when its reading plus the pause outlasts the steps it
 * covers, those steps get longer in proportion to their length. Each line then starts again with
 * its step. Returns the time added to the guide.
 */
function fitSteps(
  guide: GuideDocument,
  firstSteps: number[],
  durations: Array<number | undefined>,
  pauseMs: number,
): number {
  const story = guide.story ?? [];
  let added = 0;
  for (const [index, duration] of durations.entries()) {
    if (duration === undefined) continue;
    const steps = guide.steps.slice(firstSteps[index], firstSteps[index + 1] ?? guide.steps.length);
    const available = steps.reduce((sum, step) => sum + step.durationMs, 0);
    const missing = duration + pauseMs - available;
    if (missing <= 0) continue;
    let rest = missing;
    for (const [position, step] of steps.entries()) {
      const share =
        position === steps.length - 1 ? rest : Math.round((missing * step.durationMs) / available);
      step.durationMs += share;
      rest -= share;
    }
    added += missing;
  }
  const starts = stepStarts(guide);
  for (const [index, line] of story.entries()) line.atMs = starts[firstSteps[index]!]!;
  return added;
}
