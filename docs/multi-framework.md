# Un lecteur, plusieurs frameworks

Le lecteur reste écrit **une seule fois en Vue et TypeScript**. Un Web Component l’encapsule pour les projets React, Svelte et HTML/JavaScript. Les adaptateurs ne contiennent ni interface, ni logique de lecture : ils raccordent seulement les propriétés, événements et références.

| Distribution                          | Usage                                         | Rendu                                                 |
| ------------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| `@interactive-learning/vue`           | Application Vue                               | Composant Vue natif ; utilise le Vue de l’application |
| `@interactive-learning/player`        | HTML, Vanilla JS, tout framework compatible   | Custom Element avec Vue embarqué et styles isolés     |
| `@interactive-learning/player/react`  | Application React                             | Adaptateur typé vers le même Custom Element           |
| `@interactive-learning/player/svelte` | Application Svelte                            | Adaptateur typé vers le même Custom Element           |
| `@interactive-learning/player/auto`   | Enregistrement automatique dans le navigateur | Même lecteur ; aucune seconde implémentation          |

Les sous-chemins `react`, `svelte` et `auto` appartiennent au **même package et à la même version**. Le recorder reste un package de développement distinct. Le schéma JSON conserve sa propre version, indépendante des versions npm.

## Pourquoi ce choix

Vue fournit officiellement `defineCustomElement`, qui transforme un composant Vue en élément HTML réutilisable, avec propriétés JavaScript, événements DOM et styles dans un Shadow DOM. Cela permet de conserver le lecteur existant et ses corrections. Le coût est un runtime Vue embarqué pour les applications non-Vue ; « Vanilla » signifie ici utilisable sans framework dans l’application hôte, pas dépourvu de runtime interne. La documentation Vue signale ce coût : le poids réel de notre distribution doit être mesuré au build. [Documentation Vue](https://vuejs.org/guide/extras/web-components.html)

React prend en charge les custom elements, mais distingue attributs texte et propriétés JavaScript. Le guide est un objet : l’adaptateur affecte explicitement cette propriété et raccorde les événements, sans dépendre de l’ordre d’enregistrement de l’élément. Il fournit aussi des types JSX. [Documentation React](https://react.dev/reference/react-dom/components#custom-html-elements)

Svelte peut écouter les événements DOM avec les attributs `on…`. Un petit adaptateur donne une API de composant typée, tout en conservant le même rendu universel. [Documentation Svelte](https://svelte.dev/docs/svelte/basic-markup#Events)

## Alternatives examinées

| Solution                           | Intérêt                                                                        | Décision                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Quatre lecteurs indépendants       | API totalement native partout                                                  | Écartée : corrections et comportements à maintenir quatre fois                                       |
| Vue → Custom Element + adaptateurs | Réutilise notre interface et notre moteur                                      | Retenue                                                                                              |
| Lit + adaptateurs                  | Conçu pour les Web Components ; `@lit/react` raccorde propriétés et événements | Valable pour un nouveau projet, mais impose ici de réécrire le lecteur                               |
| Stencil + génération               | Génère notamment les adaptateurs React et Vue                                  | Utile pour une vaste bibliothèque ; impose un changement d’outil et de source pour notre lecteur Vue |

Les générateurs réduisent les adaptateurs, mais ne convertissent pas gratuitement notre interface Vue en plusieurs implémentations natives. [Lit](https://lit.dev/docs/frameworks/react/), [Stencil](https://stenciljs.com/docs/overview)

## Contrat et limites

- **Une source de vérité** : même SFC, même moteur de lecture, mêmes styles et schéma JSON. Aucun écran recopié dans les adaptateurs.
- **Styles isolés** : le Custom Element inclut son CSS dans le Shadow DOM. Le composant Vue natif conserve son CSS exporté.
- **Événements explicites** : le pont public documente le contenu des événements. Les événements produits directement par Vue Custom Elements utilisent un tableau dans `detail` ; cette convention ne doit pas se propager accidentellement aux adaptateurs.
- **Plein écran** : le lecteur détecte l’élément actif dans son propre arbre DOM, y compris un Shadow DOM. Comparer seulement `document.fullscreenElement` serait incorrect. [API Fullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)
- **SSR** : le lecteur universel est rendu côté navigateur. Un serveur peut produire son emplacement, mais cela ne constitue pas le rendu serveur de son contenu. L’import ne doit pas accéder à `window`, `document` ou enregistrer un élément sans environnement navigateur ; les adaptateurs montent le lecteur côté client. Un vrai rendu serveur du Shadow DOM est un chantier distinct, non promis ici.
- **Accessibilité et cycles de vie** : les raccourcis, le focus et les événements restent internes au lecteur ; les adaptateurs doivent nettoyer leurs abonnements et supporter un démontage/remontage.
