/** `system` follows the operating system preference until the viewer picks light or dark. */
export type GuideTheme = 'light' | 'dark' | 'system';

/** The theme actually displayed, once `system` is resolved. */
export type GuideColorScheme = 'light' | 'dark';
