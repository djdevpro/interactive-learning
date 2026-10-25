import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { keyed } from 'lit/directives/keyed.js';
import { live } from 'lit/directives/live.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import {
  GuideValidationError,
  validateGuide,
  type GuideDocument,
  type GuideStep,
} from '@interactive-learning/protocol';
import playerStyles from './style.css?inline';
import { AnnotationLayout, type AnnotationMarker } from './AnnotationLayout';
import { resolveAssetSource } from './assets';
import { GuideSource, GuideSourceError } from './GuideSource';
import { icon } from './icons';
import { resolvePlayerMessages, type PlayerMessages } from './messages';
import type { GuideColorScheme, GuideTheme } from './theme';
import { TimelineController, type TimelineSnapshot } from './TimelineController';
import type { PlayerControls, PlayerEventMap, PlayerProperties } from './types';

const hostStyles = `:host { display: block; min-width: 0; }
:host([hidden]) { display: none; }
.il-element-status { font-size: 14px; line-height: 1.5; }`;

const themes: readonly GuideTheme[] = ['light', 'dark', 'system'];

/** Everything the template shows that is not a public property. */
interface View {
  guide: GuideDocument | undefined;
  resolvedBase: string;
  loading: boolean;
  failure: { cause: unknown } | undefined;
  snapshot: TimelineSnapshot;
  hasStarted: boolean;
  playbackRequested: boolean;
  playbackError: boolean;
  playbackRate: number;
  activeAnnotationId: string | null;
  tooltipStyle: Record<string, string>;
  imageStatus: 'loading' | 'ready' | 'error';
  imageRequest: number;
  viewport: { width: number; height: number; controlsHeight: number };
  controlsIdle: boolean;
  reducedMotion: boolean;
  systemDark: boolean;
  isFullscreen: boolean;
  fullscreenError: 'denied' | 'exit' | null;
}

interface Marker {
  annotation: GuideStep['annotations'][number];
  number: number;
  position: AnnotationMarker;
}

/** Player events bubble and cross the Shadow DOM boundary. Documented by `@fires` below. */
function playerEvent<K extends keyof PlayerEventMap>(
  type: K,
  detail: PlayerEventMap[K]['detail'],
): CustomEvent {
  return new CustomEvent(type, { detail, bubbles: true, composed: true });
}

function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Plays an interactive guide made of screenshots, a cursor and numbered markers.
 *
 * @tag interactive-learning
 * @fires step-change - The current step changed. `detail` holds `index` and `step`.
 * @fires theme-change - The viewer switched theme with the bulb button. `detail.theme` is `light` or `dark`.
 * @fires guide-load - The guide is ready and accepts commands. `detail.guide` is the validated guide.
 * @fires guide-error - The guide could not be loaded. `detail.message` is already translated.
 * @cssprop --il-accent - Markers, start button and progress line. Default `#2f3542`.
 * @cssprop --il-font - Font family. Defaults to the page font.
 * @cssprop --il-ink - Text color. Follows the theme by default.
 * @cssprop --il-muted - Secondary text color. Follows the theme by default.
 * @cssprop --il-paper - Background color. Follows the theme by default.
 * @cssprop --il-surface - Image placeholder and hover backgrounds. Follows the theme by default.
 * @cssprop --il-focus - Keyboard focus ring. Follows the theme by default.
 * @cssprop --il-radius - Corner radius. Default `0px`.
 */
