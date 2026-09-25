'use strict';

importScripts('systems.js');

chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

function isPortalUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://thlip-yihui.github.io' && url.pathname.startsWith('/yanshipingtai/');
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof sender.url !== 'string') return false;

  if (message?.type === 'get-credential-status' || message?.type === 'open-options') {
    if (!isPortalUrl(sender.url)) return false;
    if (message.type === 'open-options') {
      chrome.runtime.openOptionsPage().then(() => sendResponse({ success: true })).catch(() => sendResponse({ success: false }));
      return true;
    }
    chrome.storage.local.get('credentials', ({ credentials = {} }) => {
      const configuredSystemIds = ArchiveDemoSystems
        .filter(system => typeof credentials[system.id]?.password === 'string' && credentials[system.id].password.length > 0)
        .map(system => system.id);
      sendResponse({ configuredSystemIds, total: ArchiveDemoSystems.length });
    });
    return true;
  }

  const system = ArchiveDemoSystems.find(item => item.id === message?.systemId);
  if (!system) return false;

  let senderUrl;
  try { senderUrl = new URL(sender.url); } catch { return false; }

  if (message.type === 'get-login-data') {
    if (senderUrl.origin !== new URL(system.url).origin) return false;
    chrome.storage.local.get('credentials', ({ credentials = {} }) => {
      const saved = credentials[system.id] || {};
      sendResponse({
        username: typeof saved.username === 'string' ? saved.username : system.username,
        password: typeof saved.password === 'string' ? saved.password : '',
        selectors: saved.selectors && typeof saved.selectors === 'object' ? saved.selectors : system.selectors
      });
    });
    return true;
  }

  return false;
});
