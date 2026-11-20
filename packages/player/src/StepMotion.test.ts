import { describe, expect, it } from 'vitest';
import type { GuideAsset, GuideStep } from '@interactive-learning/protocol';
import { closeUp, frameOf, stepMotion, toStage } from './StepMotion';

const tall: GuideAsset = {
  id: 'page',
  src: 'assets/page.webp',
  mimeType: 'image/webp',
  width: 1280,
  height: 4000,
};
const other: GuideAsset = { ...tall, id: 'next', src: 'assets/next.webp' };

function step(fields: Partial<GuideStep>): GuideStep {
  return {
    id: crypto.randomUUID(),
    title: 'Step',
    description: '',
    durationMs: 3000,
    assetId: 'page',
    annotations: [],
    ...fields,
  };
}

const top = step({
  viewport: { x: 0, y: 0, width: 1, height: 0.2 },
  cursor: { x: 0.2, y: 0.05, action: 'click' },
});
const lower = step({
  viewport: { x: 0, y: 0.5, width: 1, height: 0.2 },
  cursor: { x: 0.8, y: 0.62, action: 'click' },
  annotations: [{ id: 'm', x: 0.8, y: 0.62, title: 'Pay', body: '' }],
});

const at = (elapsedMs: number, current = lower, asset = tall, reducedMotion = false) =>
  stepMotion({
    step: current,
    asset,
    previous: { step: top, asset: tall },
    elapsedMs,
    reducedMotion,
  });

describe('motion of a step', () => {
  it('scrolls from the previous part of the same page, then rests on its own', () => {
    expect(at(0).view.y).toBe(0);
    const halfway = at(500).view.y;
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(0.5);
    expect(at(1500).view.y).toBe(0.5);
    expect(at(0).previous).toBeNull();
  });

  it('keeps the cursor where it clicked while the page scrolls, then glides and clicks', () => {
    const start = at(0).cursor!;
    // Where the previous click was on screen: 0.05 of the image is a quarter of its view.
    expect(start.x).toBeCloseTo(0.2);
    expect(start.y).toBeCloseTo(0.25);
    expect(at(1000).cursor!.x).toBeCloseTo(0.2);
    const end = at(2900);
    expect(end.cursor!.x).toBeCloseTo(0.8);
    expect(end.cursor!.y).toBeCloseTo(toStage({ x: 0.8, y: 0.62 }, lower.viewport!).y);
    expect(end.markersVisible).toBe(true);
    expect(at(1000).markersVisible).toBe(false);
  });

  it('fades from another screenshot and swaps at once when asked to cut', () => {
    const next = step({ assetId: 'next', viewport: lower.viewport! });
    const blending = at(200, next, other);
    expect(blending.previous).toMatchObject({ assetId: 'page' });
    expect(blending.opacity).toBeGreaterThan(0);
    expect(blending.opacity).toBeLessThan(1);
    expect(at(800, next, other).previous).toBeNull();
    const cut = at(200, { ...next, transition: 'cut' }, other);
    expect(cut.previous).toBeNull();
    expect(cut.opacity).toBe(1);
  });

  it('changes a page in place before it scrolls, when both screenshots show that page', () => {
    const page = { capturedAt: '2026-10-27T10:00:00.000Z', url: 'https://app.test/billing' };
    const changed: GuideAsset = {
      ...tall,
      id: 'changed',
      src: 'assets/changed.webp',
      height: 5000,
    };
    const motion = (elapsedMs: number) =>
      stepMotion({
        step: step({ ...lower, assetId: 'changed', source: page }),
        asset: changed,
        previous: { step: { ...top, source: page }, asset: tall },
        elapsedMs,
        reducedMotion: false,
      });
    // The previous view, 0 to 800 pixels, is 0 to 0.16 of the taller screenshot.
    const fading = motion(200);
    expect(fading.view.y).toBe(0);
    expect(fading.view.height).toBeCloseTo(0.16);
    expect(fading.previous).toMatchObject({ assetId: 'page', view: top.viewport });
    const scrolling = motion(900);
    expect(scrolling.previous).toBeNull();
    expect(scrolling.view.y).toBeGreaterThan(0);
    expect(motion(2000).view).toEqual(lower.viewport);
  });

  it('shows the final frame at once when motion is reduced', () => {
    const still = at(0, lower, tall, true);
    expect(still.view.y).toBe(0.5);
    expect(still.cursor!.x).toBeCloseTo(0.8);
    expect(still.cursor!.ripple).toBeNull();
    expect(still.markersVisible).toBe(true);
  });

  it('shows the whole screenshot of a step without visible part', () => {
    const plain = stepMotion({
      step: step({ cursor: { x: 0.5, y: 0.5 } }),
      asset: tall,
      previous: undefined,
      elapsedMs: 0,
      reducedMotion: false,
    });
    expect(plain.view).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(plain.markersVisible).toBe(true);
  });
});

