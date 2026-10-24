<script lang="ts">
  import { onMount } from 'svelte';
  import { registerInteractiveLearning } from '@interactive-learning/player';
  import type {
    GuideDocument,
    GuideStep,
    InteractiveLearningElement,
  } from '@interactive-learning/player';

  interface Props {
    guide?: GuideDocument;
    src?: string;
    assetBaseUrl?: string;
    showInformation?: boolean;
    id?: string;
    class?: string;
    style?: string;
    onStepChange?: (index: number, step: GuideStep) => void;
    onInformationChange?: (visible: boolean) => void;
    onGuideLoad?: (guide: GuideDocument) => void;
    onGuideError?: (message: string) => void;
  }

  let {
    guide,
    src = '',
    assetBaseUrl = '',
    showInformation = $bindable(false),
    id,
    class: className,
    style,
    onStepChange,
    onInformationChange,
    onGuideLoad,
    onGuideError,
  }: Props = $props();

  let element: HTMLElement;
  let ready = $state(false);
  const player = () => element as InteractiveLearningElement;

  onMount(() => {
    registerInteractiveLearning();
    const target = player();
    const stepChanged = (event: Event) => {
      const { index, step } = (event as CustomEvent<{ index: number; step: GuideStep }>).detail;
      onStepChange?.(index, step);
    };
    const informationChanged = (event: Event) => {
      showInformation = (event as CustomEvent<{ visible: boolean }>).detail.visible;
      onInformationChange?.(showInformation);
    };
    const guideLoaded = (event: Event) => {
      onGuideLoad?.((event as CustomEvent<{ guide: GuideDocument }>).detail.guide);
    };
    const guideFailed = (event: Event) => {
      onGuideError?.((event as CustomEvent<{ message: string }>).detail.message);
    };

    target.addEventListener('step-change', stepChanged);
    target.addEventListener('information-change', informationChanged);
    target.addEventListener('guide-load', guideLoaded);
    target.addEventListener('guide-error', guideFailed);
    ready = true;
    return () => {
      target.removeEventListener('step-change', stepChanged);
      target.removeEventListener('information-change', informationChanged);
      target.removeEventListener('guide-load', guideLoaded);
      target.removeEventListener('guide-error', guideFailed);
    };
  });

  $effect(() => {
    if (!ready) return;
    const target = player();
    target.guide = guide;
    target.src = src;
    target.assetBaseUrl = assetBaseUrl;
  });

  $effect(() => {
    if (ready) player().showInformation = showInformation;
  });

  export function play(): void {
    player()?.play();
  }
  export function pause(): void {
    player()?.pause();
  }
  export function seek(milliseconds: number): void {
    player()?.seek(milliseconds);
  }
  export function goToStep(index: number): void {
    player()?.goToStep(index);
  }
  export function seekToStep(index: number): void {
    player()?.seekToStep(index);
  }
</script>

<interactive-learning bind:this={element} {id} class={className} {style}></interactive-learning>
