import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(root, '.artifacts', 'packages');
const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const packageManager = process.env.npm_execpath;
assert(
  packageManager,
  'Run this check with pnpm pack:check so the package manager executable is known.',
);

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(
      `${basename(command)} ${args[0] ?? ''} failed:\n${error.stdout ?? ''}${error.stderr ?? error.message}`,
    );
  }
}

function pnpm(args, cwd = root) {
  return /\.(?:mjs|cjs|js)$/i.test(packageManager)
    ? run(process.execPath, [packageManager, ...args], cwd)
    : run(packageManager, args, cwd);
}

function tarFiles(archive) {
  const tar = gunzipSync(archive, { maxOutputLength: 128 * 1024 * 1024 });
  const files = new Map();
  let nextPath;
  const field = (header, start, end) => header.toString('utf8', start, end).replace(/\0.*$/s, '');
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(field(header, 124, 136).trim() || '0', 8);
    const mode = Number.parseInt(field(header, 100, 108).trim() || '0', 8);
    assert(
      Number.isSafeInteger(size) && size >= 0 && offset + 512 + size <= tar.length,
      'Invalid archive member size.',
    );
    const data = tar.subarray(offset + 512, offset + 512 + size);
    const type = field(header, 156, 157);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      // npm packs may use a PAX extended header for a long filename.
      for (let cursor = 0; cursor < data.length;) {
        const space = data.indexOf(32, cursor);
        const length = Number(data.toString('ascii', cursor, space));
        assert(
          space > cursor &&
            Number.isSafeInteger(length) &&
            length > space - cursor + 1 &&
            cursor + length <= data.length,
          'Invalid PAX header.',
        );
        const entry = data.toString('utf8', space + 1, cursor + length - 1);
        if (entry.startsWith('path=')) nextPath = entry.slice(5);
        cursor += length;
      }
      continue;
    }
    const prefix = field(header, 345, 500);
    const name = nextPath ?? `${prefix ? `${prefix}/` : ''}${field(header, 0, 100)}`;
    nextPath = undefined;
    assert(
      name.startsWith('package/') && !name.includes('\\') && !name.split('/').includes('..'),
      `Unsafe archive path: ${name}`,
    );
    if (type === '5') continue;
    assert(type === '' || type === '0', `Unsupported archive member type: ${name}`);
    assert(!files.has(name), `Duplicate archive member: ${name}`);
    files.set(name, { data, mode });
  }
  return files;
}

function checkArchive(files, expectedName, expectedVersion) {
  const member = (name) => {
    assert.equal(
      typeof name,
      'string',
      `${expectedName} has a missing file target in its package metadata.`,
    );
    const entry = files.get(`package/${name.replace(/^\.\//, '')}`);
    assert(entry, `Missing ${expectedName}: ${name}`);
    return entry;
  };
  const metadata = JSON.parse(member('package.json').data.toString());
  assert.equal(metadata.name, expectedName);
  assert.equal(metadata.version, expectedVersion);
  assert.notEqual(metadata.private, true);
  for (const group of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    assert(
      !metadata[group]?.['@interactive-learning/protocol'],
      `${expectedName} leaks its private protocol dependency.`,
    );
    for (const [name, range] of Object.entries(metadata[group] ?? {})) {
      assert(
        !/^(?:workspace:|file:|link:)/.test(range),
        `${expectedName} has a local runtime dependency: ${name}`,
      );
    }
  }
  function checkExport(value) {
    if (typeof value === 'string') {
      assert(value.startsWith('./'));
      member(value);
    } else for (const child of Object.values(value ?? {})) checkExport(child);
  }
  checkExport(metadata.exports);
  member(metadata.types ?? metadata.exports?.['.']?.types);
  for (const [name, entry] of files) {
    if (/\.(?:mjs|cjs|js|d\.ts|d\.mts|d\.cts)$/.test(name)) {
      assert(
        !entry.data.toString().includes('@interactive-learning/protocol'),
        `Private protocol reference in ${name}`,
      );
    }
    assert(
      !name.startsWith('package/src/') && !name.startsWith('package/test/'),
      `Source/test file accidentally shipped: ${name}`,
    );
  }
  if (expectedName.endsWith('/player')) {
    const manifest = JSON.parse(member(metadata.customElements).data.toString());
    assert(
      manifest.modules.some((module) =>
        module.declarations?.some((declaration) => declaration.tagName === 'interactive-learning'),
      ),
      'The custom elements manifest does not describe <interactive-learning>.',
    );
    assert(metadata.dependencies?.lit, 'The player must depend on lit.');
  } else {
    const cli = member(metadata.bin['interactive-learning']);
    assert(cli.data.toString().startsWith('#!/usr/bin/env node\n'), 'CLI shebang is missing.');
    assert((cli.mode & 0o111) !== 0, 'CLI is not executable in the npm archive.');
    assert(member('dist/skill/SKILL.md').data.length > 0, 'Skill is missing.');
    const manifest = JSON.parse(member('dist/extension/chrome-mv3/manifest.json').data.toString());
    assert.equal(manifest.manifest_version, 3);
    for (const file of [
      manifest.background?.service_worker,
      manifest.action?.default_popup,
      ...(manifest.content_scripts ?? []).flatMap((entry) => [
        ...(entry.js ?? []),
        ...(entry.css ?? []),
      ]),
    ].filter(Boolean)) {
      member(`dist/extension/chrome-mv3/${file}`);
    }
    const studio = member('dist/studio/index.html').data.toString();
    for (const [, file] of studio.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)) {
      member(`dist/studio/${file}`);
    }
  }
}

