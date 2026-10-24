import { defineCustomElement } from 'vue';
import ElementHost from './ElementHost.vue';
import playerStyles from '../../vue/src/style.css?inline';
import type { InteractiveLearningConstructor } from './types';

export type * from './types';
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
  Point,
} from '@interactive-learning/protocol';

const tagName = 'interactive-learning';
let elementConstructor: InteractiveLearningConstructor | undefined;

/** Explicit registration: importing this module on the server does not touch the DOM. */
export function registerInteractiveLearning(
  options: { nonce?: string } = {},
): InteractiveLearningConstructor {
  if (typeof customElements === 'undefined') {
    throw new Error('Register Interactive Learning in the browser, after mounting.');
  }
  const registered = customElements.get(tagName);
  if (registered) return registered as InteractiveLearningConstructor;
  elementConstructor ??= defineCustomElement(ElementHost, {
    styles: [
      ':host { display: block; min-width: 0; } .il-element-status { font: 14px/1.5 system-ui, sans-serif; }',
      playerStyles,
    ],
    ...(options.nonce ? { nonce: options.nonce } : {}),
  }) as unknown as InteractiveLearningConstructor;
  customElements.define(tagName, elementConstructor);
  return elementConstructor;
}
