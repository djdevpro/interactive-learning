# Interactive Learning

SDK de guides interactifs à partir de **captures d’écran et de JSON**. Un seul lecteur écrit en Vue / TypeScript, utilisable en **Vue, React, Svelte et HTML/Vanilla**. Trois packages npm, une extension WXT et un skill IA. La création se fait par programmation ou par l’IA ; aucun Studio.

## Démarrer le dépôt

Node **22.18+** et pnpm **9.10.0**.

```sh
pnpm install
pnpm build
pnpm dev:all
```

Quatre applications indépendantes permettent de lire le même guide capturé sur un prototype HTML wireframe :

| Application    | Commande individuelle | Adresse                                           |
| -------------- | --------------------- | ------------------------------------------------- |
| Vue            | `pnpm dev:vue`        | [localhost:4317](http://127.0.0.1:4317/?sample=1) |
| React          | `pnpm dev:react`      | [localhost:4318](http://127.0.0.1:4318/)          |
| Svelte         | `pnpm dev:svelte`     | [localhost:4319](http://127.0.0.1:4319/)          |
| HTML / Vanilla | `pnpm dev:html`       | [localhost:4320](http://127.0.0.1:4320/)          |

Chaque page affiche uniquement le player et ses commandes en surimpression. Titres et explications sont masqués par défaut ; le bouton « i » les affiche. `pnpm dev` reste un alias du lancement Vue.

Le **prototype HTML navigable** est une application distincte : `pnpm dev:wireframe` le lance sur [localhost:4321](http://127.0.0.1:4321/). Il sert à pratiquer l’enregistrement d’un parcours ; les quatre applications ci-dessus en lisent les captures et annotations. `pnpm dev:all` lance seulement les quatre lecteurs, pas le prototype.

Vue charge toujours ce guide partagé par défaut ; `?sample=1` le sélectionne aussi explicitement. Les cours métier locaux sont accessibles seulement avec `?cours=…`. `pnpm example:assemble` reconstruit le guide public depuis les [captures du wireframe](examples/README.md), sans reprendre de photos.

Les captures et cours métier sont ignorés par Git et ne sont pas nécessaires pour démarrer le dépôt. `pnpm courses:assemble` est réservé aux installations disposant de ces sources locales : cette commande assemble les fichiers, sans rejouer les actions dans l’application.

## Enregistrer avec l’extension

Après `pnpm build`, chargez `apps/extension/.output/chrome-mv3` dans Chrome via `chrome://extensions` → mode développeur → **Charger l’extension non empaquetée**.

1. Ouvrez la page à documenter, puis le popup de l’extension.
2. Nommez le guide et démarrez l’enregistrement.
3. Effectuez les gestes du parcours. Pour conserver le formulaire rempli, utilisez **Capturer cette étape** avant de valider.
4. Terminez et exportez le JSON avec ses images intégrées.

L’extension cible l’onglet actif et le site de départ. Les transitions rapides peuvent empêcher la capture avant action ; les pointeurs incertains sont omis. Voir les [limites et permissions](apps/extension/README.md).

## Créer un guide par programmation ou avec l’IA

Dans ce dépôt, le CLI se lance avec `pnpm cli`. Dans un projet consommateur, après installation du recorder, utilisez `pnpm exec interactive-learning`.

```sh
pnpm cli create --title "Inscrire un apprenti" --out ./mon-guide/guide.json
pnpm cli capture add --guide ./mon-guide/guide.json --image ./capture.png --title "Ajouter un apprenti" --description "Ouvrez le formulaire." --x 0.82 --y 0.18
pnpm cli validate --guide ./mon-guide/guide.json
pnpm cli export --guide ./mon-guide/guide.json --out ./guide-portable --embed
```

Les coordonnées sont normalisées dans **l’image du clic**, entre 0 et 1. Le CLI retourne du JSON avec les IDs d’étapes, utilisables par `annotate` ou `capture replace`. L’API publique expose `RecordingSession`, `GuideExporter`, `validateGuide`, `createGuide` et les types du document. Voir l’[API du recorder](packages/recorder/README.md).

Le [skill IA](skills/interactive-learning/SKILL.md) utilise le navigateur de l’agent pour prendre de vraies captures, puis le CLI pour les assembler. Il est inclus dans le package recorder :

```sh
pnpm cli doctor
pnpm cli skill path
pnpm cli skill install --out ./mon-projet/.agents/skills/interactive-learning
pnpm cli extension path
```

Le dossier d’installation du skill doit être neuf. L’extension et les autorisations de capture se chargent dans le navigateur ; une installation npm ne peut pas le faire silencieusement.

## Choisir son intégration

| Package                          | Utilisation                                                           |
| -------------------------------- | --------------------------------------------------------------------- |
| `@interactive-learning/vue`      | Lecteur Vue natif ; réutilise Vue dans l’application                  |
| `@interactive-learning/player`   | Web Component HTML/Vanilla ; adaptateurs `/react` et `/svelte` inclus |
| `@interactive-learning/recorder` | CLI/API, extension et skill IA, en dépendance de développement        |

Les packages ne sont pas encore publiés sur npm ; le scope reste à confirmer. Après `pnpm build`, `pnpm release:pack` produit leurs archives locales, installables avec `pnpm add /chemin/package.tgz`.

Exemple Vue :

```vue
<script setup lang="ts">
import { InteractiveGuide, validateGuide } from '@interactive-learning/vue';
import '@interactive-learning/vue/style.css';
import document from './guide.json';

const guide = validateGuide(document);
</script>

<template>
  <InteractiveGuide :guide="guide" />
</template>
```

Pour un export avec images séparées, servez son dossier et renseignez `asset-base-url="/guides/inscription/"`. Le [lecteur](packages/vue/README.md) expose Play, pause, seek, étapes et annotations accessibles au clavier.

Pour React, Svelte et HTML, consulter les [intégrations du lecteur universel](packages/player/README.md). Le Web Component embarque Vue et son CSS ; le projet consommateur n’a pas besoin d’installer Vue. Les adaptateurs utilisent le même lecteur, sans recopier son interface.

## Organisation et versions

```text
packages/vue/        Lecteur Vue natif
packages/player/     Lecteur universel, adaptateurs React et Svelte
packages/recorder/   CLI et API publiés ; extension et skill embarqués
packages/protocol/   Contrat partagé privé, intégré aux distributions
apps/extension/     Extension WXT Vue / TypeScript
apps/example/       Application Vue indépendante
apps/example-react/ Application React indépendante
apps/example-svelte/ Application Svelte indépendante
apps/example-html/  Application HTML/Vanilla indépendante
apps/wireframe/     Prototype HTML navigable à capturer (port 4321)
skills/             Skill IA portable
scripts/            Assemblage et contrôle des archives
```

## Versions et publication

`pnpm changeset` décrit une évolution. Après envoi sur GitHub, `pnpm run deploy` demande la PR de versions et changelogs ; **ce n’est pas une publication npm**. Le mot `run` est nécessaire : `pnpm deploy` désigne une autre commande intégrée à pnpm. `pnpm release` publie les versions préparées avec un compte npm connecté. La [procédure de publication](docs/releases.md) explique la première publication et le workflow GitHub **Publish npm** pour les suivantes.

Vue et player partagent une version ; le recorder évolue indépendamment. Le schéma JSON `1.0.0` est versionné séparément. Les sous-chemins React et Svelte suivent automatiquement la version de player.

`pnpm typecheck`, `pnpm build` et `pnpm format:check` vérifient types, distributions et formatage. Les essais fonctionnels se font dans les applications du navigateur. `pnpm check` inclut aussi les tests automatisés ; `pnpm pack:check` exécute des vérifications automatisées de consommation. Ces deux commandes sont distinctes du flux de publication et se lancent seulement lorsque leur utilisation est souhaitée.

Voir l’[architecture](docs/architecture.md), les [choix multi-frameworks sourcés](docs/multi-framework.md) et l’[analyse du recorder](docs/architecture-review.md).
