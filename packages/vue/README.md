# @interactive-learning/vue

Lecteur Vue 3.5 de guides à base de captures. Il n'exécute aucune action sur le site capturé et ne dépend d'aucun navigateur automatisé.

```vue
<script setup lang="ts">
import { InteractiveGuide, type GuideDocument } from '@interactive-learning/vue';
import '@interactive-learning/vue/style.css';

defineProps<{ guide: GuideDocument }>();
</script>

<template>
  <InteractiveGuide :guide="guide" asset-base-url="/guides/mon-guide/" />
</template>
```

`guide` est un document validé au format `1.0.0`. `assetBaseUrl` est facultatif : il préfixe les références relatives d'images. Les images embarquées PNG, JPEG et WebP restent autonomes. Valider les documents externes avant de les transmettre au lecteur.

Les outils de format sont inclus dans ce même package : `createGuide(title, description?)` crée un guide vide ; `validateGuide(value)` valide et normalise des données inconnues ou lève une `GuideValidationError` avec le chemin du champ invalide. `SCHEMA_VERSION` donne la version du format. Les types `GuideDocument`, `GuideAsset`, `GuideStep`, `GuideCursor`, `GuideAnnotation`, `CaptureContext`, `Point` et `ImageMimeType` sont également exportés.

```ts
import { createGuide, validateGuide } from '@interactive-learning/vue';

const draft = createGuide('Accueillir un apprenti');
const guide = validateGuide(JSON.parse(savedJson));
```

Par défaut, le composant affiche uniquement la capture et les commandes en surimpression, sans titre, description ni habillage. Le bouton « i » affiche ou masque ensemble les informations du haut et du bas, y compris l’accordéon. Ce réglage est aussi pilotable avec `v-model:show-information` (valeur initiale `false`). Chaque instance conserve son propre réglage.

Le lecteur propose lecture, pause, retour arrière, navigation d'étape et repères numérotés. Les repères restent visibles lorsque les informations sont masquées ; leur numérotation se poursuit sur tout le guide (1, 2, 3…), et reste identique après un retour arrière. Le pointeur est interpolé dans le repère normalisé de la capture ; les mouvements sont désactivés lorsque la préférence de mouvement réduit est active. Chaque instance possède son état de lecture.

Le temps de lecture attend le chargement de chaque capture. Les pointeurs et repères ne s'affichent qu'une fois l'image disponible. Une image en échec met la lecture en pause et propose de réessayer ; les commandes de navigation restent accessibles. Une pause demandée pendant le chargement reste respectée après son chargement.

Le bouton « Agrandir le lecteur » utilise le plein écran natif lorsque le navigateur l'autorise. La capture conserve ses proportions ; les commandes restent superposées au bas de l'image. Le bouton « i » reste disponible en plein écran. Échap ferme d'abord un repère ouvert ; sans repère ouvert, Échap ou « Quitter le plein écran » ramène à la page.

Sur le lecteur focalisé : Espace lit ou met en pause ; les flèches passent à l’étape précédente ou suivante ; Début et Fin rejoignent les extrémités. Les boutons et la barre de progression restent utilisables nativement au clavier. Un appui sur un repère suspend immédiatement la lecture pour éviter un changement d’écran pendant le clic ; l’infobulle s’ouvre au relâchement. Au clavier, Tab focalise et met en pause, puis Entrée/Espace ouvre ou ferme le repère. Le simple survol ne l’interrompt pas. Un second clic sur le repère, le bouton de fermeture, Échap, un clic sur la capture ou la reprise de lecture ferme l’infobulle.

Le bouton de vitesse alterne entre 1×, 1,5× et 2×. Il accélère la lecture et le mouvement du curseur sans modifier les durées du JSON ; le temps affiché reste celui du guide. Chaque nouvelle capture attend son chargement avant de reprendre. Les commandes blanches se superposent au bas de la capture sur un dégradé sombre, toujours sur une ligne. Le chrono se masque sous 520 px ; sous 360 px, les boutons précédent/suivant laissent la place à la progression et aux raccourcis clavier. Les repères mesurent 24 px et conservent une zone cliquable de 40 px. Un repère trop proche des commandes est décalé au-dessus, avec un trait vers sa position d’origine ; les coordonnées du JSON restent intactes. Les infobulles évitent autant que possible les autres repères et restent au-dessus de la barre.

L'événement `step-change` reçoit `(index, step)`. Une référence de composant expose `play()`, `pause()`, `seek(milliseconds)`, `goToStep(index)` et `seekToStep(index)`. Cette dernière met d'abord la lecture en pause : elle convient à la sélection d'une étape depuis une liste de chapitres.

`TimelineController` est également exporté. Cette classe pure reçoit un tableau `{ id, durationMs }`, puis calcule son état avec `play`, `pause`, `seek`, `advance`, `goToStep`, `next` et `previous`. Elle ne crée aucun timer et fonctionne sans DOM.

Personnalisation : sur `.il-guide`, surcharger notamment `--il-accent`, `--il-paper`, `--il-surface` et `--il-ink`. Les styles sont préfixés ; Vue reste une dépendance pair.
