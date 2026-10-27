import { describe, expect, it } from 'vitest';
import { createGuide, type GuideDocument, type GuideStep } from '@interactive-learning/protocol';
import {
  addMarker,
  clampDuration,
  duplicateStep,
  moveMarker,
  moveStep,
  removeMarker,
  removeStep,
  scrollTo,
  seconds,
  stepIndexAt,
  stepStarts,
} from './editing';

function step(id: string, durationMs = 3000, assetId = 'shot'): GuideStep {
  return { id, title: id, description: '', durationMs, assetId, annotations: [] };
}

function guide(...steps: GuideStep[]): GuideDocument {
  const assets = [...new Set(steps.map((entry) => entry.assetId))].map((id) => ({
    id,
    src: `assets/${id}.webp`,
    mimeType: 'image/webp' as const,
    width: 1280,
    height: 4000,
  }));
  return { ...createGuide('Billing'), assets, steps };
}

describe('editing a tutorial', () => {
  it('places each step on the timeline and finds the step playing at a moment', () => {
    const tour = guide(step('a', 3000), step('b', 4000), step('c', 2500));
    expect(stepStarts(tour)).toEqual({ starts: [0, 3000, 7000], total: 9500 });
    expect(stepIndexAt(tour, 0)).toBe(0);
    expect(stepIndexAt(tour, 6999)).toBe(1);
    expect(stepIndexAt(tour, 9000)).toBe(2);
  });

  it('reorders, duplicates and removes steps, dropping images no step shows', () => {
    const tour = guide(step('a'), step('b', 3000, 'other'), step('c'));
    expect(moveStep(tour, 0, 2).steps.map((entry) => entry.id)).toEqual(['b', 'c', 'a']);
    const copied = duplicateStep(tour, 'b');
    expect(copied.steps).toHaveLength(4);
    expect(copied.steps[2]?.assetId).toBe('other');
    expect(copied.steps[2]?.id).not.toBe('b');
    expect(removeStep(tour, 'b').assets.map((asset) => asset.id)).toEqual(['shot']);
  });

  it('keeps the cursor on the first marker as markers are added, moved and removed', () => {
    const first = addMarker(step('a'), { x: 0.2, y: 0.3 });
    expect(first.step.cursor).toEqual({ x: 0.2, y: 0.3, action: 'click' });
    const second = addMarker(first.step, { x: 0.8, y: 0.9 });
    const moved = moveMarker(second.step, first.id, { x: 0.25, y: 0.35 });
    expect(moved.cursor).toMatchObject({ x: 0.25, y: 0.35 });
    const removed = removeMarker(moved, first.id);
    expect(removed.cursor).toMatchObject({ x: 0.8, y: 0.9 });
    expect(removeMarker(removed, second.id).cursor).toBeUndefined();
  });

  it('keeps the visible part inside the page and reads times as people say them', () => {
    const tall = { ...step('a'), viewport: { x: 0, y: 0.1, width: 1, height: 0.25 } };
    expect(scrollTo(tall, 0.9).viewport?.y).toBe(0.75);
    expect(scrollTo(tall, null).viewport).toBeUndefined();
    expect(clampDuration(120)).toBe(1000);
    expect(clampDuration(4049)).toBe(4000);
    expect(seconds(4000)).toBe('4 s');
    expect(seconds(4500)).toBe('4.5 s');
  });
});
