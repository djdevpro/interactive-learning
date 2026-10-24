# Prototype HTML navigable

Wireframe neutre, sans marque, sans données métier, sans connexion ni appel réseau. Les blocs gris sont des placeholders statiques. Les liens, le formulaire et la création locale du projet fonctionnent réellement.

```sh
pnpm --filter @interactive-learning/wireframe dev
```

Adresse : <http://127.0.0.1:4321/#/projects>.

Parcours à photographier :

1. `#/projects` : cliquer sur **Nouveau projet**.
2. `#/projects/new` : remplir **Nom du projet** et éventuellement **Description**.
3. Photographier le formulaire rempli, puis cliquer sur **Créer le projet**.
4. `#/projects/demo` : la fiche affiche le projet créé.

Les routes `#/overview` et `#/activity` sont aussi navigables. Les noms saisis restent uniquement en mémoire dans l’onglet et sont réinitialisés au rechargement. Une ouverture directe de `#/projects/demo` affiche le projet de démonstration prédéfini.

Viewport conseillé pour les captures : **1600 × 900**. Aucun délai ni animation de squelette n’est nécessaire.
