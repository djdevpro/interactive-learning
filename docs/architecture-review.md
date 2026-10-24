# Revue critique — SDK de guides par captures

Recherche arrêtée au 24 octobre 2026. Cette version remplace l’analyse précédente et respecte le périmètre précisé : notre recorder photographie une démonstration, puis produit un guide interactif. Il ne doit pas devenir un moteur de tests ou de rejeu métier.

## Verdict

**Deux packages npm, un format de guide commun et deux sources de captures.**

- Un humain enregistre sa démonstration avec notre recorder, idéalement via une extension compagnon.
- Une IA utilise son navigateur disponible et un skill pour photographier les étapes, puis les importer.
- Le CLI et l’API TypeScript éditent le résultat, directement ou via le skill IA. L’utilisateur a exclu le Studio visuel.
- Le lecteur Vue affiche le JSON et les images.

Ni Playwright ni un serveur MCP ne sont nécessaires au cœur du SDK. Un skill accompagné d’une CLI structurée suffit pour un agent capable de piloter un navigateur et d’exporter les images.

Le risque principal devient la capture du bon état au bon instant, notamment juste avant une navigation ou une soumission, et son association au bon point de clic.

## Méthode

La recherche croise les documentations Chrome, MDN, OpenAI, Anthropic, WXT, Vue et les outils de packaging, ainsi que des échanges de développeurs sur Chromium Extensions et des exemples de code ouverts. Trois agents ont également produit des contre-analyses.

Aucun développeur externe n’a été personnellement sollicité. Les retours de forums sont des témoignages, pas un consensus de seniors vérifiés. Les anciens incidents illustrent des pièges de conception ; ils ne sont pas présentés comme des bugs toujours ouverts.

## 1. Bien distinguer les responsabilités

| Responsabilité            | Ce que nous développons                                               |
| ------------------------- | --------------------------------------------------------------------- |
| Observer la démonstration | Clics, navigation, état des champs, défilements, marqueurs d’étape    |
| Obtenir les pixels        | Adaptateur extension ou import des images du navigateur de l’IA       |
| Construire le guide       | Ordre, texte, pointeur, annotations, durée, recadrage et remplacement |
| Lire le guide             | Timeline, Play/pause, retour arrière, pastilles et accordéons         |

Les coordonnées décrivent une image du guide. Elles ne servent pas à cliquer ultérieurement dans l’application réelle. Le document public n’a donc besoin ni de sélecteurs exécutables, ni de résultats métier attendus.

Lorsqu’une page change, on remplace ses captures, éventuellement au cours d’une séance menée par l’IA. Les identifiants d’étape et les textes peuvent être conservés. Si les boutons ont bougé, leurs annotations doivent être repositionnées.

## 2. Pourquoi le JavaScript injecté ne suffit pas à lui seul

Un script sait observer les événements et lire le DOM. Les permissions nécessaires pour photographier les vrais pixels constituent une capacité distincte.

| Moyen de capture                    | Intérêt                                                | Limite                                                                     |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Script injecté + reconstruction DOM | Intégration possible dans un projet instrumenté        | Rendu reconstruit, fidélité variable selon CSS et ressources               |
| Extension avec API native           | Image du rendu visible et accès à la session existante | Extension à installer et permissions à gérer                               |
| Partage d’onglet                    | Pixels réels sans extension propriétaire               | Autorisation utilisateur à chaque session et continuité à organiser        |
| Navigateur de l’IA                  | Réutilise les outils déjà disponibles à l’agent        | Export réel des images et métadonnées à vérifier pour chaque environnement |

La documentation de html2canvas précise qu’il reconstruit une représentation depuis le DOM ; ce n’est pas une photographie native. Elle décrit les limites de CSS et de ressources interorigines. Je ne le retiens donc pas comme fondation de fidélité pour ce SDK. [Fonctionnement html2canvas](https://html2canvas.github.io/html2canvas/documentation/).

Le partage d’écran via `getDisplayMedia` demande une activation et une autorisation explicites, non persistantes entre demandes. Il reste une solution valable si l’on privilégie l’absence d’extension, avec un démarrage de session assisté. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).

**Ma préférence : extension compagnon pour l’humain, import de captures pour l’IA.** Cette recommandation ajoute une installation navigateur unique ; npm ne peut pas accorder silencieusement les permissions de l’extension.

## 3. Extension : séparer observation et capture

Le content script collecte les clics et le contexte de la page. Il transmet au coordinateur de l’extension, qui gère la session et les images.

L’API native `captureVisibleTab` capture la zone visible de l’onglet actif, depuis un contexte d’extension ; elle est asynchrone et limitée à deux appels par seconde. Il faut donc une file et un regroupement des événements, pas une capture lancée sans limite à chaque événement DOM. [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs).

Pour les pages classiques et les SPA, les événements de navigation et de changement d’historique permettent de détecter les transitions. Ils ne signifient pas nécessairement que toutes les données de la page ont fini de s’afficher. [Chrome webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation).

