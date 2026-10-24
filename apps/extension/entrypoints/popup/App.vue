<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { validateGuide } from '@interactive-learning/protocol';
import { GuideStore } from '../../lib/guide-store';
import {
  CHANNEL,
  SESSION_KEY,
  idleState,
  type Command,
  type RecorderState,
  type Reply,
} from '../../lib/messages';

const state = ref<RecorderState>(idleState());
const title = ref('Mon premier guide');
const busy = ref(false);
const error = ref('');
const isActive = computed(() => ['recording', 'paused'].includes(state.value.status));
const statusLabel = computed(
  () =>
    ({
      idle: 'Prêt à enregistrer',
      recording: 'Enregistrement en cours',
      paused: 'En pause',
      stopped: 'Guide enregistré',
    })[state.value.status],
);
const size = computed(() => `${(state.value.imageBytes / 1024 / 1024).toFixed(1)} Mo`);

async function send(type: Exclude<Command['type'], 'observation'>) {
  busy.value = true;
  error.value = '';
  try {
    const command =
      type === 'start'
        ? ({ channel: CHANNEL, type, title: title.value } as const)
        : { channel: CHANNEL, type };
    const reply: Reply = await browser.runtime.sendMessage(command);
    if (!reply.ok) throw new Error(reply.error);
    state.value = reply.state;
    if (reply.state.title) title.value = reply.state.title;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Impossible de joindre le recorder.';
  } finally {
    busy.value = false;
  }
}

async function exportGuide() {
  if (!state.value.guideId) return;
  busy.value = true;
  error.value = '';
  try {
    const guide = validateGuide(await new GuideStore().read(state.value.guideId));
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(guide, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${
      guide.title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-]+/g, '-')
        .toLowerCase() || 'guide'
    }.learning.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'L’export a échoué.';
  } finally {
    busy.value = false;
  }
}

const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
  if (area === 'local' && changes[SESSION_KEY]?.newValue)
    state.value = changes[SESSION_KEY].newValue as RecorderState;
};

onMounted(() => {
  browser.storage.onChanged.addListener(onStorage);
  void send('state');
});
onUnmounted(() => browser.storage.onChanged.removeListener(onStorage));
</script>

<template>
  <main>
    <header class="brand-row">
      <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
      <div>
        <strong>Interactive Learning</strong>
        <p>Enregistrez. Expliquez. Partagez.</p>
      </div>
      <span class="version">REC</span>
    </header>

    <section class="capture-card" aria-labelledby="guide-title">
      <div class="status" :data-status="state.status">
        <span aria-hidden="true"></span>{{ statusLabel }}
      </div>
      <template v-if="!isActive">
        <h1 id="guide-title">Un parcours, un guide.</h1>
        <label for="title">Nom du guide</label>
        <input
          id="title"
          v-model="title"
          maxlength="200"
          placeholder="Ex. Créer une formation"
          :disabled="busy"
          @keydown.enter="send('start')"
        />
        <button class="primary full" :disabled="busy || !title.trim()" @click="send('start')">
          <span class="record-dot" aria-hidden="true"></span
          >{{ state.status === 'stopped' ? 'Démarrer un nouveau guide' : 'Démarrer la capture' }}
        </button>
      </template>
      <template v-else>
        <h1 id="guide-title">{{ state.title }}</h1>
        <p class="hint">
          Fermez ce panneau et réalisez votre parcours. Les étapes se sauvegardent sur cet appareil.
        </p>
        <button class="primary full" :disabled="busy" @click="send('capture')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5 6.5 8H4v11h16V8h-2.5L16 5H8Z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          Capturer cette étape
        </button>
        <div class="button-row">
          <button :disabled="busy" @click="send(state.status === 'paused' ? 'resume' : 'pause')">
            {{ state.status === 'paused' ? 'Reprendre' : 'Mettre en pause' }}
          </button>
          <button :disabled="busy" @click="send('stop')">Terminer</button>
        </div>
      </template>

      <div v-if="state.guideId" class="stats" aria-live="polite">
        <div>
          <strong>{{ state.stepCount }}</strong
          ><span>{{ state.stepCount > 1 ? 'étapes' : 'étape' }}</span>
        </div>
        <div>
          <strong>{{ size }}</strong
          ><span>en local</span>
        </div>
        <button class="export" :disabled="busy || !state.stepCount" @click="exportGuide">
          Exporter JSON <span aria-hidden="true">↗</span>
        </button>
      </div>
      <p v-if="state.status === 'stopped' && state.stepCount" class="hint compact">
        Exportez ce guide avant d’en commencer un autre. Le fichier peut être enrichi par le skill
        IA ou le CLI, puis affiché dans le lecteur Vue.
      </p>
    </section>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <aside class="tip">
      <span class="tip-index" aria-hidden="true">i</span>
      <p>
        <strong>Avant de valider un formulaire</strong>Utilisez « Capturer cette étape » pour
        conserver les champs remplis. La capture automatique après un clic peut déjà montrer l’écran
        suivant.
      </p>
    </aside>

    <details v-if="state.diagnostics.length" class="diagnostics">
      <summary>
        Points à vérifier <span>{{ state.diagnostics.length }}</span>
      </summary>
      <ul>
        <li v-for="diagnostic in state.diagnostics" :key="diagnostic.id">
          {{ diagnostic.message }}
        </li>
      </ul>
    </details>

    <footer>Images conservées en local · Masquez les données sensibles avant capture.</footer>
  </main>
</template>
