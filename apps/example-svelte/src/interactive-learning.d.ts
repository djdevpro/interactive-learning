import type { HTMLAttributes } from 'svelte/elements';
import type {
  InteractiveLearningElement,
  InteractiveLearningProps,
} from '@interactive-learning/player';

// Svelte 5 assigns these as element properties and binds `on<event>` attributes as DOM listeners.
declare module 'svelte/elements' {
  export interface SvelteHTMLElements {
    'interactive-learning': HTMLAttributes<InteractiveLearningElement> & InteractiveLearningProps;
  }
}
