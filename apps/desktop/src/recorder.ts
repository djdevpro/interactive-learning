import { ref } from 'vue';
import type { GuideDocument } from '@interactive-learning/protocol';
import { clickStep, screenStep, type Baseline, type Observation } from './recording';

/** Full-page captures are costly; a page that keeps changing is captured this often at most. */
const CAPTURE_INTERVAL_MS = 1_200;
/**
 * A page that settles this long after the last action of the person changed on its own, like a
 * carousel or a clock: it keeps its picture until the person acts again.
 */
const FOLLOW_UP_MS = 6_000;

interface RecorderOptions {
  /** Full-page screenshot of the site as it shows now. */
  capture: () => Promise<Baseline>;
  read: () => GuideDocument;
  write: (guide: GuideDocument) => Promise<void>;
  announce: (message: string) => void;
  fail: (cause: unknown) => void;
}

/**
 * Automatic recording. The page is captured each time it settles, which keeps an up-to-date
 * picture of the screen before the next action. A click then becomes a step from that picture,
 * and the last screen joins the guide when the recording stops.
 */
export function createRecorder(options: RecorderOptions) {
  const active = ref(false);
  let baseline: Baseline | undefined;
  let lastScroll: Observation['scroll'] | undefined;
  let capturing: Promise<void> | undefined;
  let again = false;
  let lastCaptureAt = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task, task);
    queue = result.catch(() => undefined);
    return result;
  };

  function refresh(): Promise<void> {
    if (capturing) {
      again = true;
      return capturing;
    }
    capturing = (async () => {
      const wait = lastCaptureAt + CAPTURE_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      try {
        baseline = await options.capture();
        lastScroll = undefined;
      } catch {
        // A page that cannot be captured yet, such as one still loading, is captured next time.
      } finally {
        lastCaptureAt = Date.now();
      }
    })().finally(() => {
      capturing = undefined;
      if (again && active.value) {
        again = false;
        void refresh();
      }
    });
    return capturing;
  }

  async function onClick(click: Observation): Promise<void> {
    // A click right after a navigation may come before the first picture of the new page.
    if (!baseline || baseline.url !== click.url) await refresh();
    const base = baseline;
    if (!base) return;
    const guide = clickStep(options.read(), base, click);
    await options.write(guide);
    options.announce(`Step ${guide.steps.length} · ${guide.steps.at(-1)?.title ?? ''}`);
  }

  return {
    active,

    async start(): Promise<void> {
      active.value = true;
      baseline = undefined;
      await refresh();
    },

    /** The last screen joins the guide, unless the last step already shows it. */
    stop(): Promise<void> {
      active.value = false;
      return serial(async () => {
        if (capturing) await capturing;
        const base = baseline;
        const guide = options.read();
        const last = guide.steps.at(-1);
        const lastSrc = guide.assets.find((asset) => asset.id === last?.assetId)?.src;
        if (!base || lastSrc === base.asset.src) return;
        await options.write(screenStep(guide, base, lastScroll ?? base.view, 'end'));
      }).catch(options.fail);
    },

    observe(observation: Observation): void {
      if (!active.value) return;
      if (observation.type === 'settled') {
        if ((observation.sinceAction ?? 0) < FOLLOW_UP_MS) void refresh();
      } else if (observation.type === 'scroll' && observation.url === baseline?.url)
        lastScroll = observation.scroll;
      else if (observation.type === 'click')
        void serial(() => onClick(observation)).catch(options.fail);
    },

    /** A capture by hand, recording or not. While recording, it also becomes the new picture. */
    captureNow(): Promise<void> {
      return serial(async () => {
        const base = await options.capture();
        if (active.value) baseline = base;
        const guide = screenStep(options.read(), base);
        await options.write(guide);
        options.announce(`Step ${guide.steps.length} · ${guide.steps.at(-1)?.title ?? ''}`);
      });
    },
  };
}
