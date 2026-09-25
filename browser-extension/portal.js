'use strict';

if (location.origin === 'https://thlip-yihui.github.io' && location.pathname.startsWith('/yanshipingtai/')) {
document.addEventListener('click', event => {
  const card = event.target.closest('[data-system-id="dense-shelf-platform"]');
  if (!card) return;
  const action = event.target.closest('button, a.open-button');
  if (!action) return;
  if (action.tagName === 'A') {
    try {
      if (new URL(action.href).href !== new URL(ArchiveDemoSystems.find(item => item.id === 'dense-shelf-platform').url).href) return;
    } catch {
      return;
    }
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  const system = ArchiveDemoSystems.find(item => item.id === 'dense-shelf-platform');
  if (system) window.open(system.url, '_blank', 'noopener,noreferrer');
}, true);
}
