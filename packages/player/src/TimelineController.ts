/** The data needed by the timeline. No browser, clock or Vue dependency. */
export interface TimelineStep {
  readonly id: string;
  readonly durationMs: number;
}

export interface TimelineSnapshot {
  readonly elapsedMs: number;
  readonly totalMs: number;
  readonly progress: number;
  readonly stepIndex: number;
  readonly stepElapsedMs: number;
  readonly stepProgress: number;
  readonly playing: boolean;
  readonly ended: boolean;
}

/**
 * Deterministic playback state. A host supplies elapsed time through advance().
 * Seeking computes the current step directly, so it also works while paused.
 */
export class TimelineController {
  readonly totalMs: number;
  readonly stepCount: number;
  private readonly offsets: number[];
  private readonly durations: number[];
  private elapsedMs = 0;
  private playing = false;

  constructor(steps: readonly TimelineStep[]) {
    this.offsets = [];
    this.durations = [];
    let offset = 0;

    for (const step of steps) {
      if (!Number.isFinite(step.durationMs) || step.durationMs <= 0) {
        throw new RangeError(`Step "${step.id}" must have a positive duration.`);
      }
      this.offsets.push(offset);
      this.durations.push(step.durationMs);
      offset += step.durationMs;
      if (!Number.isSafeInteger(Math.ceil(offset))) {
        throw new RangeError('The total guide duration exceeds the supported limit.');
      }
    }

    this.totalMs = offset;
    this.stepCount = steps.length;
  }

  get snapshot(): TimelineSnapshot {
    const stepIndex = this.findStep(this.elapsedMs);
    const stepOffset = this.offsets[stepIndex] ?? 0;
    const duration = this.durations[stepIndex] ?? 0;
    const stepElapsedMs = Math.max(0, this.elapsedMs - stepOffset);

    return {
      elapsedMs: this.elapsedMs,
      totalMs: this.totalMs,
      progress: this.totalMs === 0 ? 0 : this.elapsedMs / this.totalMs,
      stepIndex,
      stepElapsedMs,
      stepProgress: duration === 0 ? 0 : Math.min(1, stepElapsedMs / duration),
      playing: this.playing,
      ended: this.totalMs > 0 && this.elapsedMs >= this.totalMs,
    };
  }

  play(): TimelineSnapshot {
    if (this.totalMs === 0) return this.snapshot;
    if (this.elapsedMs >= this.totalMs) this.elapsedMs = 0;
    this.playing = true;
    return this.snapshot;
  }

  pause(): TimelineSnapshot {
    this.playing = false;
    return this.snapshot;
  }

  seek(elapsedMs: number): TimelineSnapshot {
    if (!Number.isFinite(elapsedMs)) {
      throw new RangeError('The playback position must be a finite number.');
    }
    this.elapsedMs = Math.min(this.totalMs, Math.max(0, elapsedMs));
    if (this.elapsedMs >= this.totalMs) this.playing = false;
    return this.snapshot;
  }

  advance(deltaMs: number): TimelineSnapshot {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError('The elapsed time must be zero or positive.');
    }
    if (!this.playing) return this.snapshot;
    return this.seek(this.elapsedMs + deltaMs);
  }

  goToStep(index: number): TimelineSnapshot {
    if (!Number.isInteger(index)) {
      throw new RangeError('The step index must be an integer.');
    }
    if (this.stepCount === 0) return this.snapshot;
    const boundedIndex = Math.min(this.stepCount - 1, Math.max(0, index));
    return this.seek(this.offsets[boundedIndex] ?? 0);
  }

  next(): TimelineSnapshot {
    return this.goToStep(this.snapshot.stepIndex + 1);
  }

  previous(): TimelineSnapshot {
    return this.goToStep(this.snapshot.stepIndex - 1);
  }

  private findStep(elapsedMs: number): number {
    if (this.stepCount === 0) return -1;
    let low = 0;
    let high = this.stepCount - 1;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((this.offsets[middle] ?? 0) <= elapsedMs) low = middle;
      else high = middle - 1;
    }

    return low;
  }
}
