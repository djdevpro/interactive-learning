import { html, svg, type SVGTemplateResult, type TemplateResult } from 'lit';

export type IconName =
  | 'play'
  | 'pause'
  | 'previous'
  | 'next'
  | 'replay'
  | 'image'
  | 'check'
  | 'close'
  | 'expand'
  | 'contract'
  | 'bulb-light'
  | 'bulb-dark';

const line = (d: string, width = 1.8): SVGTemplateResult =>
  svg`<path d=${d} stroke="currentColor" stroke-width=${width} stroke-linecap="round" stroke-linejoin="round" />`;

const bulb = 'M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2v.2h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z';

const shapes: Record<IconName, SVGTemplateResult> = {
  play: svg`<path d="m9 5 11 7-11 7V5Z" fill="currentColor" />`,
  pause: line('M8 5v14M16 5v14', 4),
  previous: line('M6 5v14m13-14L9 12l10 7V5Z'),
  next: line('M18 5v14M5 5l10 7-10 7V5Z'),
  replay: line('M4.5 9a8 8 0 1 1-.2 5M4 4v5h5'),
  image: svg`<g stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="m3 16 5-5 5 5 3-3 5 5" />
    <circle cx="15.5" cy="8.5" r="1" />
  </g>`,
  check: line('m5 12 4 4L19 6', 2),
  close: line('m6 6 12 12M18 6 6 18', 1.7),
  expand: line('M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5'),
  contract: line('M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5'),
  // Lit for the light theme, unlit for the dark theme.
  'bulb-light': svg`<path d=${bulb} fill="currentColor" />${line(bulb, 1.7)}${line('M9.5 19h5M10.5 21.5h3', 1.7)}`,
  'bulb-dark': svg`${line(bulb, 1.7)}${line('M9.5 19h5M10.5 21.5h3', 1.7)}`,
};

export function icon(name: IconName, size = 20): TemplateResult {
  return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    ${shapes[name]}
  </svg>`;
}
