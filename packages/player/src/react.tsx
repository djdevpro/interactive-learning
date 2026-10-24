'use client';

import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { registerInteractiveLearning } from './index';
import type { GuideDocument, GuideStep, InteractiveLearningElement } from './types';

export interface InteractiveGuideProps extends Omit<
  HTMLAttributes<InteractiveLearningElement>,
  'children' | 'dangerouslySetInnerHTML'
> {
  guide?: GuideDocument;
  src?: string;
  assetBaseUrl?: string;
  /** Controlled visibility. Omit to let the information button manage its own state. */
  showInformation?: boolean;
  defaultShowInformation?: boolean;
  onStepChange?: (index: number, step: GuideStep) => void;
  onInformationChange?: (visible: boolean) => void;
  onGuideLoad?: (guide: GuideDocument) => void;
  onGuideError?: (message: string) => void;
}

/** A typed React bridge to the shared player, with no second rendering implementation. */
export const InteractiveGuide = forwardRef<InteractiveLearningElement, InteractiveGuideProps>(
  function InteractiveGuide(
    {
      guide,
      src = '',
      assetBaseUrl = '',
      showInformation,
      defaultShowInformation = false,
      onStepChange,
      onInformationChange,
      onGuideLoad,
      onGuideError,
      ...attributes
    },
    forwardedRef,
  ) {
    const element = useRef<InteractiveLearningElement>(null);
    const callbacks = useRef({ onStepChange, onInformationChange, onGuideLoad, onGuideError });
    callbacks.current = { onStepChange, onInformationChange, onGuideLoad, onGuideError };
    const [information, setInformation] = useState({ visible: defaultShowInformation });

    useImperativeHandle(forwardedRef, () => element.current!, []);

    useEffect(() => {
      registerInteractiveLearning();
      const player = element.current!;
      const stepChanged = (event: Event) => {
        const { index, step } = (event as CustomEvent<{ index: number; step: GuideStep }>).detail;
        callbacks.current.onStepChange?.(index, step);
      };
      const informationChanged = (event: Event) => {
        const { visible } = (event as CustomEvent<{ visible: boolean }>).detail;
        setInformation({ visible });
        callbacks.current.onInformationChange?.(visible);
      };
      const guideLoaded = (event: Event) => {
        callbacks.current.onGuideLoad?.(
          (event as CustomEvent<{ guide: GuideDocument }>).detail.guide,
        );
      };
      const guideFailed = (event: Event) => {
        callbacks.current.onGuideError?.(
          (event as CustomEvent<{ message: string }>).detail.message,
        );
      };

      player.addEventListener('step-change', stepChanged);
      player.addEventListener('information-change', informationChanged);
      player.addEventListener('guide-load', guideLoaded);
      player.addEventListener('guide-error', guideFailed);
      return () => {
        player.removeEventListener('step-change', stepChanged);
        player.removeEventListener('information-change', informationChanged);
        player.removeEventListener('guide-load', guideLoaded);
        player.removeEventListener('guide-error', guideFailed);
      };
    }, []);

    useEffect(() => {
      const player = element.current!;
      player.guide = guide;
      player.src = src;
      player.assetBaseUrl = assetBaseUrl;
    }, [guide, src, assetBaseUrl]);

    useEffect(() => {
      element.current!.showInformation = showInformation ?? information.visible;
    }, [showInformation, information]);

    return createElement('interactive-learning', { ...attributes, ref: element });
  },
);
