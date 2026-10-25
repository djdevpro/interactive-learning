import { InteractiveLearningElement } from './InteractiveLearningElement';
import type { InteractiveLearningConstructor } from './types';

export { InteractiveLearningElement } from './InteractiveLearningElement';
export type * from './types';
export { playerMessages } from './messages';
export type { PlayerLocale, PlayerMessages } from './messages';
export type { GuideColorScheme, GuideTheme } from './theme';
export { TimelineController } from './TimelineController';
export type { TimelineSnapshot, TimelineStep } from './TimelineController';
export {
  createGuide,
  validateGuide,
  GuideValidationError,
  SCHEMA_VERSION,
} from '@interactive-learning/protocol';
export type {
  GuideAsset,
  GuideAnnotation,
  GuideCursor,
  CaptureContext,
  ImageMimeType,
  Point,
} from '@interactive-learning/protocol';

const tagName = 'interactive-learning';

/**
 * Defines `<interactive-learning>` once per page. Importing this module never touches the DOM.
 * `nonce` is applied to the styles of browsers without constructable stylesheets.
 */
export function registerInteractiveLearning(
  options: { nonce?: string } = {},
): InteractiveLearningConstructor {
  if (typeof customElements === 'undefined') {
    throw new Error('Register Interactive Learning in the browser.');
  }
  const registered = customElements.get(tagName);
  if (registered) return registered as InteractiveLearningConstructor;
  if (options.nonce) (globalThis as { litNonce?: string }).litNonce = options.nonce;
  customElements.define(tagName, InteractiveLearningElement);
  return InteractiveLearningElement;
}
