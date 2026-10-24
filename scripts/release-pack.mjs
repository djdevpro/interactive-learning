import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageManager = process.env.npm_execpath;
if (!packageManager) throw new Error('Run this command with pnpm release:pack.');

const outputRoot = join(root, '.artifacts', 'release');
await mkdir(outputRoot, { recursive: true });
const outputDirectory = await mkdtemp(join(outputRoot, 'packages-'));
const packages = [];

for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = join(root, 'packages', entry.name);
  const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (metadata.private) continue;

  const args = ['pack', '--pack-destination', outputDirectory];
  const isScript = /\.(?:mjs|cjs|js)$/i.test(packageManager);
  execFileSync(
    isScript ? process.execPath : packageManager,
    isScript ? [packageManager, ...args] : args,
    {
      cwd: directory,
      stdio: 'inherit',
      windowsHide: true,
    },
  );

  const filename = `${metadata.name.replace(/^@/, '').replaceAll('/', '-')}-${metadata.version}.tgz`;
  const archive = await readFile(join(outputDirectory, filename));
  packages.push({
    name: metadata.name,
    version: metadata.version,
    filename,
    bytes: archive.length,
    sha256: createHash('sha256').update(archive).digest('hex'),
  });
}

await writeFile(
  join(outputDirectory, 'manifest.json'),
  `${JSON.stringify({ packages }, null, 2)}\n`,
);
console.log(`Archives npm préparées dans ${outputDirectory}. Rien n’a été publié.`);
