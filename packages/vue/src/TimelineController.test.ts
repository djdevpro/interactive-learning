import { describe, expect, it } from 'vitest';
import { TimelineController } from './TimelineController';

const steps = [
  { id: 'first', durationMs: 2_000 },
  { id: 'second', durationMs: 3_000 },
  { id: 'third', durationMs: 1_000 },
];

describe('TimelineController', () => {
  it('seeks backwards while paused without replaying prior actions', () => {
    const timeline = new TimelineController(steps);
    timeline.seek(5_500);
    const state = timeline.seek(2_750);
    expect(state).toMatchObject({
      playing: false,
      stepIndex: 1,
      elapsedMs: 2_750,
      stepElapsedMs: 750,
      stepProgress: 0.25,
    });
  });

  it('selects the following step at an exact boundary', () => {
    const timeline = new TimelineController(steps);
    expect(timeline.seek(2_000)).toMatchObject({ stepIndex: 1, stepElapsedMs: 0 });
    expect(timeline.seek(5_000)).toMatchObject({ stepIndex: 2, stepElapsedMs: 0 });
  });

  it('stops at the end and keeps the final frame available', () => {
    const timeline = new TimelineController(steps);
    timeline.play();
    expect(timeline.advance(9_000)).toMatchObject({
      elapsedMs: 6_000,
      totalMs: 6_000,
      ended: true,
      playing: false,
      stepIndex: 2,
      stepProgress: 1,
    });
  });

  it('starts a fresh playback when play is called after the end', () => {
    const timeline = new TimelineController(steps);
    timeline.seek(6_000);
    expect(timeline.play()).toMatchObject({
      elapsedMs: 0,
      stepIndex: 0,
      playing: true,
      ended: false,
    });
    expect(timeline.advance(250).elapsedMs).toBe(250);
  });

  it('does not advance a paused timeline and resumes from its position', () => {
    const timeline = new TimelineController(steps);
    timeline.play();
    timeline.advance(1_000);
    timeline.pause();
    expect(timeline.advance(5_000).elapsedMs).toBe(1_000);
    timeline.play();
    expect(timeline.advance(500).elapsedMs).toBe(1_500);
  });

  it('keeps multiple guide instances independent', () => {
    const first = new TimelineController(steps);
    const second = new TimelineController(steps);
    first.play();
    first.advance(3_000);
    expect(second.snapshot).toMatchObject({ elapsedMs: 0, playing: false, stepIndex: 0 });
  });

  it('navigates steps and bounds seeks to the duration', () => {
    const timeline = new TimelineController(steps);
    timeline.next();
    expect(timeline.snapshot.elapsedMs).toBe(2_000);
    timeline.next();
    timeline.previous();
    expect(timeline.snapshot.stepIndex).toBe(1);
    expect(timeline.seek(-100).elapsedMs).toBe(0);
    expect(timeline.seek(100_000).elapsedMs).toBe(6_000);
  });

  it('represents an empty guide without a playable or ended state', () => {
    const timeline = new TimelineController([]);
    expect(timeline.play()).toMatchObject({
      totalMs: 0,
      stepIndex: -1,
      playing: false,
      ended: false,
      progress: 0,
    });
    expect(timeline.next().stepIndex).toBe(-1);
  });

  it('rejects invalid durations and clock values', () => {
    expect(() => new TimelineController([{ id: 'broken', durationMs: 0 }])).toThrow(RangeError);
    const timeline = new TimelineController(steps);
    expect(() => timeline.seek(Number.NaN)).toThrow(RangeError);
    expect(() => timeline.advance(-1)).toThrow(RangeError);
  });
});
