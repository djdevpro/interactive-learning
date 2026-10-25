import type { GuideColorScheme } from './theme';

/** Every text the player shows or announces. Functions receive the values they format. */
export interface PlayerMessages {
  guideLoading: string;
  guideMissing: string;
  retry: string;
  guideLoadFailed: (status: number | undefined) => string;
  guideUrlUnsupported: string;
  guideNotJson: string;
  guideInvalid: (path: string) => string;
  guideUnreadable: string;
  play: string;
  pause: string;
  replay: string;
  previousStep: string;
  nextStep: string;
  timeline: string;
  timelineValue: (elapsed: string, total: string, step: number) => string;
  theme: (current: GuideColorScheme) => string;
  address: (visible: boolean) => string;
  noAddress: string;
  openAddress: (address: string) => string;
  enterFullscreen: string;
  exitFullscreen: string;
  fullscreenDenied: string;
  fullscreenExitFailed: string;
  playbackRate: (rate: string) => string;
  changePlaybackRate: string;
  stepCount: (count: number) => string;
  imageAlt: (stepTitle: string) => string;
  imageLoading: string;
  imageUnavailable: string;
  retryImage: string;
  marker: (number: number, title: string) => string;
  closeMarker: string;
  closeMarkerHint: string;
  showMarkers: string;
  completed: string;
  emptyTitle: string;
  emptyBody: string;
  unavailableTitle: string;
  unplayable: string;
  keyboardHelp: string;
}

export type PlayerLocale = 'en' | 'fr';

