import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'unplugin-dts/vite';

export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: './tsconfig.json',
      processor: 'vue',
      entryRoot: 'src',
      include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.vue'],
      bundleTypes: { bundledPackages: ['@interactive-learning/protocol'] },
      afterDiagnostic(diagnostics) {
        if (diagnostics.some((diagnostic) => diagnostic.category === 1)) {
          throw new Error('Player type declarations contain errors.');
        }
      },
    }),
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  build: {
    lib: {
      entry: { index: 'src/index.ts', auto: 'src/auto.ts', react: 'src/react.tsx' },
      formats: ['es'],
    },
    rolldownOptions: {
      external: ['react', 'react/jsx-runtime'],
      output: { banner: (chunk) => (chunk.name === 'react' ? '"use client";' : '') },
    },
    sourcemap: true,
  },
});