Je propose une stabilisation visuelle courte et bornée, avec possibilité de capturer immédiatement ou de remplacer la prise. C’est une heuristique d’image, pas une assertion métier.

Les permissions temporaires de `activeTab` persistent lors de navigations sur la même origine et cessent lors d’un changement d’origine. Le recorder doit gérer cette transition explicitement. [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

## 4. Le cas délicat : formulaire rempli, puis soumission

Le guide recherché ressemble à ceci :

1. Le formulaire apparaît.
2. L’auteur le remplit.
3. Une image montre le formulaire rempli et le bouton de validation.
4. Une autre image montre le résultat de la soumission.

**Déclencher une capture quand l’événement submit arrive ne garantit pas l’image de l’étape 3.** Entre l’événement et le retour de la capture asynchrone, l’application peut déjà avoir changé d’écran.

De plus, écouter seulement `submit` ne couvre pas toutes les applications : l’appel direct à `form.submit()` ne produit pas cet événement. Certaines interfaces réagissent à un clic sans formulaire HTML. [MDN submit](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event).

Deux stratégies à comparer au prototype :

- **Capture légère** : prises après édition, conservation du dernier état, capture explicite « maintenant ». Faible coût ; une transition très rapide peut nécessiter de refaire une image.
- **Tampon de frames en mémoire** : lire un flux d’onglet et conserver brièvement les images les plus récentes pour sélectionner celle précédant l’action. Seules les captures d’étapes sont persistées. Cela améliore la couverture des transitions sans enregistrer de vidéo finale.

Chrome documente la capture dans un document offscreen pour continuer au travers des navigations. Cette base convient à l’évaluation du tampon ; elle ne garantit pas à elle seule la précision de notre sélection de frames. Mesurer alignement temporel, qualité, mémoire et CPU. [Capture Chrome](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture).

Le recorder doit laisser les interactions naturelles se dérouler. Bloquer puis réémettre chaque clic pourrait modifier le comportement des applications et ne constitue pas une bonne base générique.

Pour l’IA, la séquence est plus simple à organiser : le skill demande explicitement de photographier le formulaire rempli avant de le soumettre, puis de photographier le nouvel écran.

## 5. Associer correctement point de clic et image

Un clic de la page A ne doit pas être affiché sur l’image de la page B obtenue après navigation.

Le modèle relie un événement visuel à la capture où il a eu lieu, puis à l’état suivant. Une étape pédagogique peut comporter plusieurs captures ; l’éditeur décide ce qu’il montre au lecteur.

Conserver les dimensions réelles de l’image et son cadrage. Lorsqu’ils sont disponibles, conserver aussi viewport, défilement, zoom, DPR et coordonnées client. Les positions doivent ensuite être converties dans le repère de cette image. Les `clientX/clientY` concernent le viewport, pas automatiquement les pixels d’une image exportée. [MDN clientX](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/clientX).

Les positions normalisées facilitent le redimensionnement proportionnel, mais ne rendent pas un screenshot responsive au sens d’une interface qui réorganise son contenu. Prévoir zoom et explications lisibles hors de l’image.

La V1 devrait photographier les zones visibles et traiter les longs formulaires en plusieurs étapes. Les captures pleine page assemblées impliquent des questions de scroll, lazy loading et éléments fixes qui méritent une fonction dédiée.

## 6. Skill ou MCP pour l’IA ?

**Le skill est le bon point de départ.** Il décrit les étapes de la procédure et utilise les outils disponibles à l’agent. Les skills Codex peuvent inclure instructions, ressources et scripts. [OpenAI Docs — skills réutilisables](https://learn.chatgpt.com/use-cases/reusable-codex-skills).

Un skill ne crée pas lui-même une capacité de capture. Il faut vérifier trois choses :

1. L’agent peut contrôler le navigateur visé.
2. Il peut récupérer les octets ou un fichier image exploitable.
3. Il peut transmettre cette image au recorder.

Claude Code documente la sauvegarde de captures sur disque dans son intégration Chrome. Cela constitue une voie d’import concrète lorsqu’elle est configurée. [Claude Code avec Chrome](https://code.claude.com/docs/en/chrome#save-screenshots-to-disk).

La documentation OpenAI décrit aussi le travail avec des navigateurs connectés et intégrés, mais cela ne définit pas une API d’export universelle pour tous les agents et toutes les sessions. La compatibilité se prouve par un import réel dans notre SDK. [Navigateur OpenAI](https://learn.chatgpt.com/docs/chrome-extension).

Interface cible du recorder :

- créer un guide ;
- importer une capture ;
- créer ou modifier une étape ;
- ajouter une annotation ;
- remplacer une capture en conservant l’étape ;
- valider et exporter.

La CLI accepte des données structurées et retourne des identifiants exploitables. Une API HTTP locale peut recevoir les images de l’extension. MCP pourra se brancher ultérieurement sur les mêmes opérations si nécessaire. Le SDK ne dépend pas de la technologie interne du navigateur de l’agent.

## 7. Contrat portable et organisation

Deux packages publics suffisent :

- `recorder` pour CLI, édition et import/export, installé côté développement ;
- `vue` pour le lecteur public.

L’extension compilée et le skill sont livrés avec le recorder, avec leur mode d’installation propre. L’auteur utilise le CLI ou l’API TypeScript ; aucun Studio n’est livré. Un module privé de protocole porte schémas, types et validation.

Les interfaces publiques manipulent des objets simples : guide, chapitre, étape, capture, annotation. Les classes implémentent les services internes : `RecordingSession`, `GuideEditor`, `GuideExporter`, `TimelineController`. Cela évite d’exiger une identité de classe commune entre deux copies de package.

Chaque capture importée est copiée dans les assets du projet et référencée durablement. Un chemin temporaire, une URL signée expirante ou un identifiant d’image de conversation ne doit pas être nécessaire à la lecture. L’export contient JSON et médias avec chemins relatifs ; le site d’origine peut être indisponible sans empêcher la consultation.

Le contenu éditorial est attaché à l’étape, pas au nom du PNG. La recapture remplace l’asset et laisse l’auteur vérifier les points avant de publier une nouvelle version.

## 8. Starters et versions

Pour l’extension, **WXT possède un starter Vue, TypeScript par défaut**, et un exemple officiel de capture de l’onglet actif. C’est une base plus directement adaptée au recorder humain que le codegen d’un outil de tests. [Installation WXT](https://wxt.dev/guide/installation), [exemple screenshot WXT](https://github.com/wxt-dev/examples/tree/main/examples/active-tab-screenshot).

Pour les autres briques :

- pnpm et Node pour le workspace ;
- Vite en mode bibliothèque pour le lecteur Vue ;
- Vite pour l’exemple de lecture du SDK, non publié ;
- tsdown pour les outils TypeScript.

Le starter Vue de tsdown existe, mais sa documentation indique encore un CSS expérimental. Je conserve donc Vite pour les éléments visuels par prudence technique, à réévaluer si un prototype justifie l’unification. [CSS tsdown](https://tsdown.dev/options/css), [bibliothèque Vite](https://vite.dev/guide/build#library-mode).

Versions indépendantes des packages et version explicite du schéma du guide. L’extension annonce le protocole qu’elle produit ; le recorder vérifie qu’il le comprend. La commande d’intégration choisit un lecteur compatible. Les migrations conservent les originaux.

Changesets prépare versions et changelogs ; la CI vérifie les distributions puis publie après le raccordement npm initial. Un même numéro dans tous les composants ne remplacerait pas les tests du format. [Changesets](https://changesets.dev/guide/config), [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

## 9. Ce que les échanges de développeurs apportent

Les forums Chromium Extensions contiennent des cas concrets de permissions différentes entre popup et panneau latéral. Une discussion de juin 2023 puis un retour de juillet 2024 illustrent l’importance du contexte de démarrage de la capture. Ces échanges sont historiques : ils motivent un test de notre propre interface, sans établir que le bug persiste aujourd’hui. [Discussion 2023](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/DET2SXCFnDg), [discussion 2024](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/uTtfM3Xbc3U/m/a53H7oYiAQAJ).

Une demande Chromium de juin 2025 porte sur l’ajout d’un rectangle de capture natif. Elle montre que recadrage et coût des grandes images sont des sujets d’implémentation réels. Notre design doit conserver le repère de l’image et pouvoir recadrer après capture, sans supposer une API uniforme entre navigateurs. [Ticket Chromium](https://issues.chromium.org/issues/423658618).

Ces retours appuient trois recommandations : choisir explicitement les navigateurs supportés, tester le cycle de permissions réel, et maintenir l’accès aux pixels derrière un adaptateur. Ils ne justifient pas de complexifier le produit avec une orchestration de tests métier.

## 10. Validation avant développement complet

Un prototype doit produire le même guide de quatre états par deux voies : une démonstration humaine et une séance IA.

À vérifier :

- capture initiale, nouvelle page, menu et formulaire rempli ;
- état conservé avant soumission et état obtenu après ;
- continuité lors de navigations complètes et SPA ;
- point de clic associé à la bonne image et au bon défilement ;
- import des images de l’agent dans un format durable ;
- remplacement d’une capture sans perdre les textes ;
- lecture avec Play, pause et retour arrière ;
- deux lecteurs indépendants sur une même page ;
- navigation clavier et alternative textuelle ;
- archive autonome et installation réelle des packages npm.

Mesurer particulièrement les transitions très rapides et le coût du tampon de frames. Si le tampon n’apporte pas assez de fiabilité, conserver un marqueur de capture explicite au lieu de promettre une photographie exacte de tout état transitoire.

Cette validation concerne notre outil de capture et son lecteur. Les actions métier restent celles de la démonstration réalisée par l’humain ou l’IA.
