import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Interactive Learning',
    description: 'Capturez vos parcours et transformez-les en guides interactifs.',
    permissions: ['activeTab', 'scripting', 'storage', 'webNavigation'],
    minimum_chrome_version: '120',
  },
});
