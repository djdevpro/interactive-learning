import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const playerSource = (file: string) =>
  fileURLToPath(new URL(`../../packages/player/src/${file}`, import.meta.url));

// `pnpm dev:vue` serves the player sources with live reload; `build` checks the built package.
export default defineConfig(({ command }) => ({
  plugins: [
    vue({
      template: {
        compilerOptions: { isCustomElement: (tag) => tag === 'interactive-learning' },
      },
    }),
  ],
  base: './',
  resolve: {
    alias:
      command === 'serve'
        ? [
            { find: /^@interactive-learning\/player\/auto$/, replacement: playerSource('auto.ts') },
            { find: /^@interactive-learning\/player$/, replacement: playerSource('index.ts') },
          ]
        : [],
  },
}));
