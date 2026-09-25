'use strict';

globalThis.ArchiveDemoLogin = (() => {
  const ACCOUNT_HINTS = /账号|用户名|用户|手机号|手机|user|account|login/i;
  const LOGIN_TEXT = /登\s*录|提交|确定|sign\s*in|log\s*in/i;
  const CAPTCHA_HINT = /验证码|captcha|滑块验证|请拖动滑块|动态口令|短信验证|二次验证|one.time.code|otp/i;
  const FAILURE_HINT = /账号或密码错误|密码错误|登录失败|帐号错误|invalid credentials|login failed/i;

  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  function showStatus(doc, message, state = 'info') {
    let badge = doc.getElementById('archive-demo-login-status');
    if (!badge) {
      badge = doc.createElement('div');
      badge.id = 'archive-demo-login-status';
      badge.setAttribute('role', 'status');
      badge.setAttribute('aria-live', 'polite');
      badge.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:min(420px,calc(100vw - 32px));padding:10px 14px;background:#172b4d;color:#fff;border-left:4px solid #1677ff;border-radius:4px;font:14px/1.5 system-ui,sans-serif;box-shadow:0 3px 14px #0003;';
      doc.documentElement.append(badge);
    }
    badge.textContent = message;
    badge.dataset.state = state;
    badge.style.borderLeftColor = state === 'error' ? '#d14343' : state === 'success' ? '#21936b' : '#1677ff';
    return badge;
  }

  function usable(element) {
    if (!element || element.disabled || element.type === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function matching(root, selector) {
    if (!selector) return null;
    try {
      return [...root.querySelectorAll(selector)].find(usable) || null;
    } catch {
      return null;
    }
  }

  function findPassword(doc, selector) {
    return matching(doc, selector) || [...doc.querySelectorAll('input[type="password"]')].find(usable) || null;
  }

  function findUsername(doc, selector, form) {
    const scope = form || doc;
    const custom = matching(scope, selector) || (scope !== doc ? matching(doc, selector) : null);
    if (custom) return custom;
    const candidates = [...scope.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"])')].filter(usable);
    const byType = type => candidates.find(input => input.type === type);
    return byType('text') || byType('email') || candidates.find(input => !input.hasAttribute('type')) ||
      candidates.find(input => ACCOUNT_HINTS.test([
        input.placeholder, input.name, input.id, input.getAttribute('autocomplete'), input.getAttribute('aria-label')
      ].join(' '))) || null;
  }

  function hasVerification(doc) {
    const fields = [...doc.querySelectorAll('input, iframe, [role="slider"]')].filter(usable);
    const challengeField = fields.some(field => CAPTCHA_HINT.test([
      field.placeholder, field.name, field.id, field.title, field.getAttribute('autocomplete'), field.getAttribute('aria-label')
    ].join(' ')));
    if (challengeField) return true;
    const bodyText = (doc.body?.innerText || '').slice(0, 12000);
    return /滑块验证|请拖动滑块|人机验证|验证码/.test(bodyText) && /登录|登陆|验证/.test(bodyText);
  }

  function findSubmit(doc, selector, form) {
    const scope = form || doc;
    const custom = matching(scope, selector) || (scope !== doc ? matching(doc, selector) : null);
    if (custom) return custom;
    const buttons = [...scope.querySelectorAll('button')].filter(usable);
    return buttons.find(button => LOGIN_TEXT.test(button.innerText || button.value || '')) ||
      [...scope.querySelectorAll('input[type="submit"]')].find(usable) || null;
  }

  function setValue(element, value, view) {
    const prototype = element instanceof view.HTMLTextAreaElement
      ? view.HTMLTextAreaElement.prototype
      : view.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new view.Event('input', { bubbles: true }));
    element.dispatchEvent(new view.Event('change', { bubbles: true }));
  }

  async function waitForPassword(doc, selector, timeoutMs = 12000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const input = findPassword(doc, selector);
      if (input) return input;
      await pause(250);
    }
    return null;
  }

  async function run({ system, credentials, document: doc, window: win, waitMs = 12000, postSubmitWaitMs = 5000 }) {
    const selectors = credentials.selectors || system.selectors || {};
    const password = await waitForPassword(doc, selectors.password, waitMs);
    if (!password) return { status: 'no-login-form' };

    if (hasVerification(doc)) {
      showStatus(doc, '检测到验证码或二次验证，请人工处理。', 'error');
      return { status: 'manual-verification' };
    }

    if (!credentials.username || !credentials.password) {
      showStatus(doc, '请先在扩展设置中保存此系统的账号和密码。', 'error');
      return { status: 'credentials-missing' };
    }

    const attemptKey = `archive-demo-login-attempt:${system.id}:${win.location.pathname}${win.location.search}`;
    try {
      if (win.sessionStorage.getItem(attemptKey)) {
        showStatus(doc, '此标签页已尝试过登录；为避免重复提交，请检查结果或在新标签页重试。', 'error');
        return { status: 'already-attempted' };
      }
      win.sessionStorage.setItem(attemptKey, '1');
    } catch {
      showStatus(doc, '浏览器阻止了本次登录状态保护，未提交账号。', 'error');
      return { status: 'session-storage-unavailable' };
    }

    const form = password.form || password.closest('form');
    const username = findUsername(doc, selectors.username, form);
    if (!username) {
      showStatus(doc, '未找到账号输入框，请在扩展设置中配置账号选择器。', 'error');
      return { status: 'username-not-found' };
    }

    showStatus(doc, '正在填写演示账号并提交登录。');
    setValue(username, credentials.username, win);
    setValue(password, credentials.password, win);
    const previousUrl = win.location.href;
    const submit = findSubmit(doc, selectors.submit, form);
    if (submit) {
      submit.click();
    } else if (form?.requestSubmit) {
      form.requestSubmit();
    } else {
      password.focus();
      password.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }

    const deadline = Date.now() + postSubmitWaitMs;
    while (Date.now() < deadline) {
      await pause(250);
      if (hasVerification(doc)) {
        showStatus(doc, '需要人工处理验证码或二次验证。', 'error');
        return { status: 'manual-verification' };
      }
      if (FAILURE_HINT.test((doc.body?.innerText || '').slice(0, 12000))) {
        showStatus(doc, '目标系统提示账号或密码无效，请检查配置。', 'error');
        return { status: 'login-rejected' };
      }
      if (selectors.successUrl && win.location.href.includes(selectors.successUrl)) {
        showStatus(doc, '系统登录成功。', 'success');
        return { status: 'success' };
      }
      if (win.location.href !== previousUrl || !password.isConnected || !usable(password)) {
        showStatus(doc, '系统已接受登录，正在进入首页。', 'success');
        return { status: 'success' };
      }
    }

    showStatus(doc, '已提交登录；尚未确认结果，请检查当前页面。', 'error');
    return { status: 'unconfirmed' };
  }

  return { run, showStatus, findPassword, findUsername, findSubmit, hasVerification, usable };
})();
