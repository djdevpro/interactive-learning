import { defineConfig } from 'vite';
import dts from 'unplugin-dts/vite';

// `pnpm dev` serves index.html, a live preview of the element; `pnpm build` builds the library.
export default defineConfig({
  publicDir: '../../apps/example/public/example',
  plugins: [
    dts({
      tsconfigPath: './tsconfig.json',
      entryRoot: 'src',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      bundleTypes: { bundledPackages: ['@interactive-learning/protocol'] },
      afterDiagnostic(diagnostics) {
        if (diagnostics.some((diagnostic) => diagnostic.category === 1)) {
          throw new Error('Player type declarations contain errors.');
        }
      },
    }),
  ],
  build: {
    lib: {
      entry: { index: 'src/index.ts', auto: 'src/auto.ts' },
      formats: ['es'],
    },
    // Lit stays a dependency, so pages share one copy and servers load its Node build.
    rolldownOptions: { external: [/^lit($|\/)/, /^@lit\//] },
    copyPublicDir: false,
    sourcemap: true,
  },
});
