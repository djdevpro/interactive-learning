import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Interactive Learning',
    description: 'Record your walkthroughs and turn them into interactive guides.',
    permissions: ['activeTab', 'scripting', 'storage', 'webNavigation'],
    minimum_chrome_version: '120',
  },
});
