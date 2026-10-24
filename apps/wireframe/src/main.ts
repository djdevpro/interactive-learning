import './style.css';

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing wireframe element: ${selector}`);
  return found;
}

const views = [...document.querySelectorAll<HTMLElement>('[data-view]')];
const navigation = [...document.querySelectorAll<HTMLAnchorElement>('[data-nav]')];
const form = element<HTMLFormElement>('#project-form');
const nameInput = element<HTMLInputElement>('#project-name');
const descriptionInput = element<HTMLTextAreaElement>('#project-description');
let createdProject: { name: string; description: string } | undefined;

function navigate(): void {
  const route = location.hash.slice(1) || '/projects';
  let view = 'projects';
  if (route === '/overview') view = 'overview';
  else if (route === '/activity') view = 'activity';
  else if (route === '/projects/new') view = 'new';
  else if (/^\/projects\/(?:demo|a|b)$/.test(route)) view = 'detail';

  for (const section of views) section.hidden = section.dataset.view !== view;
  const activeNavigation = view === 'new' || view === 'detail' ? 'projects' : view;
  for (const link of navigation) {
    if (link.dataset.nav === activeNavigation) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const titles: Record<string, string> = {
    overview: 'Vue d’ensemble',
    projects: 'Projets',
    new: 'Nouveau projet',
    detail: 'Fiche projet',
    activity: 'Activité',
  };
  element('#breadcrumb-current').textContent = titles[view] ?? 'Projets';

  if (view === 'detail') {
    const demo = route.endsWith('/demo');
    element('#detail-title').textContent = demo
      ? (createdProject?.name ?? 'Projet de démonstration')
      : route.endsWith('/a')
        ? 'Projet A'
        : 'Projet B';
    element('#detail-description').textContent =
      (demo ? createdProject?.description : undefined) ||
      'Un espace pour organiser les prochaines étapes.';
    element('#project-success').hidden = !demo;
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.setCustomValidity('Indiquez un nom pour ce projet.');
    nameInput.reportValidity();
    return;
  }
  createdProject = { name, description: descriptionInput.value.trim() };
  element('#created-project-name').textContent = name;
  element('#created-project-row').hidden = false;
  element('#project-count').textContent = '3 projets';
  location.hash = '/projects/demo';
});

window.addEventListener('hashchange', navigate);
navigate();