describe('framing of the camera', () => {
  const whole = { x: 0, y: 0, width: 1, height: 1 };
  const at = (x: number, y: number, marker?: { x: number; y: number }) =>
    step({
      cursor: { x, y, action: 'click' },
      annotations: marker ? [{ id: 'm', ...marker, title: 'Here', body: '' }] : [],
    });

  it('leaves the screen as it is when the action sits well', () => {
    expect(frameOf(at(0.5, 0.4, { x: 0.55, y: 0.4 }))).toEqual(whole);
  });

  it('closes in on action low on screen and lifts it toward the middle', () => {
    const low = at(0.3, 0.88, { x: 0.36, y: 0.88 });
    const frame = frameOf(low);
    expect(frame.width).toBeLessThan(1);
    expect(frame.width / frame.height).toBeCloseTo(1);
    // Against the bottom of the screenshot, never past it.
    expect(frame.y + frame.height).toBeCloseTo(1);
    expect(toStage(low.cursor!, frame).y).toBeLessThan(0.84);
  });

  it('does not move for action a hair off its place, as in a side menu', () => {
    expect(frameOf(at(0.06, 0.5, { x: 0.12, y: 0.5 }))).toEqual(whole);
  });

  it('never hides part of the action to frame the rest', () => {
    expect(frameOf(at(0.5, 0.06, { x: 0.5, y: 0.94 }))).toEqual(whole);
  });

  it('carries the cursor of a framed step from where the camera was', () => {
    const low = at(0.3, 0.88, { x: 0.36, y: 0.88 });
    const motion = stepMotion({
      step: low,
      asset: tall,
      previous: undefined,
      elapsedMs: 5000,
      reducedMotion: false,
    });
    expect(motion.view).toEqual(frameOf(low));
    expect(motion.cursor!.y).toBeCloseTo(toStage(low.cursor!, frameOf(low)).y);
  });
});

describe('zoom toward the click', () => {
  const screen: GuideAsset = { ...tall, height: 720 };
  const whole = { x: 0, y: 0, width: 1, height: 1 };
  const menu = step({
    durationMs: 4000,
    zoom: 2,
    cursor: { x: 0.1, y: 0.2, action: 'click' },
    annotations: [{ id: 'bank', x: 0.12, y: 0.2, title: 'Bank', body: '' }],
  });
  // No previous step: the pointer comes from the middle, 700 ms to the menu, then clicks.
  const at = (elapsedMs: number, current = menu, reducedMotion = false) =>
    stepMotion({ step: current, asset: screen, previous: undefined, elapsedMs, reducedMotion });

  it('closes in while the pointer ends its way, and clicks close', () => {
    expect(at(0).view).toEqual(whole);
    const closing = at(350).view;
    expect(closing.width).toBeGreaterThan(0.5);
    expect(closing.width).toBeLessThan(1);
    const close = at(1200);
    // Twice closer, against the top left corner, which the menu cannot leave.
    expect(close.view).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 });
    expect(close.cursor!.x).toBeCloseTo(0.2);
    expect(close.cursor!.y).toBeCloseTo(0.4);
    expect(at(800).cursor!.ripple).toBeCloseTo(0.2);
  });

  it('goes back to the view of the step before the markers appear', () => {
    expect(at(1200).markersVisible).toBe(false);
    expect(at(1900).view.width).toBeGreaterThan(0.5);
    const back = at(3000);
    expect(back.view).toEqual(whole);
    expect(back.cursor!.x).toBeCloseTo(0.1);
    expect(back.markersVisible).toBe(true);
    expect(back.target).toEqual({ x: 0.1, y: 0.2 });
  });

  it('stays still when motion is reduced, or when the step is too short to go back', () => {
    const still = at(1200, menu, true);
    expect(still.view).toEqual(whole);
    expect(still.markersVisible).toBe(true);
    const short = { ...menu, durationMs: 1200 };
    expect(at(600, short).view).toEqual(whole);
    expect(at(600, step({ durationMs: 4000, zoom: 2 })).view).toEqual(whole);
  });

  it('centers the point as far as the view allows', () => {
    expect(closeUp(whole, { x: 0.5, y: 0.5 }, 2)).toEqual({
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
    });
    expect(closeUp(whole, { x: 0.95, y: 0.9 }, 2)).toEqual({
      x: 0.5,
      y: 0.5,
      width: 0.5,
      height: 0.5,
    });
    const part = { x: 0, y: 0.5, width: 1, height: 0.2 };
    expect(closeUp(part, { x: 0.5, y: 0.51 }, 2)).toEqual({
      x: 0.25,
      y: 0.5,
      width: 0.5,
      height: 0.1,
    });
  });
});
