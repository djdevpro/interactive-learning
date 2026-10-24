import { mkdir, mkdtemp, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RecordingSession,
  GuideExporter,
  validateGuide,
} from '../packages/recorder/dist/index.mjs';

// Authoring pipeline: assemble saved browser captures. No browser automation or tests.
const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'examples/tu-commences-demain');
const courses = JSON.parse(await readFile(resolve(source, 'courses.json'), 'utf8'));
const positions = JSON.parse(await readFile(resolve(source, 'captures/positions.json'), 'utf8'));
await mkdir(resolve(root, '.artifacts'), { recursive: true });
const work = await mkdtemp(resolve(root, '.artifacts/courses-'));
const catalog = [];
for (const course of courses) {
  const guidePath = resolve(work, course.id, 'guide.json');
  const session = await RecordingSession.create({
    filePath: guidePath,
    title: course.title,
    description: course.description,
  });
  for (const definition of course.steps) {
    const capture = positions.find((item) => item.name === definition.capture);
    if (!capture) throw new Error(`Missing capture metadata: ${definition.capture}`);
    const { name, point, ...context } = capture;
    const step = await session.addCapture({
      imagePath: resolve(source, 'captures', `${name}.jpg`),
      title: definition.title,
      description: definition.description,
      durationMs: definition.durationMs ?? 2500,
      ...(point
        ? {
            cursor: {
              ...point,
              action: 'click',
              from: { x: Math.max(0.08, point.x - 0.15), y: Math.min(0.92, point.y + 0.15) },
            },
          }
        : {}),
      source: { ...context, reason: 'ai-screenshot' },
    });
    for (const annotation of definition.annotations)
      await session.addAnnotation(step.id, annotation);
  }
  const document = await session.validate();
  // Predictable IDs allow these authored examples to be rebuilt without losing identity.
  document.id = `tcd-${course.id}`;
  for (const [index, step] of document.steps.entries()) {
    step.id = `${course.id}-${course.steps[index].capture}`;
    step.annotations.forEach((annotation, number) => {
      annotation.id = `${step.id}-repere-${number + 1}`;
    });
  }
  await writeFile(guidePath, JSON.stringify(validateGuide(document), null, 2));
  const output = resolve(work, `${course.id}-export`);
  await new GuideExporter(guidePath).export({ outDirectory: output });
  const target = resolve(root, 'apps/example/public/courses', course.id);
  await mkdir(target, { recursive: true });
  await cp(output, target, { recursive: true });
  catalog.push({
    id: course.id,
    title: course.title,
    description: course.description,
    steps: document.steps.length,
    durationMs: document.steps.reduce((total, step) => total + step.durationMs, 0),
    src: `./courses/${course.id}/guide.json`,
  });
}
await writeFile(
  resolve(root, 'apps/example/public/courses/catalog.json'),
  JSON.stringify(catalog, null, 2),
);
console.log(JSON.stringify({ ok: true, catalog, source, work }, null, 2));
