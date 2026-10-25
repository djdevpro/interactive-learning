import { describe, expect, it } from 'vitest';
import { createGuide, validateGuide, type GuideStep } from '@interactive-learning/protocol';
import { applyStepDraft, markerNumber, markerSummary, withoutUnusedAssets } from './draft';

const step: GuideStep = {
  id: 'step-1',
  title: 'Open',
  description: 'Keep me',
  durationMs: 2500,
  assetId: 'asset-1',
  cursor: { x: 0.1, y: 0.1, action: 'click' },
  annotations: [],
  source: { capturedAt: '2026-10-25T00:00:00.000Z', url: 'https://demo.test/a', reason: 'click' },
};

describe('step drafts', () => {
  it('applies markers, cursor, texts and address, and keeps the rest', () => {
    const edited = applyStepDraft(step, {
      title: 'Open the form',
      description: 'Keep me',
      cursor: { x: 0.5, y: 0.5, action: 'click' },
      annotations: [{ id: 'm1', x: 0.5, y: 0.5, title: 'Here', body: '' }],
      url: 'https://demo.test/#/form',
    });
    expect(edited).toMatchObject({
      id: 'step-1',
      durationMs: 2500,
      title: 'Open the form',
      cursor: { x: 0.5, y: 0.5 },
      source: { url: 'https://demo.test/#/form', reason: 'click' },
    });
  });

  it('removes the cursor and the address when the draft clears them', () => {
    const edited = applyStepDraft(step, {
      title: 'Open',
      description: '',
      cursor: null,
      annotations: [],
      url: '',
    });
    expect(edited.cursor).toBeUndefined();
    expect(edited.source).toEqual({ capturedAt: '2026-10-25T00:00:00.000Z', reason: 'click' });
  });

  it('keeps the address when the draft does not mention it', () => {
    const edited = applyStepDraft(step, {
      title: 'Open',
      description: '',
      cursor: null,
      annotations: [],
    });
    expect(edited.source?.url).toBe('https://demo.test/a');
  });

  it('numbers markers across steps and summarizes them', () => {
    const steps = [
      { ...step, annotations: [{ id: 'a', x: 0, y: 0, title: 'A', body: '' }] },
      { ...step, id: 'step-2', cursor: undefined },
      step,
    ];
    expect(markerNumber(steps, 0)).toBe(1);
    expect(markerNumber(steps, 2)).toBe(2);
    expect(steps.map(markerSummary)).toEqual(['1 marker', 'No marker yet', '1 marker']);
  });

  it('drops images that no step shows', () => {
    const guide = createGuide('Assets');
    const image = { src: 'assets/a.png', mimeType: 'image/png' as const, width: 1, height: 1 };
    guide.assets.push(
      { id: 'asset-1', ...image },
      { id: 'asset-2', ...image, src: 'assets/b.png' },
    );
    guide.steps.push(step);
    expect(withoutUnusedAssets(validateGuide(guide)).assets.map(({ id }) => id)).toEqual([
      'asset-1',
    ]);
  });
});
