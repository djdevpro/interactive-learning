import { describe, expect, it } from 'vitest';
import { createGuide, type GuideDocument } from '@interactive-learning/protocol';
import { describeGuide, markerAt, pointOf, pointedStep, stepAt } from './steps';
import type { Capture } from '../recording';

const capture: Capture = {
  src: 'assets/0123456789abcdef.webp',
  image: { width: 1280, height: 3200 },
  url: 'https://app.example.com/billing?token=secret',
  title: 'Billing',
  page: { width: 1280, height: 3200 },
  view: { x: 0, y: 800, width: 1280, height: 800 },
};

function guideWithStep(): GuideDocument {
  return pointedStep(createGuide('Pay an invoice'), capture, null, { title: 'Open billing' });
}

describe('steps an agent names', () => {
  it('finds steps and markers by their number, from 1', () => {
    const guide = guideWithStep();
    expect(stepAt(guide, 1).index).toBe(0);
    expect(() => stepAt(guide, 2)).toThrow('There is no step 2. The tutorial has 1 steps');
    expect(() => stepAt(createGuide('Empty'), 1)).toThrow('no step yet');
    expect(() => markerAt(guide.steps[0]!, 1, 1)).toThrow('Step 1 has no marker.');
  });

  it('takes positions from 0 to 1 only', () => {
    expect(pointOf(0.25, '0.5')).toEqual({ x: 0.25, y: 0.5 });
    expect(() => pointOf(1.2, 0.5)).toThrow('from 0 to 1');
    expect(() => pointOf('left', 0.5)).toThrow('from 0 to 1');
  });
});

describe('a step captured by an agent', () => {
  it('shows the part of the page on screen, with its texts', () => {
    const guide = guideWithStep();
    const step = guide.steps[0]!;
    expect(step.title).toBe('Open billing');
    expect(step.viewport).toEqual({ x: 0, y: 0.25, width: 1, height: 0.25 });
    expect(step.annotations).toEqual([]);
    expect(step.cursor).toBeUndefined();
    expect(step.source?.url).toBe('https://app.example.com/billing');
    expect(guide.assets).toHaveLength(1);
  });

  it('points a marker and the cursor at an element of the window', () => {
    const guide = pointedStep(
      createGuide('Pay'),
      capture,
      { x: 640, y: 200 },
      {
        markerTitle: 'Pay now',
        markerText: 'Opens the payment form.',
      },
    );
    const step = guide.steps[0]!;
    // 200 px down the window, which shows the page from 800 px: 1000 px of 3200.
    expect(step.annotations[0]).toMatchObject({ x: 0.5, y: 0.3125, title: 'Pay now' });
    expect(step.cursor).toEqual({ x: 0.5, y: 0.3125, action: 'move' });
    expect(step.title).toBe('Billing');
  });

  it('reads back as an agent reads a tutorial', () => {
    const described = describeGuide(guideWithStep(), 'Demo/Billing/pay-an-invoice');
    expect(described.tutorial).toBe('Demo/Billing/pay-an-invoice');
    expect(described.steps[0]).toMatchObject({
      number: 1,
      title: 'Open billing',
      page: 'https://app.example.com/billing',
      screenshot: { width: 1280, height: 3200 },
      markers: [],
    });
  });
});
