import { mount } from 'svelte';
import App from './App.svelte';
import './style.css';
import './custom.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing application container.');

mount(App, { target });
