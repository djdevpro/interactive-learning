import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Tauri loads this interface from the dev server in `tauri dev`, and from `dist` once built.
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: { isCustomElement: (tag) => tag === 'interactive-learning' },
      },
    }),
  ],
  base: './',
  clearScreen: false,
  publicDir: false,
  server: { host: '127.0.0.1', port: 4340, strictPort: true },
  build: { target: 'es2022' },
});
