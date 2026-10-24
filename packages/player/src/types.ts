import type { GuideDocument, GuideStep } from '@interactive-learning/protocol';

export type { GuideDocument, GuideStep } from '@interactive-learning/protocol';

export interface PlayerControls {
  play(): void;
  pause(): void;
  seek(elapsedMs: number): void;
  goToStep(index: number): void;
  seekToStep(index: number): void;
}

export interface InteractiveLearningElement extends HTMLElement, PlayerControls {
  guide: GuideDocument | undefined;
  src: string;
  assetBaseUrl: string;
  showInformation: boolean;
  addEventListener<K extends keyof PlayerEventMap>(
    type: K,
    listener: (this: InteractiveLearningElement, event: PlayerEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

export interface PlayerEventMap {
  'step-change': CustomEvent<{ index: number; step: GuideStep }>;
  'information-change': CustomEvent<{ visible: boolean }>;
  'guide-load': CustomEvent<{ guide: GuideDocument }>;
  'guide-error': CustomEvent<{ message: string }>;
}

export type InteractiveLearningConstructor = new () => InteractiveLearningElement;

declare global {
  interface HTMLElementTagNameMap {
    'interactive-learning': InteractiveLearningElement;
  }
}
