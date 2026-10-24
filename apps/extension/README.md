# Recorder Interactive Learning

Extension Chrome Manifest V3 avec WXT, Vue et TypeScript. Le modèle officiel Vue WXT a servi de référence ; la commande d'amorçage a été interrompue faute d'accès réseau, puis la structure a été créée localement.

## Utilisation

Depuis la racine : `pnpm --filter @interactive-learning/extension build`. Dans Chrome, ouvrez `chrome://extensions`, activez le mode développeur puis chargez le dossier `.output/chrome-mv3` de cette application. L'installation est manuelle : le package ne modifie pas votre navigateur système.

1. Ouvrez le site à documenter puis cliquez sur l'extension.
2. Nommez le guide et démarrez. Fermez le popup pour effectuer votre parcours.
3. Les clics, champs stabilisés, défilements et navigations sur le même site produisent des captures.
4. Pour conserver un formulaire rempli, ouvrez le popup et cliquez **Capturer cette étape** avant de valider.
5. Terminez puis exportez le JSON. Il contient les images PNG ; le composant Vue `InteractiveGuide` le lit directement. Les textes et annotations peuvent être enrichis par programmation ou par le skill IA.

Les images et guides sont dans IndexedDB, l'état dans `chrome.storage.local`. Aucun serveur ni outil d'automatisation n'est nécessaire. Le service worker séquence les captures avec au moins 600 ms d'intervalle. Limites de ce prototype : 500 étapes et 80 Mo par guide, 12 Mo par image. Exportez le guide courant avant d'en démarrer un autre.

## Garanties et limites

- L'observateur ne bloque ni ne rejoue les clics ou les soumissions. Il ne collecte pas les valeurs des champs séparément des images visibles.
- Une capture déclenchée par un clic ou une soumission est asynchrone : elle peut montrer le résultat de l'action. La capture préalable de chaque formulaire n'est pas garantie.
- Le pointeur d'un clic est ajouté uniquement à une capture précédente compatible : même document, URL, révision DOM, viewport, scroll et DPR. Sinon il est omis avec diagnostic. Une capture pendant laquelle ce contexte change est écartée.
- Le site enregistré doit rester l'onglet actif. Une navigation vers une autre origine met en pause. L'extension utilise `activeTab`, `scripting`, `storage` et `webNavigation`, sans permission d'accès permanente à tous les sites.
- Les cadres intégrés ne sont pas instrumentés ; leurs pixels visibles peuvent apparaître mais leurs actions ne créent pas d'étape. Une animation DOM continue peut faire rejeter une capture comme instable.
- Les images visibles peuvent contenir des données personnelles. Utilisez des données de démonstration ou masquez-les avant capture. L'export retire la query string et le fragment de l'URL source.
- Les navigations SPA sont observées via `webNavigation`. Les changements sans URL peuvent être capturés après un clic ou manuellement.

## API interne

Les messages utilisent le canal `interactive-learning/recorder` : `state`, `start` avec `title`, `pause`, `resume`, `capture`, `stop`. Les observations du content script passent par `observation`. Les commandes de contrôle sont réservées aux pages de l'extension ; les observations sont limitées à l'onglet de la session et au frame principal. La réponse est `{ ok: true, state }` ou `{ ok: false, error }`.

Le fichier exporté respecte `GuideDocument` du package interne `@interactive-learning/protocol`, schéma `1.0.0`.
