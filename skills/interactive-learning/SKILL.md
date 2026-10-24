---
name: interactive-learning
description: Créer ou mettre à jour un guide pédagogique Interactive Learning à partir de captures d'écran, de textes, de pointeurs et de repères. Utiliser pour documenter un parcours applicatif avec le navigateur de l'agent et le recorder installé, sans écrire de tests E2E.
---

# Interactive Learning

Produire un guide portable qui explique un parcours avec des images réelles. Le navigateur disponible effectue les gestes ; le CLI importe les images. Aucune dépendance Playwright ou serveur MCP n'est nécessaire.

## Préparer

- Utiliser le navigateur déjà accessible à l'agent, en respectant sa documentation. Vérifier qu'il peut produire des captures sauvegardables. Une capture uniquement affichée dans la conversation n'est pas encore un fichier importable.
- Utiliser le CLI installé : `pnpm exec interactive-learning doctor`. Dans le dépôt du SDK, employer `node packages/recorder/dist/cli.mjs` après `pnpm build`.
- Choisir un dossier de sortie local et des données de démonstration. Enregistrer un parcours reste une vraie interaction avec l'application : une action métier réelle conserve son niveau d'autorisation habituel.
- Si un format est demandé, régler le viewport avec les outils documentés du navigateur : par exemple 1600 × 900 pour du 16:9. Vérifier les dimensions CSS réellement appliquées et celles du fichier produit ; ne pas supposer que la taille demandée a été respectée. Garder ce cadrage pendant le parcours, puis rétablir le viewport temporaire.
- Créer le document : `interactive-learning create --title "Inscrire un apprenti" --out ./guide/guide.json`.

## Capturer et expliquer

1. Capturer le **viewport visible**, sans barre du navigateur, plutôt qu'une page entière défilante. Attendre le résultat utile : après une recherche, la liste filtrée ; après une navigation, le contenu chargé ; après l'ouverture d'un panneau, sa position finale. Un élément présent dans l'arbre d'accessibilité peut encore être en animation. Vérifier visuellement le cadrage et la stabilité de sa position entre deux observations, sans délai fixe arbitraire.
2. Pour montrer un clic, capturer **avant** le clic et noter son point dans ce même viewport. Vérifier que la cible est entièrement visible et que sa position n'a pas changé entre la mesure et la capture ; sinon, reprendre l'image et les coordonnées. Pour un formulaire, capturer l'état rempli avant l'envoi puis le résultat après l'envoi. Une page de destination ne reçoit jamais les coordonnées du bouton de la page précédente.
3. Sauvegarder le fichier PNG, JPEG ou WebP via une capacité documentée du navigateur, avec son extension réelle. Vérifier le fichier et son ratio : en 16:9, largeur × 9 = hauteur × 16. Si cette capacité manque, signaler cette limite et utiliser l'extension compagnon ou des fichiers fournis ; ne pas inventer une image ni changer silencieusement de navigateur. Ne pas modifier le DOM, masquer des éléments ou déformer l'image pour obtenir le cadrage souhaité.
4. Importer chaque image avec un titre orienté action et une explication courte :

```sh
interactive-learning capture add --guide ./guide/guide.json --image ./captures/01.png --title "Ajouter un apprenti" --description "Ouvrez le formulaire depuis la liste des apprentis." --x 0.82 --y 0.18
```

`x` et `y` sont normalisés de 0 à 1 : position dans la capture divisée par sa largeur et sa hauteur. Des coordonnées CSS se divisent par les dimensions CSS du viewport ; ne pas les mélanger aux pixels d'une image haute résolution. Omettre les deux coordonnées si le repère est incertain. Le CLI renvoie des identifiants stables dans son résultat JSON.

Une page peut défiler dans un panneau alors que `window.scrollY` reste nul. Mesurer la cible **après** ce défilement dans le viewport visible ; ne pas reconstruire sa position depuis le seul défilement du document. Conserver avec les captures le viewport, le DPR et le contexte utile du panneau défilé, lorsqu'ils sont accessibles. Les métadonnées de provenance ne remplacent pas la vérification visuelle.

5. Ajouter au besoin un repère sur l'étape, en utilisant son identifiant retourné :

```sh
interactive-learning annotate --guide ./guide/guide.json --step STEP_ID --x 0.82 --y 0.18 --title "Nouvelle inscription" --body "Ce bouton ouvre le dossier de l'apprenti."
```

## Régler le rythme

Une étape dure 2500 ms par défaut. Viser 2200 à 3000 ms pour un écran courant et jusqu'à 3500 ms pour un formulaire rempli ou un écran dense, avec `--duration-ms`. Garder les titres courts et placer le détail dans les repères : l'utilisateur peut mettre en pause pour les consulter. Vérifier le rythme en lecture continue avant livraison ; les attentes du navigateur lors de la capture ne deviennent pas des temps morts dans le guide.

## Vérifier et livrer

```sh
interactive-learning validate --guide ./guide/guide.json
interactive-learning export --guide ./guide/guide.json --out ./guide-portable --embed
```

L'export utilise un dossier inexistant. Ouvrir le guide dans la page Vue qui intègre `InteractiveGuide` pour essayer directement Play, pause, progression, retour arrière, repères et lisibilité. Vérifier aussi les transitions entre captures : le pointeur doit rester lié à la bonne image. Dans ce workflow de création de cours, ne pas créer de script de test sans demande explicite de l'utilisateur ; corriger les défauts observés puis refaire les gestes dans le navigateur. Dans le dépôt SDK, `pnpm dev` ouvre les cours de `apps/example/public/courses` ; `?sample=1` ouvre l'exemple minimal de `apps/example/public/example/guide.json`. Contrôler que les coordonnées désignent le bon élément et que les images ne contiennent pas de données à retirer. Rapporter le chemin du guide et les limites réelles de la capture.

Pour actualiser une étape : `interactive-learning capture replace --guide ./guide/guide.json --step STEP_ID --image ./captures/new.png`. La commande conserve l'identifiant, le titre, l'explication, la durée et les annotations, mais retire le pointeur de l'ancienne image. Les positions des annotations doivent être revues. Pour modifier les textes ou repères existants, utiliser le modèle TypeScript public, puis `validateGuide` et l'écriture du JSON ; ne pas annoncer de commande d'édition qui n'existe pas. Aucun éditeur visuel n'est prévu : l'auteur est le programme, l'IA ou l'extension. Les exports sont des images et du JSON, pas des scénarios exécutables.
