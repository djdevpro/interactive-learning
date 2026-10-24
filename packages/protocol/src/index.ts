export * from './types';
export * from './validation';
import { SCHEMA_VERSION, type GuideDocument } from './types';

export function createGuide(title: string, description = ''): GuideDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    title: title.trim() || 'Mon guide interactif',
    description,
    createdAt: now,
    updatedAt: now,
    assets: [],
    steps: [],
  };
}

export function sanitizeSourceUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    return url.origin + url.pathname;
  } catch {
    return undefined;
  }
}
