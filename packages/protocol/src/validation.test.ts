import { describe, it, expect } from 'vitest';
import { createGuide, validateGuide, isSafeAssetSource, sanitizeSourceUrl } from './index';

function fixture() {
  const guide = createGuide('Un parcours');
  guide.assets.push({
    id: 'a1',
    src: 'assets/screen.png',
    width: 1200,
    height: 800,
    mimeType: 'image/png',
  });
  guide.steps.push({
    id: 's1',
    assetId: 'a1',
    title: 'Créer un dossier',
    description: 'Cliquez sur Ajouter.',
    durationMs: 4000,
    annotations: [],
    cursor: { x: 0.25, y: 0.5 },
  });
  return guide;
}
describe('guide contract', () => {
  it('round trips a standalone JSON document', () => {
    const guide = fixture();
    expect(validateGuide(JSON.parse(JSON.stringify(guide)))).toEqual(guide);
  });
  it('allows a new recording without screenshots yet', () =>
    expect(validateGuide(createGuide('Nouveau')).steps).toEqual([]));
  it('rejects an unsupported version instead of guessing a migration', () =>
    expect(() => validateGuide({ ...fixture(), schemaVersion: '2.0.0' })).toThrow(/version/));
  it('rejects dangling references and duplicate steps', () => {
    const guide = fixture();
    guide.steps[0]!.assetId = 'missing';
    expect(() => validateGuide(guide)).toThrow(/screenshot not found/);
    const duplicate = fixture();
    duplicate.steps.push({ ...duplicate.steps[0]! });
    expect(() => validateGuide(duplicate)).toThrow(/duplicate/);
  });
  it('requires finite normalized cursor and annotation coordinates', () => {
    for (const x of [-0.1, 1.1, NaN, Infinity]) {
      const guide = fixture();
      guide.steps[0]!.cursor!.x = x;
      expect(() => validateGuide(guide)).toThrow(/number/);
    }
  });
  it('rejects cursor actions that only become valid after string coercion', () => {
    for (const action of [['click'], ['move'], { toString: () => 'click' }]) {
      const guide = fixture();
      const cursor = guide.steps[0]!.cursor as unknown as Record<string, unknown>;
      cursor.action = action;
      expect(() => validateGuide(guide)).toThrow(/action/);
    }
  });
  it('rejects active content, remote resources and directory traversal', () => {
    for (const src of [
      'https://example.test/p.png',
      '//host/p.png',
      '../p.png',
      'assets/%2e%2e/p.png',
      'assets/%5cp.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'javascript:alert(1)',
      'C:\\x.png',
    ])
      expect(isSafeAssetSource(src)).toBe(false);
    expect(isSafeAssetSource('assets/a-123.png')).toBe(true);
    expect(isSafeAssetSource('data:image/png;base64,AAAA')).toBe(true);
  });
  it('rejects a mismatched embedded image MIME', () => {
    const guide = fixture();
    guide.assets[0]!.src = 'data:image/jpeg;base64,AAAA';
    expect(() => validateGuide(guide)).toThrow(/MIME/);
  });
  it('removes credentials, query strings and fragments from source URLs', () => {
    expect(sanitizeSourceUrl('https://user:password@example.test/form?token=secret#private')).toBe(
      'https://example.test/form',
    );
    expect(sanitizeSourceUrl('file:///private')).toBeUndefined();
  });
});