const smokeTypeScript = `
import { InteractiveLearningElement, TimelineController, validateGuide as validateReaderGuide, type GuideDocument as ReaderGuide } from '@interactive-learning/player';
import { RecordingSession, GuideExporter, validateGuide, createGuide, SCHEMA_VERSION, type GuideDocument as RecorderGuide } from '@interactive-learning/recorder';
const compatible = (guide: RecorderGuide): ReaderGuide => guide;
const created: ReaderGuide = validateReaderGuide(compatible(validateGuide(createGuide('Guide'))));
const schema: '1.0.0' = SCHEMA_VERSION;
const component: typeof InteractiveLearningElement = InteractiveLearningElement;
const timeline = new TimelineController([{ id: 'one', durationMs: 1000 }]);
const session = new RecordingSession('guide.json');
const exporter = new GuideExporter(session.guidePath);
async function operations() {
  const guide: ReaderGuide = compatible(await session.read());
  const replacement = await session.replaceCapture(guide.steps[0].id, { imagePath: 'capture.png' });
  const needsReview: boolean = replacement.annotationsRequireReview;
  return { guide, needsReview, exporter, timeline, component, created, schema };
}
void operations;
`;

const smokeJavaScript = `
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InteractiveLearningElement, TimelineController, validateGuide as validateReaderGuide, SCHEMA_VERSION as READER_SCHEMA } from '@interactive-learning/player';
import { RecordingSession, GuideExporter, validateGuide, createGuide, SCHEMA_VERSION } from '@interactive-learning/recorder';
assert(InteractiveLearningElement);
assert.equal(validateGuide(createGuide('Public helper')).schemaVersion, SCHEMA_VERSION);
assert.equal(READER_SCHEMA, SCHEMA_VERSION);
assert.equal(validateReaderGuide(createGuide('Reader-compatible guide')).title, 'Reader-compatible guide');
assert.throws(() => validateGuide({}));
const timeline = new TimelineController([{ id: 'one', durationMs: 1000 }]);
timeline.play(); timeline.advance(500);
assert.equal(timeline.snapshot.progress, 0.5);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1UAAAAASUVORK5CYII=', 'base64');
await writeFile('capture.png', png);
const session = await RecordingSession.create({ filePath: 'guide/guide.json', title: 'Installed package smoke' });
const step = await session.addCapture({ imagePath: 'capture.png', title: 'Open', cursor: { x: 0.4, y: 0.6 } });
await session.addAnnotation(step.id, { x: 0.4, y: 0.6, title: 'Open here' });
const replacement = await session.replaceCapture(step.id, { imagePath: 'capture.png' });
assert.equal(replacement.annotationsRequireReview, true);
assert.equal(replacement.step.cursor, undefined);
assert.equal((await session.validate()).steps.length, 1);
const exported = await new GuideExporter(session.guidePath).export({ outDirectory: 'embedded', embed: true });
assert((JSON.parse(await readFile(exported.manifestPath, 'utf8'))).assets[0].src.startsWith('data:image/png;base64,'));
const cliPath = fileURLToPath(new URL('./cli.mjs', import.meta.resolve('@interactive-learning/recorder')));
const cli = (...args) => JSON.parse(execFileSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', windowsHide: true }));
const doctor = cli('doctor');
assert.equal(doctor.ok, true);
assert.equal(doctor.skillAvailable, true);
assert.equal(doctor.extensionAvailable, true);
assert.equal(doctor.studioAvailable, true);
assert.equal(doctor.capabilities.browserAutomation, false);
assert.equal(cli('extension', 'path').available, true);
assert.equal(cli('skill', 'path').available, true);
assert.equal(cli('skill', 'install', '--out', 'installed-skill').path, resolve('installed-skill'));
assert((await readFile('installed-skill/SKILL.md', 'utf8')).length > 0);
console.log('Installed runtime, capture workflow, CLI, extension, studio and skill: OK');
`;

