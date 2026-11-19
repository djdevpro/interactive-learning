import { createApp } from 'vue';
import '@interactive-learning/player/auto';
import './styles/tokens.css';
import './styles/base.css';
import './styles/library.css';
import './styles/editor.css';
import './styles/settings.css';
import App from './App.vue';
import { startLanguage } from './settings';

// The first screen already speaks the language of the creator.
await startLanguage();
createApp(App).mount('#app');
