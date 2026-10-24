# Publier sur GitHub et npm

**GitHub héberge les sources. npm distribue les packages.** Un `git push` ne publie pas de package npm, et `release` ne choisit pas tout seul une nouvelle version.

| Commande                         | Effet                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `git push origin main`           | Envoie les commits sur GitHub ; lance formatage, types, builds et création d’archives.                                                        |
| `pnpm changeset`                 | Décrit la modification et choisit patch, minor ou major. L’IA peut préparer ce petit fichier.                                                 |
| `pnpm run deploy`                | Lance **Prepare release** sur le `main` déjà poussé et demande la PR de versions/changelogs. Nécessite GitHub CLI connecté.                   |
| `pnpm release:pack`              | Emballe les distributions déjà construites dans `.artifacts/release/`, avec tailles et SHA-256. Ne publie rien.                               |
| `pnpm release`                   | Vérifie les types, construit et publie sur npm les versions locales pas encore publiées. Nécessite une connexion npm. Aucun bump automatique. |
| GitHub Actions → **Publish npm** | Publie les versions préparées du `main` sélectionné via OIDC, puis crée les tags et releases GitHub.                                          |

Les workflows n’exécutent pas de tests automatisés. Les essais du lecteur se font directement dans le navigateur. `pnpm test` et l’ancien `pnpm pack:check` restent des outils distincts, à lancer seulement lorsque leur utilisation est souhaitée.

## Versions

- `@interactive-learning/vue` et `@interactive-learning/player` partagent la même version : ils distribuent le même lecteur. React et Svelte sont des points d’entrée du package `player`, pas des packages supplémentaires à synchroniser.
- `@interactive-learning/recorder` évolue indépendamment. Il embarque l’extension et le skill.
- Le protocole privé est intégré aux distributions. Son `schemaVersion` reste distinct des versions npm : un nouveau lecteur n’impose pas de modifier les JSON existants.

Changesets choisit le numéro d’après les fichiers `.changeset/*.md`, met à jour les versions et génère les changelogs. Il ne peut pas déduire la compatibilité d’un changement à votre place. [Versions et publication Changesets](https://changesets.dev/guide/versioning-and-publishing).

## Première publication : une seule configuration manuelle

Le dépôt cible est [`djdevpro/interactive-learning`](https://github.com/djdevpro/interactive-learning). Les noms `@interactive-learning/*` supposent que vous possédiez ce scope npm. **Le compte npm et la propriété du scope restent à confirmer ; ne pas confondre le compte GitHub avec le compte npm.** Si le scope change, renommer les packages et leurs imports avant la première publication.

1. Dans GitHub → **Settings → Actions → General**, activer **Allow GitHub Actions to create and approve pull requests** pour permettre les PR de version. Les workflows déclarent leurs permissions par job ; il n’est pas nécessaire de changer les permissions par défaut de tout le dépôt.
2. Sur votre ordinateur, connecter le compte npm propriétaire et publier les versions initiales, après revue des archives :

   ```sh
   npm login
   npm whoami
   pnpm typecheck
   pnpm build
   pnpm release:pack
   pnpm release
   git push origin --tags
   ```

   Le login et la validation npm/2FA sont interactifs. La première publication doit créer chaque package avant de pouvoir lui ajouter un trusted publisher. [Guide Changesets](https://changesets.dev/guide/versioning-and-publishing).

3. Pour chacun des trois packages, ouvrir npm → **Settings → Trusted Publisher** et configurer :

   | Champ                | Valeur                            |
   | -------------------- | --------------------------------- |
   | Provider             | GitHub Actions                    |
   | Organization or user | `djdevpro`                        |
   | Repository           | `interactive-learning`            |
   | Workflow filename    | `publish.yml`                     |
   | Environment          | Vide, le workflow n’en impose pas |
   | Allowed actions      | Autoriser **npm publish**         |

   Aucun `NPM_TOKEN` durable n’est nécessaire. Le job de publication dispose seul de `id-token: write`, utilise un runner GitHub hébergé et Node 24. npm exige au minimum Node 22.14 et npm 11.5.1. [Trusted publishing npm](https://docs.npmjs.com/trusted-publishers/).

## Les publications suivantes

```sh
pnpm changeset
git add .changeset
git commit -m "chore: describe next release"
git push origin main
pnpm run deploy
```

Relire puis fusionner la PR **chore: prepare package versions** : versions, changelogs et lockfile sont préparés automatiquement. Les archives construites avant cette fusion portent encore les anciennes versions.

Dans GitHub Actions, lancer **Publish npm** sur `main`. Le workflow refuse de publier tant qu’il reste des changesets à appliquer. Il construit les archives dans un job sans permission de publication, puis publie **ces mêmes archives** dans un job séparé, sans reconstruire les packages. Les tags et releases GitHub sont créés après publication. Aucun lancement npm n’est déclenché par un simple push.

Le déclenchement peut aussi se faire en ligne de commande :

```sh
gh workflow run publish.yml --ref main
```

Cette séparation suit les sous-actions officielles Changesets (`select-mode`, `version`, `pack`, `publish`) et conserve pnpm pour le monorepo. [Automatisation Changesets](https://changesets.dev/guide/automating).

## Archives et limites

`release:pack` découvre les packages publics de `packages/`, exécute `pnpm pack`, puis écrit un manifeste avec noms, versions, tailles et SHA-256 dans un nouveau sous-dossier. Il ne remplace pas une validation fonctionnelle ni les essais dans le navigateur. Les actions GitHub conservent ces archives comme livrables téléchargeables.

Les captures métier locales ne font pas partie des distributions npm. Les fichiers publiés sont limités par le champ `files` de chaque `package.json`. Publier le dépôt GitHub et publier les packages npm restent deux actions distinctes.