/** Built-in translations. Spread one of them to start a new language. */
export const playerMessages: Record<PlayerLocale, PlayerMessages> = {
  en: {
    guideLoading: 'Loading guide…',
    guideMissing: 'Choose a guide to play.',
    retry: 'Retry',
    guideLoadFailed: (status) =>
      status ? `The guide could not be loaded (HTTP ${status}).` : 'The guide could not be loaded.',
    guideUrlUnsupported: 'The guide must be served over HTTP or HTTPS.',
    guideNotJson: 'The guide is not a valid JSON file.',
    guideInvalid: (path) => `This guide is invalid at ${path}.`,
    guideUnreadable: 'This guide cannot be read.',
    play: 'Play guide',
    pause: 'Pause',
    replay: 'Replay guide',
    previousStep: 'Previous step',
    nextStep: 'Next step',
    timeline: 'Position in the guide',
    timelineValue: (elapsed, total, step) => `${elapsed} of ${total}, step ${step}`,
    theme: (current) =>
      current === 'dark'
        ? 'Dark theme. Switch to light theme'
        : 'Light theme. Switch to dark theme',
    address: (visible) => (visible ? 'Hide the page address' : 'Show the page address'),
    noAddress: 'No page address for this step',
    openAddress: (address) => `Open ${address} in a new tab`,
    enterFullscreen: 'Enter full screen',
    exitFullscreen: 'Exit full screen',
    fullscreenDenied: 'The browser did not allow full screen. You can keep watching here.',
    fullscreenExitFailed: 'Leaving full screen failed. Press Esc.',
    playbackRate: (rate) => `Playback speed ${rate} times. Change speed`,
    changePlaybackRate: 'Change speed',
    stepCount: (count) => (count === 1 ? '1 step' : `${count} steps`),
    imageAlt: (stepTitle) => `Screenshot of ${stepTitle}`,
    imageLoading: 'Loading screenshot…',
    imageUnavailable: 'This screenshot is not available.',
    retryImage: 'Retry screenshot',
    marker: (number, title) => `Marker ${number}, ${title}`,
    closeMarker: 'Close marker',
    closeMarkerHint: 'Press Esc to close',
    showMarkers: 'Show markers',
    completed: 'Done',
    emptyTitle: 'This guide is taking shape',
    emptyBody: 'Add a first screenshot to walk through it step by step.',
    unavailableTitle: 'Playback unavailable',
    unplayable: 'This guide cannot be played.',
    keyboardHelp:
      'In the player, Space plays or pauses and the left and right arrows go to the previous or next step. Select a marker to read it, which pauses playback. With the keyboard, Enter or Space opens the focused marker. Esc closes an open marker, otherwise it leaves full screen.',
  },
  fr: {
    guideLoading: 'Chargement du guide…',
    guideMissing: 'Choisissez un guide à lire.',
    retry: 'Réessayer',
    guideLoadFailed: (status) =>
      status
        ? `Chargement du guide impossible (erreur HTTP ${status}).`
        : 'Chargement du guide impossible.',
    guideUrlUnsupported: 'Le guide doit être servi en HTTP ou HTTPS.',
    guideNotJson: "Le guide reçu n'est pas un fichier JSON valide.",
    guideInvalid: (path) => `Ce guide n'est pas valide, voir ${path}.`,
    guideUnreadable: 'Ce guide ne peut pas être lu.',
    play: 'Lire le guide',
    pause: 'Mettre en pause',
    replay: 'Revoir le guide',
    previousStep: 'Étape précédente',
    nextStep: 'Étape suivante',
    timeline: 'Position dans le guide',
    timelineValue: (elapsed, total, step) => `${elapsed} sur ${total}, étape ${step}`,
    theme: (current) =>
      current === 'dark'
        ? 'Thème sombre. Passer au thème clair'
        : 'Thème clair. Passer au thème sombre',
    address: (visible) =>
      visible ? "Masquer l'adresse de la page" : "Afficher l'adresse de la page",
    noAddress: "Pas d'adresse de page pour cette étape",
    openAddress: (address) => `Ouvrir ${address} dans un nouvel onglet`,
    enterFullscreen: 'Agrandir le lecteur',
    exitFullscreen: 'Quitter le plein écran',
    fullscreenDenied:
      "Le navigateur n'a pas autorisé le plein écran. Vous pouvez continuer la lecture ici.",
    fullscreenExitFailed: 'La sortie du plein écran a échoué. Utilisez la touche Échap.',
    playbackRate: (rate) => `Vitesse de lecture ${rate} fois. Changer la vitesse`,
    changePlaybackRate: 'Changer la vitesse',
    stepCount: (count) => `${count} ${count > 1 ? 'étapes' : 'étape'}`,
    imageAlt: (stepTitle) => `Capture de l'étape ${stepTitle}`,
    imageLoading: 'Chargement de la capture…',
    imageUnavailable: "Cette capture n'est pas disponible.",
    retryImage: 'Réessayer la capture',
    marker: (number, title) => `Repère ${number}, ${title}`,
    closeMarker: 'Fermer le repère',
    closeMarkerHint: 'Échap pour fermer',
    showMarkers: 'Voir les repères',
    completed: 'Terminé',
    emptyTitle: 'Le guide prend forme',
    emptyBody: 'Ajoutez une première capture pour découvrir votre parcours, étape par étape.',
    unavailableTitle: 'Lecture indisponible',
    unplayable: 'Ce guide ne peut pas être lu.',
    keyboardHelp:
      "Sur le lecteur, Espace lance ou met en pause la lecture et les flèches gauche et droite passent à l'étape précédente ou suivante. Cliquez sur un repère pour le lire, la lecture se met alors en pause. Au clavier, Entrée ou Espace ouvre le repère sélectionné. Échap ferme un repère ouvert, sinon il quitte le plein écran.",
  },
};

/** Built-in locale for a BCP 47 tag such as `fr-CA`; English when the language is not provided. */
export function matchPlayerLocale(locale: string | undefined): PlayerLocale {
  const language = locale?.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return language in playerMessages ? (language as PlayerLocale) : 'en';
}

/** Built-in texts for `locale`, with each defined override replacing its default. */
export function resolvePlayerMessages(
  locale: string | undefined,
  overrides: Partial<PlayerMessages> = {},
): PlayerMessages {
  const defined = Object.entries(overrides).filter(([, value]) => value !== undefined);
  return { ...playerMessages[matchPlayerLocale(locale)], ...Object.fromEntries(defined) };
}
