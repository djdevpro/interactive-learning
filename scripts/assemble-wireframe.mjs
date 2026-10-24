import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { validateGuide } from '../packages/recorder/dist/index.mjs';

// Assemble saved screenshots. This does not automate or replay the prototype.
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(
  await readFile(resolve(root, 'examples/wireframe/scenario.json'), 'utf8'),
);
const captures = resolve(root, 'examples/wireframe/captures');
const positions = JSON.parse(await readFile(resolve(captures, 'positions.json'), 'utf8'));
const exec = promisify(execFile);
const artifacts = resolve(root, '.artifacts');
await mkdir(artifacts, { recursive: true });
const work = await mkdtemp(resolve(artifacts, 'wireframe-'));
const guidePath = resolve(work, 'guide.json');

async function cli(...args) {
  const { stdout } = await exec(
    process.execPath,
    [resolve(root, 'packages/recorder/dist/cli.mjs'), ...args],
    { cwd: root },
  );
  const result = JSON.parse(stdout);
  if (!result.ok) throw new Error(stdout);
  return result;
}

await cli(
  'create',
  '--title',
  manifest.title,
  '--description',
  manifest.description,
  '--out',
  guidePath,
);
for (const step of manifest.steps) {
  const point = positions[step.position];
  const args = [
    'capture',
    'add',
    '--guide',
    guidePath,
    '--image',
    resolve(root, 'examples/wireframe/captures', step.file),
    '--title',
    step.title,
    '--description',
    step.description,
    '--duration-ms',
    String(step.durationMs),
  ];
  if (step.cursor) args.push('--x', String(point.x), '--y', String(point.y));
  const { stepId } = await cli(...args);
  for (const annotation of step.annotations) {
    await cli(
      'annotate',
      '--guide',
      guidePath,
      '--step',
      stepId,
      '--x',
      String(point.x),
      '--y',
      String(point.y),
      '--title',
      annotation.title,
      '--body',
      annotation.body,
    );
  }
}
const document = validateGuide(JSON.parse(await readFile(guidePath, 'utf8')));
for (const [index, step] of document.steps.entries()) {
  const definition = manifest.steps[index];
  const point = positions[definition.position];
  step.source = {
    capturedAt: (await stat(resolve(captures, definition.file))).mtime.toISOString(),
    viewport: point.viewport,
    scroll: point.scroll,
    reason: 'ai-screenshot',
  };
}
await writeFile(guidePath, `${JSON.stringify(validateGuide(document), null, 2)}\n`);
await cli('validate', '--guide', guidePath);
await cli('export', '--guide', guidePath, '--out', resolve(work, 'portable'), '--embed');
const target = resolve(root, 'apps/example/public/example');
await mkdir(target, { recursive: true });
await copyFile(resolve(work, 'portable/guide.json'), resolve(target, 'guide.json'));
console.log(
  `Guide wireframe assemblé : ${manifest.steps.length} captures, partagé par Vue, React, Svelte et HTML.`,
);
