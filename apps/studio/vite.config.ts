import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The recorder serves this build with `interactive-learning studio`; it has no server of its own.
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: { isCustomElement: (tag) => tag === 'interactive-learning' },
      },
    }),
  ],
  base: './',
  publicDir: false,
});
