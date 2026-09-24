'use strict';

const systems = [
  ['court-file-cabinet', '智能文件柜-法院', '文件借还与智能柜管理'],
  ['paperless-go', 'AI辅助数字化扫描加工', 'AI辅助扫描加工与数字化归档'],
  ['digital-archive', '档案数字化管理系统', '数字化加工与档案管理'],
  ['dense-shelf-platform', '密集架一体化平台管理系统', '需在演示桌面连接密集架隧道'],
  ['integrated-archive', '综合档案管理系统', '档案全生命周期管理'],
  ['cadre-personnel-archive', '干部人事档案管理系统', '干部人事档案集中管理'],
  ['standalone-archive', '综合单机版档案系统', '档案整理与查阅'],
  ['aisou-file-agent', '艾搜文件智能体', '客户端需在演示桌面预先安装']
];

const grid = document.querySelector('#system-grid');
const state = document.querySelector('#desktop-state');
const note = document.querySelector('#desktop-note');
const heroLink = document.querySelector('#desktop-launch');

function card(id, name, description, desktopUrl) {
  const article = document.createElement('article');
  article.className = 'hosted-card';
  article.dataset.systemId = id;
  const heading = document.createElement('h3');
  heading.textContent = name;
  const kind = document.createElement('p');
  kind.className = 'hosted-kind';
  kind.textContent = description;
  const link = document.createElement('a');
  link.className = 'open-button';
  link.textContent = desktopUrl ? '进入演示桌面' : '远程桌面未配置';
  if (desktopUrl) {
    link.href = desktopUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `进入演示桌面：${name}`);
  } else {
    link.href = '#systems';
    link.setAttribute('aria-disabled', 'true');
    link.setAttribute('aria-label', `远程桌面未配置：${name}`);
  }
  article.append(heading, kind, link);
  return article;
}

async function loadConfig() {
  grid.replaceChildren(...systems.map(([id, name, description]) => card(id, name, description, '')));
  grid.setAttribute('aria-busy', 'false');
  try {
    const response = await fetch('./demo-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('演示入口配置尚未发布。');
    const config = await response.json();
    if (typeof config.desktopUrl !== 'string' || !config.desktopUrl) {
      state.textContent = '远程桌面未配置';
      state.dataset.state = 'error';
      note.textContent = '网站已发布，但 Windows 演示主机尚未接入。请联系演示管理员。';
      return;
    }
    let desktopUrl;
    try { desktopUrl = new URL(config.desktopUrl); } catch { throw new Error('远程桌面地址无效，请联系演示管理员。'); }
    if (desktopUrl.protocol !== 'https:' || desktopUrl.username || desktopUrl.password) throw new Error('远程桌面地址无效，请联系演示管理员。');
    grid.replaceChildren(...systems.map(([id, name, description]) => card(id, name, description, desktopUrl.href)));
    state.textContent = '受控远程桌面已配置';
    state.dataset.state = 'ready';
    note.textContent = '所有入口使用同一 Windows 演示桌面。进入后请在桌面里的导航台点击相同系统。共享桌面请轮流操作。';
    heroLink.href = desktopUrl.href;
    heroLink.target = '_blank';
    heroLink.rel = 'noopener noreferrer';
    heroLink.hidden = false;
  } catch (error) {
    state.textContent = error instanceof TypeError ? '远程桌面地址无效' : '远程桌面未配置';
    state.dataset.state = 'error';
    note.textContent = error.message || '请联系演示管理员配置受控远程桌面入口。';
  }
}

loadConfig();
