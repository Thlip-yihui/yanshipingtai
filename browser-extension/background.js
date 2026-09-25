'use strict';

importScripts('systems.js');

chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const system = ArchiveDemoSystems.find(item => item.id === message?.systemId);
  if (!system || typeof sender.url !== 'string') return false;

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
