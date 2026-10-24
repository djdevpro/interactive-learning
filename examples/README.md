# Guide capturé sur le wireframe

Le prototype **HTML navigable** se trouve dans `apps/wireframe`. Depuis la racine, `pnpm dev:wireframe` le sert sur [localhost:4321](http://127.0.0.1:4321/). Il permet de parcourir des écrans, remplir un formulaire et observer son résultat avant de photographier chaque étape.

`wireframe/captures/` conserve les captures réelles et leurs positions de pointeur et de repères, normalisées dans le viewport photographié. Ces fichiers servent au guide public commun aux quatre intégrations : Vue, React, Svelte et HTML/Vanilla.

Après le build, `pnpm example:assemble` assemble les images et annotations avec le recorder, valide le document et exporte le JSON portable dans `apps/example/public/example/guide.json`. Les quatre lecteurs utilisent ce même guide. Cette commande ne rejoue aucune action et ne prend pas de nouvelles captures.

Pour actualiser les visuels, le skill ou l’extension parcourt le prototype et réalise de nouvelles captures. Le CLI `capture replace` permet de changer une image en préservant l’identité et le texte de son étape.

`pnpm dev:all` lance uniquement les quatre lecteurs (ports 4317 à 4320). Le prototype à capturer se lance séparément avec `pnpm dev:wireframe` (4321). Les captures métier locales ne font pas partie de cet exemple public.
