import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  dts: { tsc: { eager: true } },
  clean: true,
  sourcemap: true,
  deps: {
    alwaysBundle: ['@interactive-learning/protocol'],
    onlyImport: ['image-size'],
  },
});
