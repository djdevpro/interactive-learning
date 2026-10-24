import './style.css';

export { default as InteractiveGuide } from './InteractiveGuide.vue';
export { TimelineController } from './TimelineController';
export type { TimelineSnapshot, TimelineStep } from './TimelineController';
export {
  createGuide,
  validateGuide,
  GuideValidationError,
  SCHEMA_VERSION,
} from '@interactive-learning/protocol';
export type {
  GuideDocument,
  GuideAsset,
  GuideStep,
  GuideCursor,
  GuideAnnotation,
  CaptureContext,
  Point,
  ImageMimeType,
} from '@interactive-learning/protocol';