export class InteractiveLearningElement
  extends LitElement
  implements PlayerProperties, PlayerControls
{
  static override styles = [unsafeCSS(hostStyles), unsafeCSS(playerStyles)];

  static override properties = {
    guide: { attribute: false },
    src: {},
    assetBaseUrl: { attribute: 'asset-base-url' },
    showInformation: { type: Boolean, attribute: 'show-information', reflect: true },
    showAddress: { type: Boolean, attribute: 'show-address', reflect: true },
    theme: { reflect: true },
    messages: { attribute: false },
  };

  /** The element follows its own `lang` attribute, like any HTML content. */
  static override get observedAttributes(): string[] {
    return [...super.observedAttributes, 'lang'];
  }

  /** Validated guide object. Takes precedence over `src`. Replace it to reload; never mutate it. */
  declare guide: GuideDocument | undefined;
  /** URL of a guide JSON. Relative images resolve from its final URL. */
  declare src: string;
  /** Prefix for relative image paths; overrides the one derived from `src`. */
  declare assetBaseUrl: string;
  /** Shows the guide and step titles and descriptions around the screenshot. */
  declare showInformation: boolean;
  /** Shows the address of the page of each step above the screenshot. The info button toggles it. */
  declare showAddress: boolean;
  /** `system` follows the operating system until the viewer picks light or dark. */
  declare theme: GuideTheme;
  /** Replaces any built-in text. The language follows the `lang` attribute, then English. */
  declare messages: Partial<PlayerMessages> | undefined;

  #view: View;
  #timeline = new TimelineController([]);
  #source = new GuideSource();
  #revision = 0;
  #reloadOnConnect = false;
  #imageSource: string | undefined;
  #animationFrame: number | undefined;
  #previousFrameTime: number | undefined;
  #idleTimer: ReturnType<typeof setTimeout> | undefined;
  #annotationTrigger: HTMLButtonElement | undefined;
  /** Playback that a marker interrupted resumes when its tooltip closes. */
  #resumeAfterTooltip = false;
  #observed: Element[] = [];
  #resizeObserver: ResizeObserver | undefined;
  #motionQuery: MediaQueryList | undefined;
  #schemeQuery: MediaQueryList | undefined;

  constructor() {
    super();
    this.guide = undefined;
    this.src = '';
    this.assetBaseUrl = '';
    this.showInformation = false;
    this.showAddress = false;
    this.theme = 'system';
    this.messages = undefined;
    this.#view = {
      guide: undefined,
      resolvedBase: '',
      loading: false,
      failure: undefined,
      snapshot: this.#timeline.snapshot,
      hasStarted: false,
      playbackRequested: false,
      playbackError: false,
      playbackRate: 1,
      activeAnnotationId: null,
      tooltipStyle: { visibility: 'hidden' },
      imageStatus: 'loading',
      imageRequest: 0,
      viewport: { width: 0, height: 0, controlsHeight: 48 },
      controlsIdle: false,
      reducedMotion: false,
      systemDark: false,
      isFullscreen: false,
      fullscreenError: null,
    };
  }

  // Public commands.

  play(): void {
    if (!this.#hasSteps || this.#view.imageStatus === 'error') return;
    this.#resumeAfterTooltip = false;
    this.#patch({ hasStarted: true, activeAnnotationId: null, playbackRequested: true });
    this.#revealControls();
    if (this.#view.snapshot.ended) {
      this.#timeline.seek(0);
      this.#syncState();
    }
    this.#resumeWhenReady();
  }

  pause(): void {
    this.#patch({ playbackRequested: false });
    this.#timeline.pause();
    this.#stopAnimation();
    this.#syncState();
  }

  seek(elapsedMs: number): void {
    this.#patch({ hasStarted: true, activeAnnotationId: null });
    this.#previousFrameTime = undefined;
    this.#timeline.seek(elapsedMs);
    this.#syncState();
    if (this.#view.snapshot.ended) this.#patch({ playbackRequested: false });
    this.#resumeWhenReady();
    if (!this.#view.snapshot.playing) this.#stopAnimation();
  }

  goToStep(index: number): void {
    this.#patch({ hasStarted: true, activeAnnotationId: null });
    this.#previousFrameTime = undefined;
    this.#timeline.goToStep(index);
    this.#syncState();
    this.#resumeWhenReady();
  }

  seekToStep(index: number): void {
    this.pause();
    this.goToStep(index);
  }

  // Lifecycle.

  override connectedCallback(): void {
    super.connectedCallback();
    if (typeof window === 'undefined') return;
    this.#motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.#schemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.#motionQuery.addEventListener('change', this.#onMotionChange);
    this.#schemeQuery.addEventListener('change', this.#onSchemeChange);
    this.#patch({
      reducedMotion: this.#motionQuery.matches,
      systemDark: this.#schemeQuery.matches,
    });
    this.#resizeObserver = new ResizeObserver(() => this.#updateLayout());
    document.addEventListener('visibilitychange', this.#onVisibilityChange);
    document.addEventListener('fullscreenchange', this.#onFullscreenChange);
    if (this.#reloadOnConnect) {
      this.#reloadOnConnect = false;
      void this.#load();
    }
    this.#resumeWhenReady();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#motionQuery?.removeEventListener('change', this.#onMotionChange);
    this.#schemeQuery?.removeEventListener('change', this.#onSchemeChange);
    this.#resizeObserver?.disconnect();
    this.#observed = [];
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
    document.removeEventListener('fullscreenchange', this.#onFullscreenChange);
    this.#stopAnimation();
    clearTimeout(this.#idleTimer);
    // A moved element reconnects synchronously and keeps its guide and position.
    queueMicrotask(() => {
      if (this.isConnected) return;
      if (this.#view.loading) {
        this.#revision++;
        this.#source.cancel();
        this.#reloadOnConnect = true;
      }
      if (this.#ownsFullscreen()) void document.exitFullscreen().catch(() => undefined);
    });
  }

  override attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    super.attributeChangedCallback(name, old, value);
    if (name === 'lang') this.requestUpdate();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('guide') || changed.has('src')) void this.#load();
    else if (changed.has('assetBaseUrl')) this.#syncImage();
  }

  protected override updated(): void {
    this.#observeLayout();
    this.#placeTooltip();
  }

  // Guide loading.

  async #load(): Promise<void> {
    const current = ++this.#revision;
    this.#source.cancel();
    this.#setGuide(undefined);
    this.#patch({ failure: undefined, loading: true });
    try {
      if (this.guide) {
        this.#patch({ resolvedBase: '' });
        this.#setGuide(validateGuide(this.guide));
      } else if (this.src) {
        const loaded = await this.#source.load(this.src, document.baseURI);
        if (current !== this.#revision) return;
        this.#patch({ resolvedBase: loaded.assetBaseUrl });
        this.#setGuide(loaded.guide);
      } else {
        return;
      }
      await this.updateComplete;
      const guide = this.#view.guide;
      if (current === this.#revision && guide) this.#emit('guide-load', { guide });
    } catch (cause) {
      if (current !== this.#revision) return;
      this.#patch({ failure: { cause } });
      this.#emit('guide-error', { message: this.#describe(cause, this.#text) });
    } finally {
      if (current === this.#revision) this.#patch({ loading: false });
    }
  }

  #setGuide(guide: GuideDocument | undefined): void {
    this.#stopAnimation();
    let playbackError = false;
    try {
      this.#timeline = new TimelineController(guide?.steps ?? []);
    } catch {
      this.#timeline = new TimelineController([]);
      playbackError = true;
    }
    this.#annotationTrigger = undefined;
    this.#patch({
      guide,
      snapshot: this.#timeline.snapshot,
      hasStarted: false,
      playbackRequested: false,
      playbackError,
      activeAnnotationId: null,
    });
    this.#imageSource = undefined;
    if (guide) this.#syncImage();
  }

  #describe(cause: unknown, text: PlayerMessages): string {
    if (cause instanceof GuideSourceError) {
      if (cause.reason === 'protocol') return text.guideUrlUnsupported;
      if (cause.reason === 'format') return text.guideNotJson;
      return text.guideLoadFailed(cause.status);
    }
    if (cause instanceof GuideValidationError) return text.guideInvalid(cause.path);
    return text.guideUnreadable;
  }

  // Playback.

  get #hasSteps(): boolean {
    return this.#view.snapshot.stepIndex >= 0 && !this.#view.playbackError;
  }

  get #currentStep(): GuideStep | undefined {
    return this.#view.guide?.steps[this.#view.snapshot.stepIndex];
  }

  get #currentAsset() {
    const assetId = this.#currentStep?.assetId;
    return this.#view.guide?.assets.find((asset) => asset.id === assetId);
  }

  #syncState(): void {
    const previous = this.#view.snapshot.stepIndex;
    this.#patch({ snapshot: this.#timeline.snapshot });
    const index = this.#view.snapshot.stepIndex;
    if (index !== previous) {
      this.#patch({ activeAnnotationId: null });
      this.#annotationTrigger = undefined;
      const step = this.#view.guide?.steps[index];
      if (step) this.#emit('step-change', { index, step });
    }
    this.#syncImage();
  }

  /** A new screenshot pauses the timeline until it has loaded, so no step is ever skipped. */
  #syncImage(): void {
    const source = resolveAssetSource(
      this.#currentAsset?.src ?? '',
      this.assetBaseUrl || this.#view.resolvedBase,
    );
    if (source === this.#imageSource) return;
    this.#imageSource = source;
    this.#timeline.pause();
    this.#stopAnimation();
    this.#patch({
      imageStatus: source ? 'loading' : 'error',
      imageRequest: this.#view.imageRequest + 1,
      snapshot: this.#timeline.snapshot,
      ...(source ? {} : { playbackRequested: false }),
    });
  }

  #retryImage(): void {
    this.#imageSource = undefined;
    this.#syncImage();
  }

  #isCurrentImage(event: Event): boolean {
    const image = event.currentTarget;
    return image instanceof HTMLImageElement && image.getAttribute('src') === this.#imageSource;
  }

  #onImageLoad = (event: Event): void => {
    if (!this.#isCurrentImage(event)) return;
    this.#patch({ imageStatus: 'ready' });
    this.#resumeWhenReady();
  };

  #onImageError = (event: Event): void => {
    if (!this.#isCurrentImage(event)) return;
    this.pause();
    this.#patch({ imageStatus: 'error' });
  };

  #stopAnimation(): void {
    if (this.#animationFrame !== undefined) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = undefined;
    this.#previousFrameTime = undefined;
  }

  #tick = (timestamp: number): void => {
    this.#animationFrame = undefined;
    if (!this.#view.snapshot.playing) return;
    if (this.#previousFrameTime !== undefined) {
      // Never skip an unseen screenshot after a slow frame: stop at the end of the step.
      const remaining = (this.#currentStep?.durationMs ?? 0) - this.#view.snapshot.stepElapsedMs;
      const elapsed = Math.max(0, timestamp - this.#previousFrameTime) * this.#view.playbackRate;
      this.#timeline.advance(Math.min(Math.max(0, remaining), elapsed));
    }
    this.#previousFrameTime = timestamp;
    this.#syncState();
    if (this.#view.snapshot.ended) this.#patch({ playbackRequested: false });
    if (this.#view.snapshot.playing) this.#animationFrame = requestAnimationFrame(this.#tick);
    else this.#previousFrameTime = undefined;
  };

  #resumeWhenReady(): void {
    const { playbackRequested, imageStatus, snapshot } = this.#view;
    if (!playbackRequested || imageStatus !== 'ready' || snapshot.ended || !this.isConnected)
      return;
    this.#stopAnimation();
    this.#timeline.play();
    this.#syncState();
    this.#animationFrame = requestAnimationFrame(this.#tick);
  }

  #togglePlayback(): void {
    if (this.#view.playbackRequested) this.pause();
    else this.play();
  }

  #cyclePlaybackRate(): void {
    const rate = this.#view.playbackRate;
    this.#patch({ playbackRate: rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1 });
    this.#previousFrameTime = undefined;
  }

  // Markers.

  get #markers(): Marker[] {
    const { guide, snapshot, viewport } = this.#view;
    if (!guide) return [];
    let first = 1;
    for (const step of guide.steps.slice(0, Math.max(0, snapshot.stepIndex))) {
      first += step.annotations.length;
    }
    return (this.#currentStep?.annotations ?? []).map((annotation, index) => ({
      annotation,
      number: first + index,
      position: AnnotationLayout.marker(annotation, viewport),
    }));
  }

  /** A marker pauses playback at once, so the screen does not change under the pointer. */
  #pauseForMarker(): void {
    if (this.#view.playbackRequested) this.#resumeAfterTooltip = true;
    this.pause();
  }

  #toggleAnnotation(id: string, event: MouseEvent): void {
    this.#pauseForMarker();
    if (this.#view.activeAnnotationId === id) {
      this.#closeAnnotation();
    } else {
      this.#annotationTrigger =
        event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : undefined;
      this.#patch({ activeAnnotationId: id, tooltipStyle: { visibility: 'hidden' } });
    }
  }

  #closeAnnotation(restoreFocus = false): void {
    if (this.#view.activeAnnotationId === null) return;
    this.#patch({ activeAnnotationId: null });
    if (restoreFocus) this.#annotationTrigger?.focus({ preventScroll: true });
    this.#annotationTrigger = undefined;
    if (this.#resumeAfterTooltip) this.play();
  }

  /** Measures the rendered tooltip, then keeps it inside the screenshot and off other markers. */
  #placeTooltip(): void {
    const canvas = this.renderRoot.querySelector<HTMLElement>('.il-guide__canvas');
    const tooltip = this.renderRoot.querySelector<HTMLElement>('.il-guide__tooltip');
    const markers = this.#markers;
    const marker = markers.find(
      ({ annotation }) => annotation.id === this.#view.activeAnnotationId,
    );
    if (!canvas || !tooltip || !marker) return;
    const place = AnnotationLayout.tooltip(
      marker.position,
      this.#view.viewport,
      { width: Math.min(280, Math.max(0, canvas.clientWidth - 24)), height: tooltip.scrollHeight },
      markers.map(({ position }) => position),
    );
    const style = {
      visibility: 'visible',
      left: `${place.left}px`,
      top: `${place.top}px`,
      maxHeight: `${place.maxHeight}px`,
    };
    if (JSON.stringify(style) !== JSON.stringify(this.#view.tooltipStyle)) {
      this.#patch({ tooltipStyle: style });
    }
  }

  // The arrow stops just below any marker it would cover, so markers stay readable and clickable.
  #cursorOffset(markers: Marker[]): number {
    const target = this.#currentStep?.cursor;
    const { width, height } = this.#view.viewport;
    if (!target || !width || !height) return 0;
    const radius = 12;
    const arrow = { left: target.x * width - 3, top: target.y * height, width: 22, height: 27 };
    let offset = 0;
    for (const { position } of markers) {
      const x = position.x * width;
      const y = position.y * height;
      const covers =
        x + radius > arrow.left &&
        x - radius < arrow.left + arrow.width &&
        y + radius > arrow.top &&
        y - radius < arrow.top + arrow.height;
      if (covers) offset = Math.max(offset, y + radius + 3 - arrow.top);
    }
    return offset;
  }

  #cursor() {
    const step = this.#currentStep;
    if (!step?.cursor) return null;
    const target = step.cursor;
    const { snapshot, reducedMotion } = this.#view;
    const from = target.from ?? { x: target.x, y: target.y };
    const moveDuration = Math.min(900, step.durationMs * 0.4);
    const fraction =
      reducedMotion || moveDuration === 0 ? 1 : Math.min(1, snapshot.stepElapsedMs / moveDuration);
    const eased = fraction * fraction * (3 - 2 * fraction);
    const pulse = (snapshot.stepElapsedMs - moveDuration) / 500;
    return {
      x: from.x + (target.x - from.x) * eased,
      y: from.y + (target.y - from.y) * eased,
      showPulse: !reducedMotion && target.action === 'click' && pulse >= 0 && pulse <= 1,
      pulseOpacity: Math.max(0, 1 - pulse),
      pulseScale: 0.5 + Math.max(0, pulse) * 1.8,
    };
  }

  // Layout, theme, controls and full screen.

  #observeLayout(): void {
    const elements = ['.il-guide__canvas', '.il-guide__player']
      .map((selector) => this.renderRoot.querySelector(selector))
      .filter((element): element is Element => element !== null);
    if (elements.every((element, index) => element === this.#observed[index])) return;
    this.#resizeObserver?.disconnect();
    for (const element of elements) this.#resizeObserver?.observe(element);
    this.#observed = elements;
    this.#updateLayout();
  }

  #updateLayout(): void {
    const canvas = this.renderRoot.querySelector<HTMLElement>('.il-guide__canvas');
    const player = this.renderRoot.querySelector<HTMLElement>('.il-guide__player');
    if (!canvas) return;
    const viewport = {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      controlsHeight: player?.clientHeight ?? 48,
    };
    const current = this.#view.viewport;
    if (
      viewport.width !== current.width ||
      viewport.height !== current.height ||
      viewport.controlsHeight !== current.controlsHeight
    ) {
      this.#patch({ viewport });
    }
  }

  get #colorScheme(): GuideColorScheme {
    const theme = themes.includes(this.theme) ? this.theme : 'system';
    if (theme !== 'system') return theme;
    return this.#view.systemDark ? 'dark' : 'light';
  }

  #toggleTheme(): void {
    const theme = this.#colorScheme === 'dark' ? 'light' : 'dark';
    this.theme = theme;
    this.#emit('theme-change', { theme });
  }

  // While playing, controls fade out after a moment without pointer activity to uncover the screenshot.
  #revealControls = (): void => {
    this.#patch({ controlsIdle: false });
    clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => this.#patch({ controlsIdle: true }), 2500);
  };

  #onPointerLeave = (event: PointerEvent): void => {
    // A finished touch also leaves the element; only a mouse leaving means the viewer looks away.
    if (event.pointerType !== 'mouse') return;
    clearTimeout(this.#idleTimer);
    this.#patch({ controlsIdle: true });
  };

  #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (this.#view.activeAnnotationId !== null) {
        event.preventDefault();
        this.#closeAnnotation(true);
      } else if (this.#view.isFullscreen) {
        event.preventDefault();
        void this.#toggleFullscreen();
      }
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('button, input, select, textarea, a, [contenteditable="true"]')
    ) {
      return;
    }
    if (!this.#hasSteps) return;
    const { stepIndex, totalMs } = this.#view.snapshot;
    const lastStep = (this.#view.guide?.steps.length ?? 1) - 1;
    const actions: Record<string, () => void> = {
      ' ': () => this.#togglePlayback(),
      k: () => this.#togglePlayback(),
      ArrowLeft: () => this.goToStep(Math.max(0, stepIndex - 1)),
      ArrowRight: () => this.goToStep(Math.min(lastStep, stepIndex + 1)),
      Home: () => this.seek(0),
      End: () => this.seek(totalMs),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  #onMotionChange = (event: MediaQueryListEvent): void => {
    this.#patch({ reducedMotion: event.matches });
  };

  #onSchemeChange = (event: MediaQueryListEvent): void => {
    this.#patch({ systemDark: event.matches });
  };

  #onVisibilityChange = (): void => {
    if (document.hidden && this.#view.playbackRequested) this.pause();
  };

  #ownsFullscreen(): boolean {
    const root = this.renderRoot.querySelector('.il-guide');
    if (!root) return false;
    const tree = root.getRootNode();
    // A document reports the shadow host, while the shadow root reports this player.
    return 'fullscreenElement' in tree && tree.fullscreenElement === root;
  }

  #onFullscreenChange = (): void => {
    this.#patch({ isFullscreen: this.#ownsFullscreen(), fullscreenError: null });
  };

  async #toggleFullscreen(): Promise<void> {
    this.#patch({ fullscreenError: null });
    try {
      if (this.#ownsFullscreen()) await document.exitFullscreen();
      else await this.renderRoot.querySelector('.il-guide')?.requestFullscreen();
    } catch {
      this.#patch({ fullscreenError: this.#view.isFullscreen ? 'exit' : 'denied' });
    }
  }

  // Helpers.

  get #locale(): string {
    return this.closest('[lang]')?.getAttribute('lang') || 'en';
  }

  get #text(): PlayerMessages {
    return resolvePlayerMessages(this.#locale, this.messages);
  }

  #patch(changes: Partial<View>): void {
    this.#view = { ...this.#view, ...changes };
    this.requestUpdate();
  }

  #emit<K extends keyof PlayerEventMap>(type: K, detail: PlayerEventMap[K]['detail']): void {
    this.dispatchEvent(playerEvent(type, detail));
  }

  // Rendering.

  protected override render() {
    const text = this.#text;
    const view = this.#view;
    if (!view.guide) {
      const error = view.failure ? this.#describe(view.failure.cause, text) : '';
      return html`<div class="il-element-status" aria-busy=${view.loading}>
        <p role="status">${error || (view.loading ? text.guideLoading : text.guideMissing)}</p>
        ${
          error
            ? html`<button type="button" @click=${() => void this.#load()}>${text.retry}</button>`
            : nothing
        }
      </div>`;
    }
    const guide = view.guide;
    const colorScheme = this.#colorScheme;
    return html`<section
      class=${classMap({
        'il-guide': true,
        [`il-guide--${colorScheme}`]: true,
        'il-guide--reduced-motion': view.reducedMotion,
        'il-guide--controls-hidden':
          view.playbackRequested && view.controlsIdle && view.activeAnnotationId === null,
      })}
      aria-label=${guide.title}
      aria-describedby="il-help"
      tabindex="0"
      @keydown=${this.#onKeydown}
      @pointermove=${this.#revealControls}
      @pointerdown=${this.#revealControls}
      @pointerleave=${this.#onPointerLeave}
    >
      ${
        this.showInformation
          ? html`<header class="il-guide__heading">
              <div class="il-guide__heading-copy">
                <h2 class="il-guide__title">${guide.title}</h2>
                ${
                  guide.description
                    ? html`<p class="il-guide__description">${guide.description}</p>`
                    : nothing
                }
              </div>
              <span class="il-guide__count">${text.stepCount(guide.steps.length)}</span>
            </header>`
          : nothing
      }
      ${
        this.#hasSteps
          ? html`${this.#renderScreen(text, colorScheme)}${this.#renderInformation(text)}`
          : html`<div class="il-guide__empty" role="status">
              <span class="il-guide__empty-symbol">${icon('image', 30)}</span>
              <h3>${view.playbackError ? text.unavailableTitle : text.emptyTitle}</h3>
              <p>${view.playbackError ? text.unplayable : text.emptyBody}</p>
            </div>`
      }
      <p id="il-help" class="il-guide__sr-only">${text.keyboardHelp}</p>
    </section>`;
  }

  #renderScreen(text: PlayerMessages, colorScheme: GuideColorScheme) {
    const view = this.#view;
    const { snapshot, imageStatus } = view;
    const step = this.#currentStep;
    const asset = this.#currentAsset;
    const showStartScreen = (!view.hasStarted || snapshot.ended) && imageStatus !== 'error';
    const playLabel = view.playbackRequested
      ? text.pause
      : snapshot.ended
        ? text.replay
        : text.play;
    let rate = String(view.playbackRate);
    try {
      rate = view.playbackRate.toLocaleString(this.#locale);
    } catch {
      // An invalid `lang` value keeps the plain number.
    }
    const fullscreenLabel = view.isFullscreen ? text.exitFullscreen : text.enterFullscreen;
    const fullscreenError =
      view.fullscreenError === 'exit'
        ? text.fullscreenExitFailed
        : view.fullscreenError === 'denied'
          ? text.fullscreenDenied
          : '';
    const fullscreenAvailable = typeof document !== 'undefined' && document.fullscreenEnabled;
    const lastStep = (view.guide?.steps.length ?? 1) - 1;

    return html`<div class="il-guide__screen">
        ${this.#renderAddress(text)}
        <div
          class="il-guide__canvas"
          style=${styleMap({
            aspectRatio: asset ? `${asset.width} / ${asset.height}` : '16 / 9',
            '--il-aspect-ratio': String(asset ? asset.width / asset.height : 16 / 9),
            '--il-progress': `${snapshot.progress * 100}%`,
          })}
          @click=${(event: Event) => {
            if (event.target === event.currentTarget) this.#closeAnnotation();
          }}
        >
          ${
            this.#imageSource && imageStatus !== 'error'
              ? keyed(
                  view.imageRequest,
                  html`<img
                    class="il-guide__image"
                    src=${this.#imageSource}
                    alt=${text.imageAlt(step?.title ?? '')}
                    width=${ifDefined(asset?.width)}
                    height=${ifDefined(asset?.height)}
                    draggable="false"
                    style=${imageStatus === 'ready' ? '' : 'display: none'}
                    @load=${this.#onImageLoad}
                    @error=${this.#onImageError}
                    @click=${() => this.#closeAnnotation()}
                  />`,
                )
              : nothing
          }
          ${
            imageStatus !== 'ready'
              ? html`<div class="il-guide__image-fallback" role="status">
                  ${icon('image', 36)}
                  <span
                    >${imageStatus === 'loading' ? text.imageLoading : text.imageUnavailable}</span
                  >
                  ${
                    imageStatus === 'error' && this.#imageSource
                      ? html`<button
                          class="il-guide__retry"
                          type="button"
                          @click=${() => this.#retryImage()}
                        >
                          ${text.retryImage}
                        </button>`
                      : nothing
                  }
                </div>`
              : nothing
          }
          ${!showStartScreen && imageStatus === 'ready' ? this.#renderOverlay(text) : nothing}
          ${
            showStartScreen
              ? html`<div class="il-guide__cover">
                  <button
                    class="il-guide__start"
                    type="button"
                    aria-label=${playLabel}
                    data-testid="guide-start"
                    @click=${() => this.play()}
                  >
                    ${icon(snapshot.ended ? 'replay' : 'play', 26)}
                  </button>
                  ${
                    this.showInformation
                      ? html`<span class="il-guide__cover-meta"
                          >${snapshot.ended ? text.replay : text.play} ·
                          ${formatTime(snapshot.totalMs)}</span
                        >`
                      : nothing
                  }
                </div>`
              : nothing
          }
          <div class="il-guide__player">
            <div class="il-guide__controls">
              <div class="il-guide__transport">
                <button
                  class="il-guide__control il-guide__control--primary"
                  type="button"
                  aria-label=${playLabel}
                  title=${playLabel}
                  ?disabled=${imageStatus === 'error'}
                  data-testid="guide-play"
                  @click=${() => this.#togglePlayback()}
                >
                  ${icon(view.playbackRequested ? 'pause' : snapshot.ended ? 'replay' : 'play', 17)}
                </button>
                <button
                  class="il-guide__control il-guide__control--step"
                  type="button"
                  aria-label=${text.previousStep}
                  title=${text.previousStep}
                  ?disabled=${snapshot.stepIndex <= 0}
                  data-testid="guide-previous"
                  @click=${() => this.goToStep(snapshot.stepIndex - 1)}
                >
                  ${icon('previous', 15)}
                </button>
                <button
                  class="il-guide__control il-guide__control--step"
                  type="button"
                  aria-label=${text.nextStep}
                  title=${text.nextStep}
                  ?disabled=${snapshot.stepIndex >= lastStep}
                  data-testid="guide-next"
                  @click=${() => this.goToStep(snapshot.stepIndex + 1)}
                >
                  ${icon('next', 15)}
                </button>
              </div>
              <div class="il-guide__timeline-row">
                <input
                  class="il-guide__timeline"
                  type="range"
                  min="0"
                  max=${snapshot.totalMs}
                  step=${Math.min(100, snapshot.totalMs)}
                  .value=${live(String(snapshot.elapsedMs))}
                  aria-label=${text.timeline}
                  aria-valuetext=${text.timelineValue(
                    formatTime(snapshot.elapsedMs),
                    formatTime(snapshot.totalMs),
                    snapshot.stepIndex + 1,
                  )}
                  data-testid="guide-timeline"
                  @input=${(event: Event) =>
                    this.seek(Number((event.target as HTMLInputElement).value))}
                />
              </div>
              <span class="il-guide__time"
                ><span>${formatTime(snapshot.elapsedMs)}</span
                ><span class="il-guide__time-separator">/</span
                >${formatTime(snapshot.totalMs)}</span
              >
              <div class="il-guide__view-controls">
                ${
                  this.#hasAddresses
                    ? html`<button
                        class="il-guide__control"
                        type="button"
                        aria-label=${text.address(this.showAddress)}
                        title=${text.address(this.showAddress)}
                        aria-pressed=${this.showAddress}
                        data-testid="guide-address"
                        @click=${() => (this.showAddress = !this.showAddress)}
                      >
                        ${icon('info', 17)}
                      </button>`
                    : nothing
                }
                <button
                  class="il-guide__control"
                  type="button"
                  aria-label=${text.theme(colorScheme)}
                  title=${text.theme(colorScheme)}
                  data-testid="guide-theme"
                  @click=${() => this.#toggleTheme()}
                >
                  ${icon(`bulb-${colorScheme}`, 17)}
                </button>
                <button
                  class="il-guide__control il-guide__speed"
                  type="button"
                  aria-label=${text.playbackRate(rate)}
                  title=${text.changePlaybackRate}
                  @click=${() => this.#cyclePlaybackRate()}
                >
                  ${rate}×
                </button>
                ${
                  fullscreenAvailable
                    ? html`<button
                        class="il-guide__control"
                        type="button"
                        aria-label=${fullscreenLabel}
                        title=${fullscreenLabel}
                        aria-pressed=${view.isFullscreen}
                        @click=${() => void this.#toggleFullscreen()}
                      >
                        ${icon(view.isFullscreen ? 'contract' : 'expand', 16)}
                      </button>`
                    : nothing
                }
              </div>
            </div>
          </div>
        </div>
      </div>
      ${
        fullscreenError
          ? html`<p class="il-guide__fullscreen-error" role="alert">${fullscreenError}</p>`
          : nothing
      }`;
  }

  #renderOverlay(text: PlayerMessages) {
    const view = this.#view;
    const markers = this.#markers;
    const cursor = this.#cursor();
    const active = markers.find(({ annotation }) => annotation.id === view.activeAnnotationId);
    return html`${
        cursor
          ? html`<div
              class="il-guide__cursor"
              style=${styleMap({
                left: `${cursor.x * 100}%`,
                top: `${cursor.y * 100}%`,
                '--il-cursor-offset': `${this.#cursorOffset(markers)}px`,
              })}
              aria-hidden="true"
            >
              ${
                cursor.showPulse
                  ? html`<span
                      class="il-guide__click-pulse"
                      style=${styleMap({
                        opacity: String(cursor.pulseOpacity),
                        transform: `translate(-50%, -50%) scale(${cursor.pulseScale})`,
                      })}
                    ></span>`
                  : nothing
              }
              <svg width="22" height="27" viewBox="0 0 30 36" fill="none">
                <path
                  d="M3 2.5 25 20l-10 .8 4.6 9-5 2.6-4.5-9L3 30V2.5Z"
                  fill="currentColor"
                  stroke="white"
                  stroke-width="2.2"
                  stroke-linejoin="round"
                />
              </svg>
            </div>`
          : nothing
      }
      <svg
        class="il-guide__anchors"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        ${markers
          .filter(({ position }) => position.displaced)
          .map(
            ({ annotation, position }) =>
              html`<line
                x1=${annotation.x * 1000}
                y1=${annotation.y * 1000}
                x2=${position.x * 1000}
                y2=${position.y * 1000}
              />`,
          )}
      </svg>
      ${repeat(
        markers,
        ({ annotation }) => annotation.id,
        ({ annotation, number, position }, index) => {
          const open = view.activeAnnotationId === annotation.id;
          return html`<button
            class=${classMap({ 'il-guide__annotation': true, 'il-guide__annotation--active': open })}
            type="button"
            style=${styleMap({
              left: `${position.x * 100}%`,
              top: `${position.y * 100}%`,
              '--il-marker-index': String(index),
            })}
            aria-label=${text.marker(number, annotation.title)}
            aria-haspopup="dialog"
            aria-expanded=${open}
            aria-controls=${ifDefined(open ? 'il-annotation' : undefined)}
            @pointerdown=${(event: PointerEvent) => {
              event.stopPropagation();
              this.#pauseForMarker();
            }}
            @focus=${() => this.#pauseForMarker()}
            @click=${(event: MouseEvent) => {
              event.stopPropagation();
              this.#toggleAnnotation(annotation.id, event);
            }}
          >
            <span>${number}</span>
          </button>`;
        },
      )}
      ${
        active
          ? html`<div
              id="il-annotation"
              class="il-guide__tooltip"
              style=${styleMap(view.tooltipStyle)}
              role="dialog"
              aria-labelledby="il-annotation-title"
            >
              <strong id="il-annotation-title">${active.annotation.title}</strong>
              <button
                class="il-guide__tooltip-close"
                type="button"
                aria-label=${text.closeMarker}
                @click=${() => this.#closeAnnotation(true)}
              >
                ${icon('close', 14)}
              </button>
              ${active.annotation.body ? html`<p>${active.annotation.body}</p>` : nothing}
              <span class="il-guide__tooltip-hint">${text.closeMarkerHint}</span>
            </div>`
          : nothing
      }`;
  }

  /** True when at least one step knows the address of its page. */
  get #hasAddresses(): boolean {
    return this.#view.guide?.steps.some((step) => step.source?.url) ?? false;
  }

  #renderAddress(text: PlayerMessages) {
    if (!this.showAddress || !this.#hasAddresses) return nothing;
    const url = this.#currentStep?.source?.url;
    // Hash routers keep the page after `#`, so the label keeps everything but the scheme.
    const label = url?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
    return html`<div class="il-guide__address" aria-live="polite">
      ${icon('globe', 15)}
      ${
        url
          ? html`<a
              href=${url}
              target="_blank"
              rel="noopener noreferrer"
              title=${text.openAddress(label)}
              >${label}</a
            >`
          : html`<span>${text.noAddress}</span>`
      }
    </div>`;
  }

  #renderInformation(text: PlayerMessages) {
    if (!this.showInformation) return nothing;
    const { guide, snapshot } = this.#view;
    const step = this.#currentStep;
    if (!guide || !step) return nothing;
    const first = this.#markers[0]?.number ?? 1;
    return html`<div class="il-guide__information">
      <div class="il-guide__step" aria-live="polite" aria-atomic="true">
        <div class="il-guide__step-copy">
          <h3>
            <span class="il-guide__step-number"
              >${snapshot.stepIndex + 1} / ${guide.steps.length}</span
            >${step.title}
          </h3>
          ${step.description ? html`<p>${step.description}</p>` : nothing}
        </div>
        ${
          snapshot.ended
            ? html`<span class="il-guide__complete">${icon('check', 15)} ${text.completed}</span>`
            : nothing
        }
      </div>
      ${
        step.annotations.length
          ? html`<details class="il-guide__details">
              <summary>${text.showMarkers} <span>${step.annotations.length}</span></summary>
              <ol start=${first}>
                ${step.annotations.map(
                  (annotation) =>
                    html`<li>
                      <strong>${annotation.title}</strong>
                      ${annotation.body ? html`<p>${annotation.body}</p>` : nothing}
                    </li>`,
                )}
              </ol>
            </details>`
          : nothing
      }
    </div>`;
  }
}

/** Typed listeners for the player events. */
export interface InteractiveLearningElement {
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
  removeEventListener<K extends keyof PlayerEventMap>(
    type: K,
    listener: (this: InteractiveLearningElement, event: PlayerEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'interactive-learning': InteractiveLearningElement;
  }
}
