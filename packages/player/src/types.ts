import type { GuideDocument, GuideStep } from '@interactive-learning/protocol';
import type { InteractiveLearningElement } from './InteractiveLearningElement';
import type { PlayerMessages } from './messages';
import type { GuideTheme } from './theme';

export type { GuideDocument, GuideStep } from '@interactive-learning/protocol';

export interface PlayerControls {
  play(): void;
  pause(): void;
  seek(elapsedMs: number): void;
  goToStep(index: number): void;
  seekToStep(index: number): void;
}

export interface PlayerProperties {
  /** Validated guide object. Takes precedence over `src`. Replace it to reload; never mutate it. */
  guide: GuideDocument | undefined;
  /** URL of a guide JSON. Relative images resolve from its final URL. */
  src: string;
  /** Prefix for relative image references; overrides the one derived from `src`. */
  assetBaseUrl: string;
  /** Shows the guide and step titles and descriptions, hidden by default. */
  showInformation: boolean;
  /** `light`, `dark` or `system` (default). The bulb button switches between light and dark. */
  theme: GuideTheme;
  /** Replaces any built-in text. The language follows the `lang` attribute, then English. */
  messages: Partial<PlayerMessages> | undefined;
}

export interface PlayerEventMap {
  'step-change': CustomEvent<{ index: number; step: GuideStep }>;
  'theme-change': CustomEvent<{ theme: GuideTheme }>;
  'guide-load': CustomEvent<{ guide: GuideDocument }>;
  'guide-error': CustomEvent<{ message: string }>;
}

/**
 * Framework-neutral description of `<interactive-learning>` for template type checking:
 * JavaScript properties plus one `on<event>` listener per player event, the convention used by
 * React 19 and Svelte 5 for custom elements. Merge it into the framework's element typings.
 */
export type InteractiveLearningProps = Partial<PlayerProperties> & {
  [K in keyof PlayerEventMap as `on${K}`]?: (event: PlayerEventMap[K]) => void;
};

export type InteractiveLearningConstructor = typeof InteractiveLearningElement;
