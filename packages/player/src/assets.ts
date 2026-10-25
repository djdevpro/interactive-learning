/** Resolve a portable image reference without accessing window (SSR-safe). */
export function resolveAssetSource(src: string, baseUrl = ''): string {
  const source = src.trim();
  if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(source)) return source;
  if (/^(?:https?:|blob:)/i.test(source)) return source;
  if (/^[a-z][a-z\d+.-]*:/i.test(source)) return '';
  if (source.startsWith('//')) return '';
  if (!source || source.startsWith('/') || !baseUrl) return source;
  return `${baseUrl.replace(/\/+$/, '')}/${source.replace(/^\.\//, '')}`;
}
