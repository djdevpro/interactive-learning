# Interactive Learning Recorder

Outil de création de guides à partir de captures fournies par une extension humaine, les outils natifs d’un agent ou un fichier local. Ce package n’automatise pas le navigateur et ne rejoue pas d’actions métier.

## Installation

```sh
pnpm add -D @interactive-learning/recorder
pnpm exec interactive-learning doctor
```

Node.js 22.18 ou supérieur est requis. `doctor` indique également si l’extension et le skill sont présents dans la distribution.

## Extension humaine et skill IA

```sh
pnpm exec interactive-learning extension path
pnpm exec interactive-learning skill path
pnpm exec interactive-learning skill install --out .agents/skills/interactive-learning
```

`extension path` renvoie le dossier de l’extension Chrome/Edge embarquée, à charger comme extension non empaquetée pendant cette première version. `skill path` renvoie le dossier du skill fourni. `skill install` le copie dans un dossier neuf choisi explicitement ; pour Claude Code, utilisez par exemple `.claude/skills/interactive-learning`. La commande refuse tout dossier déjà présent et ne modifie aucune installation globale.

## Créer un guide

```sh
pnpm exec interactive-learning create --title "Inscrire un apprenti" --out guides/inscription/guide.json
pnpm exec interactive-learning capture add --guide guides/inscription/guide.json --image captures/inscription.png --title "Ouvrir les inscriptions" --description "Cliquez sur Ajouter." --x 0.72 --y 0.18
pnpm exec interactive-learning annotate --guide guides/inscription/guide.json --step STEP_ID --x 0.72 --y 0.18 --title "Ajouter" --body "Ce bouton ouvre le formulaire."
pnpm exec interactive-learning validate --guide guides/inscription/guide.json
```

Remplacez `STEP_ID` par le `stepId` renvoyé par `capture add`. Les coordonnées sont normalisées entre 0 et 1 dans le repère de l’image. `--x` et `--y` sont facultatifs pour une capture et doivent être fournis ensemble. La durée d’une étape vaut 2500 ms par défaut, comme dans l’extension ; `--duration-ms` accepte de 400 à 120000 ms.

Les commandes renvoient un objet JSON sur stdout. En cas d’échec, elles écrivent `{ "ok": false, "error": { "code": "...", "message": "..." } }` sur stderr et quittent avec le code 1.

## Actualiser une capture

```sh
pnpm exec interactive-learning capture replace --guide guides/inscription/guide.json --step STEP_ID --image captures/inscription-v2.png
```

Cette commande conserve l’identifiant, les textes, la durée et les annotations de l’étape. Elle retire le curseur et les anciennes métadonnées de capture. Le résultat JSON indique `annotationsRequireReview: true` si des annotations doivent être repositionnées ou vérifiées. Les images devenues inutilisées sortent du manifeste ; les fichiers source ne sont pas supprimés.

## Export

```sh
pnpm exec interactive-learning export --guide guides/inscription/guide.json --out public/guides/inscription
pnpm exec interactive-learning export --guide guides/inscription/guide.json --out exports/inscription --embed
```

La destination d’un export doit être un dossier qui n’existe pas encore. Le premier mode produit `guide.json` et `assets/` ; `--embed` produit un JSON autonome avec les images intégrées. Le guide source reste inchangé.

Le lecteur de production est fourni séparément par `@interactive-learning/vue`. Il n’a pas besoin de ce package.

## API TypeScript

```ts
import { RecordingSession, GuideExporter } from '@interactive-learning/recorder';

const session = await RecordingSession.create({
  filePath: 'guides/demo/guide.json',
  title: 'Découvrir le tableau de bord',
});
const step = await session.addCapture({
  imagePath: 'captures/dashboard.png',
  title: 'Créer un dossier',
  cursor: { x: 0.8, y: 0.2, action: 'click' },
});
await session.addAnnotation(step.id, { x: 0.8, y: 0.2, title: 'Nouveau dossier' });
await session.validate();
await new GuideExporter(session.guidePath).export({ outDirectory: 'exports/demo' });
```

Un guide existant s’ouvre avec `new RecordingSession('guides/demo/guide.json')`. Les images PNG, JPEG et WebP jusqu’à 12 Mio sont importées avec leurs dimensions lues dans le fichier, copiées sous un nom dérivé de leur contenu et référencées par un chemin relatif. Les modifications utilisent un verrou et une écriture atomique ; la création ne remplace aucun fichier existant. Les exports refusent les chemins d’assets qui sortent du dossier du guide.

## Développement

Le protocole interne est intégré au JavaScript et aux déclarations TypeScript du build. Le build du dépôt copie ensuite le skill dans `dist/skill` et l’extension dans `dist/extension/chrome-mv3` avant de créer l’archive npm.
