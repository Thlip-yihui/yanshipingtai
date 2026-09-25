'use strict';

const root = document.querySelector('#systems');
const form = document.querySelector('#settings-form');
const status = document.querySelector('#save-status');

function field(system, key, label, type = 'text', value = '') {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  const caption = document.createElement('span');
  caption.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.autocomplete = type === 'password' ? 'new-password' : 'off';
  input.value = value;
  input.dataset.systemId = system.id;
  input.dataset.field = key;
  wrapper.append(caption, input);
  return wrapper;
}

function render(saved = {}) {
  root.replaceChildren(...ArchiveDemoSystems.map(system => {
    const section = document.createElement('section');
    section.className = 'system-row';
    const heading = document.createElement('div');
    heading.className = 'system-heading';
    const name = document.createElement('h2');
    name.textContent = system.name;
    const url = document.createElement('code');
    url.textContent = system.url;
    heading.append(name, url);

    const values = saved[system.id] || {};
    const fields = document.createElement('div');
    fields.className = 'credential-fields';
    fields.append(
      field(system, 'username', '账号', 'text', values.username ?? system.username),
      field(system, 'password', '密码', 'password', values.password || '')
    );

    const advanced = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = '登录框选择器（可选）';
    const selectors = values.selectors || system.selectors || {};
    const selectorFields = document.createElement('div');
    selectorFields.className = 'credential-fields selector-fields';
    selectorFields.append(
      field(system, 'selector-username', '账号输入框', 'text', selectors.username || ''),
      field(system, 'selector-password', '密码输入框', 'text', selectors.password || ''),
      field(system, 'selector-submit', '登录按钮', 'text', selectors.submit || '')
    );
    advanced.append(summary, selectorFields);
    section.append(heading, fields, advanced);
    return section;
  }));
  root.setAttribute('aria-busy', 'false');
}

async function load() {
  const { credentials = {} } = await chrome.storage.local.get('credentials');
  render(credentials);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const credentials = {};
  for (const system of ArchiveDemoSystems) {
    credentials[system.id] = {
      username: system.username,
      password: '',
      selectors: { ...system.selectors }
    };
  }
  for (const input of form.querySelectorAll('[data-system-id][data-field]')) {
    const { systemId, field: key } = input.dataset;
    const record = credentials[systemId];
    if (!record) continue;
    if (key.startsWith('selector-')) {
      const selectorName = key.slice('selector-'.length);
      if (input.value.trim()) record.selectors[selectorName] = input.value.trim();
      else delete record.selectors[selectorName];
    } else if (key === 'password') {
      record.password = input.value;
    } else {
      record.username = input.value.trim();
    }
  }
  await chrome.storage.local.set({ credentials });
  status.textContent = '已保存在此浏览器中。';
});

load().catch(() => {
  status.textContent = '读取扩展本地设置失败，请重新打开设置页。';
});
