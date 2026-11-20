import type { GuideStoryLine } from '@interactive-learning/protocol';
import { voiceAt } from './Story';

export interface NarrationState {
  story: readonly GuideStoryLine[] | undefined;
  elapsedMs: number;
  totalMs: number;
  /** True while the guide plays, false when it pauses or waits for a screenshot. */
  playing: boolean;
  rate: number;
  muted: boolean;
}

/** The voice may drift this far from the guide, in seconds, before it jumps back in step. */
const DRIFT_S = 0.3;

/**
 * Reads the story aloud in step with the guide, like the voice over of a video: the voice of the
 * line being told plays while the guide plays, from the time since the line started and at the
 * speed of the guide. It pauses with the guide, follows a seek, and the next voice loads ahead.
 */
export class Narration {
  readonly #resolve: (src: string) => string;
  readonly #voices = new Map<string, HTMLAudioElement>();
  #current: HTMLAudioElement | undefined;
  /** The browser refused sound before the viewer acted on the page. */
  #blocked = false;

  constructor(resolve: (src: string) => string) {
    this.#resolve = resolve;
  }

  /** Loads the first voice of a story, so the guide does not start in silence. */
  prepare(story: readonly GuideStoryLine[] | undefined): void {
    const first = story?.find((line) => line.audio);
    if (first?.audio) this.#voice(first.audio);
  }

  sync(state: NarrationState): void {
    if (typeof Audio === 'undefined') return;
    const voice = voiceAt(state.story, state.elapsedMs, state.totalMs);
    const audio = voice ? this.#voice(voice.audio) : undefined;
    if (this.#current && this.#current !== audio) this.#current.pause();
    this.#current = audio;
    if (!audio || !voice) return;
    const next = state.story?.slice(voice.index + 1).find((line) => line.audio);
    if (next?.audio) this.#voice(next.audio);

    const offset = voice.offsetMs / 1000;
    const over = Number.isFinite(audio.duration) && offset >= audio.duration;
    if (!state.playing || state.muted || this.#blocked || over) {
      audio.pause();
      return;
    }
    audio.playbackRate = state.rate;
    if (Math.abs(audio.currentTime - offset) > DRIFT_S) audio.currentTime = offset;
    if (audio.paused) {
      audio.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') this.#blocked = true;
      });
    }
  }

  /** A gesture of the viewer, such as Play, lets the voice try again. */
  unblock(): void {
    this.#blocked = false;
  }

  stop(): void {
    this.#current?.pause();
    this.#current = undefined;
  }

  /** Another guide: the voices of this one go. */
  reset(): void {
    this.stop();
    for (const audio of this.#voices.values()) {
      audio.removeAttribute('src');
      audio.load();
    }
    this.#voices.clear();
  }

  #voice(src: string): HTMLAudioElement {
    const url = this.#resolve(src);
    let audio = this.#voices.get(url);
    if (!audio) {
      audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      this.#voices.set(url, audio);
    }
    return audio;
  }
}
