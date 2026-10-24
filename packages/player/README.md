# @interactive-learning/player

Le même lecteur pour **HTML/Vanilla, React et Svelte**. L’interface est écrite une seule fois en Vue ; ce package embarque son runtime et ses styles dans un Web Component. Aucune installation de Vue chez le consommateur. Pour une application Vue, préférer `@interactive-learning/vue` afin de réutiliser son runtime.

## HTML et JavaScript

```sh
pnpm add @interactive-learning/player
```

```html
<interactive-learning src="/guides/inscription/guide.json"></interactive-learning>
<script type="module">
  import '@interactive-learning/player/auto';
</script>
```

Cet import nu suppose un bundler ou une import map. Pour une page sans build, copiez **tout** `dist/` depuis le package vers `/vendor/interactive-learning/` et utilisez `<script type="module" src="/vendor/interactive-learning/auto.js"></script>`. Conservez les chunks voisins ; aucun CDN n’est nécessaire.

Un objet JSON peut aussi être affecté directement :

```ts
import { registerInteractiveLearning, validateGuide } from '@interactive-learning/player';

registerInteractiveLearning();
const player = document.querySelector('interactive-learning')!;
player.guide = validateGuide(documentJSON);
player.assetBaseUrl = '/guides/inscription/';
player.addEventListener('guide-load', () => player.play());
player.addEventListener('step-change', (event) => console.log(event.detail));
```

`src` charge et valide le JSON ; les images relatives se résolvent automatiquement depuis son URL finale. `guide` est une **propriété JavaScript**, jamais du JSON encodé dans un attribut, et prime sur `src`. Remplacer l’objet déclenche le rechargement ; ne pas muter le même objet en place. Le téléchargement précédent est annulé si la source change. Les URLs d’une autre origine doivent autoriser CORS.

## React 18 / 19

```tsx
import { InteractiveGuide } from '@interactive-learning/player/react';

export default function Guide() {
  return <InteractiveGuide src="/guides/inscription/guide.json" />;
}
```

Props : `guide`, `src`, `assetBaseUrl`, `showInformation` (contrôlé), `defaultShowInformation`, `onStepChange(index, step)`, `onInformationChange(visible)`, `onGuideLoad(guide)`, `onGuideError(message)`. Une `ref` donne accès aux méthodes du lecteur. Le petit adaptateur transmet les objets par propriétés et les événements par listeners natifs, y compris en React 18.

## Svelte 5

```svelte
<script lang="ts">
  import { InteractiveGuide } from '@interactive-learning/player/svelte';
  let information = $state(false);
</script>

<InteractiveGuide src="/guides/inscription/guide.json" bind:showInformation={information} />
```

Mêmes sources et callbacks qu’en React ; `bind:this` expose les méthodes. Les déclarations TypeScript sont produites par l’outil officiel `@sveltejs/package`.

## Contrat commun

| API                                    | Description                                   |
| -------------------------------------- | --------------------------------------------- |
| `play()`, `pause()`                    | Commandes de lecture                          |
| `seek(milliseconds)`                   | Position absolue                              |
| `goToStep(index)`                      | Étape, index à partir de zéro                 |
| `seekToStep(index)`                    | Étape et pause                                |
| `showInformation` / `show-information` | Titres et explications, désactivés par défaut |
| `step-change`                          | `detail: { index, step }`                     |
| `information-change`                   | `detail: { visible }`                         |
| `guide-load`                           | `detail: { guide }`, après montage du lecteur |
| `guide-error`                          | `detail: { message }`                         |

Les événements DOM remontent avec `bubbles: true` et `composed: true`. Les commandes sont utilisables après `guide-load` ; Play attend lui-même le chargement de l’image. L’attribut booléen `show-information` s’active par sa présence : pour désactiver, retirez-le ou affectez la propriété `false`.

L’import est compatible SSR. Le lecteur universel se monte **côté client**, dans un emplacement vide rendu côté serveur ; ce package ne prétend pas produire le contenu du lecteur en SSR. Les adaptateurs enregistrent la balise après montage. `registerInteractiveLearning({ nonce })` permet de fournir le nonce des styles pour une CSP ; appelez-le avant le premier montage. L’enregistrement est idempotent dans une page, qui doit charger une seule version du lecteur.

Les informations sont masquées par défaut et les commandes sont en surimpression. Aucun logo, navigation ou éditeur n’est ajouté. Les styles sont isolés dans le Shadow DOM ; le plein écran et les repères utilisent le même composant que l’intégration Vue.

Les sources des quatre applications sont dans `apps/example`, `apps/example-react`, `apps/example-svelte` et `apps/example-html`. Voir [l’architecture et ses limites](https://github.com/djdevpro/interactive-learning/blob/main/docs/multi-framework.md).