await mkdir(outputDirectory, { recursive: true });
await rm(resolve(outputDirectory, 'verification.json'), { force: true });
const packages = [];
for (const folder of ['player', 'recorder']) {
  const directory = resolve(root, 'packages', folder);
  const metadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  console.log(`Packing ${metadata.name}@${metadata.version}…`);
  pnpm(['pack', '--pack-destination', outputDirectory], directory);
  const archivePath = resolve(
    outputDirectory,
    `${metadata.name.replace(/^@/, '').replaceAll('/', '-')}-${metadata.version}.tgz`,
  );
  const archive = await readFile(archivePath);
  const files = tarFiles(archive);
  checkArchive(files, metadata.name, metadata.version);
  packages.push({
    name: metadata.name,
    version: metadata.version,
    archivePath,
    fileCount: files.size,
    bytes: archive.length,
    sha256: createHash('sha256').update(archive).digest('hex'),
    metadata,
  });
}

const consumer = await mkdtemp(resolve(tmpdir(), 'interactive-learning-consumer-'));
try {
  const dependencies = Object.fromEntries(
    packages.map((entry) => [entry.name, `file:${entry.archivePath.replaceAll('\\', '/')}`]),
  );
  await writeFile(
    resolve(consumer, 'package.json'),
    JSON.stringify(
      {
        name: 'interactive-learning-package-smoke',
        private: true,
        type: 'module',
        dependencies,
        devDependencies: {
          typescript: rootPackage.devDependencies.typescript,
          '@types/node': rootPackage.devDependencies['@types/node'],
        },
      },
      null,
      2,
    ),
  );
  console.log('Installing both tarballs into an isolated consumer…');
  pnpm(
    [
      'install',
      '--ignore-workspace',
      '--ignore-scripts',
      '--lockfile=false',
      '--prefer-offline',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=false',
      '--config.prefer-workspace-packages=false',
    ],
    consumer,
  );
  await writeFile(resolve(consumer, 'smoke.ts'), smokeTypeScript);
  await writeFile(resolve(consumer, 'smoke.mjs'), smokeJavaScript);
  await writeFile(
    resolve(consumer, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: ['node'],
        },
        include: ['smoke.ts'],
      },
      null,
      2,
    ),
  );
  run(
    process.execPath,
    [resolve(consumer, 'node_modules/typescript/bin/tsc'), '--project', 'tsconfig.json'],
    consumer,
  );
  console.log(run(process.execPath, ['smoke.mjs'], consumer).trim());
  const version = JSON.parse(
    pnpm(['--ignore-workspace', 'exec', 'interactive-learning', '--version'], consumer),
  );
  assert.equal(version.version, packages.find((entry) => entry.name.endsWith('/recorder')).version);
} finally {
  const cleanup = resolve(consumer);
  const fromTemp = relative(resolve(tmpdir()), cleanup);
  assert(
    !isAbsolute(fromTemp) &&
      fromTemp !== '..' &&
      !fromTemp.startsWith(`..${sep}`) &&
      basename(cleanup).startsWith('interactive-learning-consumer-'),
    'Refusing to remove a directory outside this temporary consumer.',
  );
  await rm(cleanup, { recursive: true, force: true });
}

const report = {
  verifiedAt: new Date().toISOString(),
  platform: process.platform,
  node: process.version,
  checks: [
    'tarball-content',
    'standalone-types',
    'custom-elements-manifest',
    'executable-cli',
    'extension',
    'studio',
    'skill',
    'isolated-install',
    'typescript-consumer',
    'runtime-consumer',
  ],
  packages: packages.map(({ name, version, archivePath, bytes, sha256, fileCount }) => ({
    name,
    version,
    archive: basename(archivePath),
    bytes,
    sha256,
    fileCount,
  })),
};
await writeFile(
  resolve(outputDirectory, 'verification.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log('Package verification passed. Archives and report: .artifacts/packages/');
