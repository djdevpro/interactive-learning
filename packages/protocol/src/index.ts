export * from './types';
export * from './validation';
export * from './zip';
import { SCHEMA_VERSION, type GuideDocument } from './types';

export function createGuide(title: string, description = ''): GuideDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    title: title.trim() || 'Interactive guide',
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
    // Hash routers keep the page in the fragment: keep that route, never its query or tokens.
    const route = /^#!?\/[^?&#=]*/.exec(url.hash)?.[0] ?? '';
    return url.origin + url.pathname + route;
  } catch {
    return undefined;
  }
}
