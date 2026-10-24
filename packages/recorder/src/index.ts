export { RecorderError } from './errors.js';
export { RecordingSession } from './recording-session.js';
export type {
  CreateGuideOptions,
  AddCaptureOptions,
  ReplaceCaptureOptions,
  ReplaceCaptureResult,
  AddAnnotationOptions,
} from './recording-session.js';
export { GuideExporter } from './guide-exporter.js';
export type { ExportGuideOptions, ExportGuideResult } from './guide-exporter.js';
export type {
  GuideDocument,
  GuideAsset,
  GuideStep,
  GuideAnnotation,
  GuideCursor,
  CaptureContext,
  ImageMimeType,
  Point,
} from '@interactive-learning/protocol';
export {
  createGuide,
  validateGuide,
  GuideValidationError,
  SCHEMA_VERSION,
} from '@interactive-learning/protocol';
