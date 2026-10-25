import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Interactive Learning',
    description: 'Record your walkthroughs and turn them into interactive guides.',
    permissions: ['activeTab', 'scripting', 'sidePanel', 'storage', 'webNavigation'],
    // The toolbar icon opens the side panel; clicking it also grants activeTab on the current tab.
    action: { default_title: 'Open Interactive Learning' },
    minimum_chrome_version: '120',
  },
});
