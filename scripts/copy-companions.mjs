import { cp, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
await access(resolve(root, 'skills/interactive-learning/SKILL.md'));
await access(resolve(root, 'apps/extension/.output/chrome-mv3/manifest.json'));
await cp(
  resolve(root, 'skills/interactive-learning'),
  resolve(root, 'packages/recorder/dist/skill'),
  { recursive: true },
);
await cp(
  resolve(root, 'apps/extension/.output/chrome-mv3'),
  resolve(root, 'packages/recorder/dist/extension/chrome-mv3'),
  { recursive: true },
);
console.log('Recorder : skill IA et extension Chrome embarqués.');
