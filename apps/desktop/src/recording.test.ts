import { describe, expect, it } from 'vitest';
import { createGuide, validateGuide } from '@interactive-learning/protocol';
import { clickStep, screenStep, visiblePart, type Baseline, type Observation } from './recording';

const png = 'data:image/webp;base64,UklGRhYAAABXRUJQVlA4TAoAAAAvAAAAAAfQ//73vw==';

function baseline(src = png, id = 'asset_first'): Baseline {
  return {
    asset: { id, src, mimeType: 'image/webp', width: 1280, height: 4000 },
    page: { width: 1280, height: 4000 },
    url: 'https://shop.test/billing?tab=2',
    title: 'Billing',
    view: { x: 0, y: 0, width: 1280, height: 800 },
  };
}

function click(scrollY: number, label = 'Show the invoice'): Observation {
  return {
    type: 'click',
    url: 'https://shop.test/billing?tab=2',
    title: 'Billing',
    revision: 4,
    scroll: { x: 0, y: scrollY },
    viewport: { width: 1280, height: 800 },
    page: { width: 1280, height: 4000 },
    point: { x: 640, y: 400 },
    label,
  };
}

describe('recording a walkthrough', () => {
  it('turns a click into a step scrolled like the page, with a cursor and a named marker', () => {
    const guide = clickStep(createGuide('Billing'), baseline(), click(1200));
    const [step] = guide.steps;
    expect(step).toMatchObject({
      title: 'Click “Show the invoice”',
      viewport: { x: 0, y: 0.3, width: 1, height: 0.2 },
      cursor: { x: 0.5, y: 0.4, action: 'click' },
      source: { url: 'https://shop.test/billing', reason: 'click', scroll: { x: 0, y: 1200 } },
    });
    expect(step?.annotations[0]).toMatchObject({ x: 0.5, y: 0.4, title: 'Show the invoice' });
    expect(() => validateGuide(guide)).not.toThrow();
  });

  it('reuses the screenshot of an unchanged page, so the player scrolls between the steps', () => {
    let guide = clickStep(createGuide('Billing'), baseline(), click(0));
    guide = clickStep(guide, baseline(), click(2400, ''));
    expect(guide.assets).toHaveLength(1);
    expect(guide.steps[1]).toMatchObject({ title: 'Click here', viewport: { y: 0.6 } });
    expect(guide.steps[1]?.transition).toBeUndefined();
    // The scroll comes before the marker, so the step lasts longer than the first one.
    expect(guide.steps.map((step) => step.durationMs)).toEqual([3000, 4000]);
  });

  it('fades to a new screenshot and keeps a manual capture without cursor', () => {
    let guide = clickStep(createGuide('Billing'), baseline(), click(0));
    guide = screenStep(guide, baseline(png.replace('vw==', 'vwAA'), 'asset_second'));
    expect(guide.steps[1]).toMatchObject({ title: 'Billing', transition: 'fade' });
    expect(guide.steps[1]?.cursor).toBeUndefined();
  });

  it('keeps the visible part inside the page when the window is taller than the page', () => {
    expect(
      visiblePart({ width: 1280, height: 600 }, { x: 0, y: 50 }, { width: 1280, height: 800 }),
    ).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});
