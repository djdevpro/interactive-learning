import { spawn } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `pnpm dev:studio`: opens a copy of the example guide in the studio built from apps/studio.
// The copy lives in .artifacts, so edits never touch the example served by the apps.
const root = fileURLToPath(new URL('../', import.meta.url));
const copy = resolve(root, '.artifacts/studio-example');
await rm(copy, { recursive: true, force: true });
await cp(resolve(root, 'apps/example/public/example'), copy, { recursive: true });

const studio = spawn(
  process.execPath,
  [
    resolve(root, 'packages/recorder/dist/cli.mjs'),
    'studio',
    '--guide',
    resolve(copy, 'guide.json'),
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, INTERACTIVE_LEARNING_STUDIO_APP: resolve(root, 'apps/studio/dist') },
  },
);
studio.on('exit', (code) => process.exit(code ?? 0));
