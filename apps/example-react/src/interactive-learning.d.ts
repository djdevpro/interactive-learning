import type { HTMLAttributes, RefAttributes } from 'react';
import type {
  InteractiveLearningElement,
  InteractiveLearningProps,
} from '@interactive-learning/player';

// React 19 assigns these as element properties and binds `on<event>` props as DOM listeners.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'interactive-learning': HTMLAttributes<InteractiveLearningElement> &
        RefAttributes<InteractiveLearningElement> &
        InteractiveLearningProps;
    }
  }
}
