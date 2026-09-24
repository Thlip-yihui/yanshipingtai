'use strict';

const { chromium: playwrightChromium } = require('playwright');
const { launchExternalBrowser: defaultLaunchExternalBrowser } = require('./openExternalBrowser');
const { launchInstaller: defaultLaunchInstaller } = require('./openInstaller');
const { launchDemoProgram: defaultLaunchDemoProgram } = require('./openDemoProgram');

const MANUAL_VERIFICATION = '需要人工处理验证码/二次验证';
const ACCOUNT_HINTS = /账号|用户名|用户|手机号|user|account|login/i;
const CHALLENGE_HINTS = /captcha|otp|sms|vcode|checkcode|authcode|randomcode|verification|verify.?code|security.?code|one.time.code|验证码|校验码|动态码|动态口令|短信/i;
const LOGIN_BUTTON_TEXT = /登\s*录|提交|确定|sign\s*in|log\s*in/i;

function isPrivateAddress(url) {
  const hostname = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname === '::1' || /^f[cd][0-9a-f]*:/i.test(hostname)) return true;
  const parts = hostname.split('.').map(Number);
  return parts.length === 4 && parts.every(Number.isInteger) && (
    parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 169 && parts[1] === 254)
  );
}

function createAutomation(options = {}) {
  const chromium = options.chromium || playwrightChromium;
  const launchExternalBrowser = options.launchExternalBrowser || defaultLaunchExternalBrowser;
  const launchInstaller = options.launchInstaller || defaultLaunchInstaller;
  const launchDemoProgram = options.launchDemoProgram || defaultLaunchDemoProgram;
  // An injected browser launcher owns its configuration (for isolated tests).
  const browserChannel = !options.chromium && ['chrome', 'msedge'].includes(process.env.PLAYWRIGHT_CHANNEL)
    ? process.env.PLAYWRIGHT_CHANNEL : undefined;
  const navigationTimeoutMs = options.navigationTimeoutMs ?? 60000;
  const networkIdleTimeoutMs = options.networkIdleTimeoutMs ?? 60000;
  const spaWaitMs = options.spaWaitMs ?? 3500;
  const inputReadyTimeoutMs = Math.max(1, Math.min(options.inputReadyTimeoutMs ?? 10000, 10000));
  let browserPromise;

  // One Chromium process, but a fresh context for every opening (including repeated openings).
  async function getBrowser() {
    if (!browserPromise) {
      const pending = chromium.launch({ headless: false, ...(browserChannel ? { channel: browserChannel } : {}) });
      browserPromise = pending;
      try {
        const browser = await pending;
        browser.on('disconnected', () => {
          if (browserPromise === pending) browserPromise = undefined;
        });
      } catch (error) {
        if (browserPromise === pending) browserPromise = undefined;
        throw error;
      }
    }
    return browserPromise;
  }

  async function closeBrowser() {
    const pending = browserPromise;
    browserPromise = undefined;
    if (pending) {
      try { await (await pending).close(); } catch { /* Already closed by the user. */ }
    }
  }

  function report(system, message) {
    // Deliberately log neither configuration objects, credentials nor raw Playwright errors.
    console.info(`[automation:${system.id || 'unknown'}] ${message}`);
  }

  function result(system, success, message) {
    report(system, message);
    return { success, message };
  }

  function framesInOrder(page, preferredFrame) {
    const frames = page.frames().filter(frame => !frame.isDetached());
    return preferredFrame && frames.includes(preferredFrame)
      ? [preferredFrame, ...frames.filter(frame => frame !== preferredFrame)]
      : frames;
  }

  async function isSameElement(locator, frame, other) {
    if (!other || frame !== other.frame) return false;
    const handle = await locator.elementHandle();
    if (!handle) return false;
    try {
      return await other.locator.evaluate((element, candidateElement) => element === candidateElement, handle);
    } finally {
      await handle.dispose();
    }
  }

  async function candidate(scope, selector, frame, kind = 'control', excluded) {
    const matches = scope.locator(selector);
    const count = Math.min(await matches.count(), 50);
    for (let index = 0; index < count; index += 1) {
      const locator = matches.nth(index);
      if (!await locator.isVisible()) continue;
      // Password presence and password editability are different questions. Login forms often
      // disable their fields while the request is pending; that must never look like success.
      if (kind !== 'password' && !await locator.isEnabled()) continue;
      if (await isSameElement(locator, frame, excluded)) continue;
      if (kind === 'username' || kind === 'password') {
        if (kind === 'username' && !await locator.isEditable()) continue;
        if (kind === 'password' && !await locator.evaluate(element =>
          /^(INPUT|TEXTAREA)$/.test(element.tagName) || element.isContentEditable)) continue;
        if (kind === 'username') {
          const suitable = await locator.evaluate(el => {
            const type = (el.getAttribute('type') || 'text').toLowerCase();
            const hint = ['placeholder', 'name', 'id', 'autocomplete', 'aria-label']
              .map(attribute => el.getAttribute(attribute) || '').join(' ');
            return { type, hint };
          });
          if (/^(password|hidden|checkbox|radio|submit|button|file)$/.test(suitable.type)) continue;
          if (CHALLENGE_HINTS.test(suitable.hint)) continue;
        }
      }
      return { locator, frame, selector: locator.toString() };
    }
    return null;
  }

  async function configuredCandidate(page, selector, kind, system, preferredFrame, excluded) {
    if (!selector || typeof selector !== 'string') return null;
    for (const frame of framesInOrder(page, preferredFrame)) {
      try {
        const found = await candidate(frame, selector, frame, kind, excluded);
        if (found) return found;
      } catch (error) {
        if (frame.isDetached()) continue;
        // An invalid custom selector should not prevent automatic detection.
        report(system, `配置的 ${kind} 选择器无法匹配，继续自动探测。`);
        break;
      }
    }
    return null;
  }

  async function findPassword(page, selectors, system) {
    const configured = await configuredCandidate(page, selectors.password, 'password', system);
    if (configured) return configured;
    for (const frame of framesInOrder(page)) {
      try {
        const found = await candidate(frame, 'input[type="password"]', frame, 'password');
        if (found) return found;
      } catch (error) {
        if (!frame.isDetached()) throw error;
      }
    }
    return null;
  }

  async function waitForEditable(page, locator) {
    const deadline = Date.now() + inputReadyTimeoutMs;
    do {
      try {
        if (await locator.isVisible() && await locator.isEditable({ timeout: Math.min(200, Math.max(1, deadline - Date.now())) })) {
          return true;
        }
      } catch (error) {
        if (!/Timeout|Execution context was destroyed|Cannot find context|Frame was detached/i.test(String(error.message))) throw error;
      }
      if (Date.now() < deadline) await page.waitForTimeout(Math.min(200, deadline - Date.now()));
    } while (Date.now() < deadline);
    return false;
  }

  async function findUsername(page, password, selectors, system) {
    const configured = await configuredCandidate(page, selectors.username, 'username', system, password.frame, password);
    if (configured) return configured;

    // Prefer the password field's form, so a header search box is not filled accidentally.
    const form = password.locator.locator('xpath=ancestor::form[1]');
    const scopes = [];
    if (await form.count()) scopes.push({ scope: form, frame: password.frame });
    scopes.push(...framesInOrder(page, password.frame).map(frame => ({ scope: frame, frame })));

    for (const { scope, frame } of scopes) {
      for (const selector of ['input[type="text"]', 'input[type="email"]', 'input:not([type])']) {
        try {
          const found = await candidate(scope, selector, frame, 'username', password);
          if (found) return found;
        } catch (error) {
          if (!frame.isDetached()) throw error;
        }
      }
      const inputs = scope.locator('input');
      const count = Math.min(await inputs.count(), 50);
      for (let index = 0; index < count; index += 1) {
        const locator = inputs.nth(index);
        if (!await locator.isVisible() || !await locator.isEnabled() || !await locator.isEditable()) continue;
        if (await isSameElement(locator, frame, password)) continue;
        const attributes = await locator.evaluate(el => ({
          type: (el.getAttribute('type') || 'text').toLowerCase(),
          hint: ['placeholder', 'name', 'id'].map(name => el.getAttribute(name) || '').join(' '),
        }));
        if (!/^(password|hidden|checkbox|radio|submit|button|file)$/.test(attributes.type) &&
          ACCOUNT_HINTS.test(attributes.hint) && !CHALLENGE_HINTS.test(attributes.hint)) {
          return { locator, frame, selector: `${locator.toString()}（placeholder/name/id 命中账号特征）` };
        }
      }
    }
    return null;
  }

  async function hasVisible(locator) {
    const count = Math.min(await locator.count(), 50);
    for (let index = 0; index < count; index += 1) {
      if (await locator.nth(index).isVisible()) return true;
    }
    return false;
  }

  async function hasChallenge(page, selectors) {
    for (const frame of framesInOrder(page)) {
      try {
        if (selectors.captcha && await hasVisible(frame.locator(selectors.captcha))) return true;
        const inputs = frame.locator('input:not([type="hidden"])');
        const count = Math.min(await inputs.count(), 60);
        for (let index = 0; index < count; index += 1) {
          const input = inputs.nth(index);
          if (!await input.isVisible()) continue;
          const attributes = await input.evaluate(el => ({
            type: (el.getAttribute('type') || 'text').toLowerCase(),
            hint: ['placeholder', 'name', 'id', 'autocomplete', 'aria-label']
              .map(attribute => el.getAttribute(attribute) || '').join(' '),
            label: el.labels ? Array.from(el.labels).map(label => label.textContent).join(' ') : '',
          }));
          if (!/^(button|submit|checkbox|radio)$/.test(attributes.type) &&
            CHALLENGE_HINTS.test(`${attributes.hint} ${attributes.label}`)) return true;
        }
        const challengeElements = [
          'img[src*="captcha" i]', 'img[src*="verifycode" i]', 'img[alt*="验证码"]',
          '[id*="captcha" i]', '[class*="captcha" i]', '[id*="geetest" i]',
          '[class*="geetest" i]', '[class*="yidun" i]', '[id="nc_1_wrapper"]',
          '[aria-label*="滑块验证"]', '[aria-label*="验证码"]',
        ].join(',');
        if (await hasVisible(frame.locator(challengeElements))) return true;
        // Do not match a normal "短信登录"/"忘记密码" link: only active challenge instructions.
        const instruction = /请完成.{0,8}(安全|身份|人机)验证|请(输入|填写).{0,10}(验证码|动态码|动态口令)|拖动.{0,8}(滑块|拼图)|按住.{0,8}滑块|滑块验证|向右滑动.{0,10}(验证|拼图)|滑动.{0,8}验证|请使用.{0,10}身份验证器|输入.{0,8}(OTP|一次性密码)|enter.{0,20}(verification|authentication|one.time).{0,8}(code|password)|complete.{0,15}(captcha|security check)/i;
        if (await hasVisible(frame.getByText(instruction))) return true;
      } catch (error) {
        if (!frame.isDetached() && !/Execution context was destroyed|Cannot find context/i.test(error.message)) throw error;
      }
    }
    return false;
  }

  async function findSubmit(page, password, selectors, system) {
    const configured = await configuredCandidate(page, selectors.submit, 'submit', system, password.frame);
    if (configured) return configured;
    // A form-local submit input is safer than an unrelated "确定" button in the page header.
    const scopes = [];
    const form = password.locator.locator('xpath=ancestor::form[1]');
    if (await form.count()) scopes.push({ scope: form, frame: password.frame });
    scopes.push(...framesInOrder(page, password.frame).map(frame => ({ scope: frame, frame })));
    for (const { scope, frame } of scopes) {
      const buttons = scope.locator('button').filter({ hasText: LOGIN_BUTTON_TEXT });
      const count = Math.min(await buttons.count(), 30);
      for (let index = 0; index < count; index += 1) {
        const locator = buttons.nth(index);
        if (await locator.isVisible() && await locator.isEnabled()) {
          return { locator, frame, selector: locator.toString() };
        }
      }
      const found = await candidate(scope, 'input[type="submit"]', frame);
      if (found) return found;
    }
    return null;
  }

  async function pageHasContent(page) {
    for (const frame of framesInOrder(page)) {
      try {
        const content = await frame.locator('body').evaluate(body => {
          const text = (body.innerText || '').trim();
          const visual = Array.from(body.querySelectorAll('img, canvas, video, svg, input, button, a'))
            .some(element => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
          return { text, visual };
        });
        if (/^(loading\.*|加载中[.。…]*|正在加载[.。…]*|请稍候[.。…]*)$/i.test(content.text)) continue;
        if (content.text || content.visual) return true;
      } catch (error) {
        if (!frame.isDetached() && !/Execution context was destroyed|Cannot find context|Failed to find element/i.test(error.message)) throw error;
      }
    }
    return false;
  }

  async function loginFailure(page) {
    const failures = [
      [/账号.{0,5}锁定|账户.{0,5}锁定|用户.{0,5}锁定|account.{0,8}locked/i, '账号已锁定，请人工处理。'],
      [/密码.{0,5}过期|password.{0,8}expired/i, '密码已过期，请人工处理。'],
      [/账号或密码.{0,5}(错误|不正确)|用户名或密码.{0,5}(错误|不正确)|密码错误|密码不正确|用户名不存在|用户不存在|账号不存在|登录失败|认证失败|invalid.{0,15}(credentials|password)|incorrect.{0,15}(password|username)/i, '自动登录失败：账号或密码校验未通过，请在浏览器中检查。'],
    ];
    for (const frame of framesInOrder(page)) {
      for (const [pattern, message] of failures) {
        if (await hasVisible(frame.getByText(pattern))) return message;
      }
    }
    return null;
  }

  async function configuredSuccess(page, selectors) {
    if (selectors.successUrl && page.url().includes(selectors.successUrl)) return true;
    if (!selectors.success) return false;
    for (const frame of framesInOrder(page)) {
      try {
        if (await hasVisible(frame.locator(selectors.success))) return true;
      } catch (error) {
        if (!frame.isDetached()) return false;
      }
    }
    return false;
  }

  function navigationError(error, url, documentResponded = false) {
    const description = String(error?.message || '');
    const timeout = error?.name === 'TimeoutError' || /Timeout|timed out/i.test(description);
    if (!documentResponded && isPrivateAddress(url) && (timeout || /net::|ECONN|ENOTFOUND|ERR_/i.test(description))) {
      return '内网地址不可达，请确认本机与目标系统处于同一网络，且目标服务已启动。';
    }
    if (timeout) return '页面加载超时，请检查目标系统是否可访问后重试；浏览器窗口已保留。';
    if (/Target page, context or browser has been closed|has been closed|crashed/i.test(description)) {
      return '浏览器窗口已关闭或页面异常退出，请重新打开系统。';
    }
    if (/net::|ECONN|ENOTFOUND|ERR_/i.test(description)) {
      return '网络错误，无法访问目标系统，请检查网址、网络连接和目标服务。';
    }
    return '自动登录过程中发生异常，请在已打开的浏览器中手动操作，并检查登录选择器配置。';
  }

  async function openSystem(system) {
    if (system?.externalDemo) {
      const launchResult = await launchDemoProgram(system.externalDemo);
      if (!launchResult.success) return result(system, false, launchResult.message);
      report(system, launchResult.message);
    }
    if (system?.externalBrowser) {
      const launchResult = await launchExternalBrowser(system.externalBrowser);
      return result(system, launchResult.success, launchResult.message);
    }
    if (system?.externalInstaller) {
      const launchResult = await launchInstaller(system.externalInstaller);
      return result(system, launchResult.success, launchResult.message);
    }
    if (!system?.url || !String(system.url).trim()) return result(system || {}, false, '网址未配置。');
    // Default to five seconds; a known slow system may explicitly allow a longer login response.
    const postSubmitWaitMs = options.postSubmitWaitMs ?? (
      Number.isInteger(system.loginTimeoutMs) && system.loginTimeoutMs >= 1000 && system.loginTimeoutMs <= 60000
        ? system.loginTimeoutMs : 5000
    );
    let target;
    try {
      target = new URL(system.url);
      if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported protocol');
    } catch {
      return result(system, false, '网址配置无效，请使用完整的 http:// 或 https:// 地址。');
    }
    if (system.enabled === false) return result(system, false, '该系统暂未启用，按钮已预留。');
    const selectors = system.loginSelectors && typeof system.loginSelectors === 'object'
      ? system.loginSelectors : {};
    let browser;
    try {
      browser = await getBrowser();
    } catch (error) {
      const missing = /Executable doesn't exist|executable doesn't exist|playwright install/i.test(String(error.message));
      if (browserChannel) {
        return result(system, false, '无法启动 PLAYWRIGHT_CHANNEL 指定的浏览器，请确认已安装对应的 Chrome 或 Microsoft Edge，或清除该环境变量后安装 Playwright Chromium。');
      }
      return result(system, false, missing
        ? '未安装 Playwright Chromium，请先运行 npx playwright install chromium。'
        : '无法启动浏览器，请确认 Playwright Chromium 已安装，且当前环境支持图形界面。');
    }

    // A responding intranet service that then hangs is a page timeout, not an unreachable host.
    let documentResponded = false;
    // There is intentionally no finally/close here. Every result preserves the user's browser.
    try {
      const context = await browser.newContext({ viewport: null, locale: 'zh-CN' });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('response', response => {
        if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
          documentResponded = true;
        }
      });
      const deadline = Date.now() + navigationTimeoutMs;
      const remaining = () => Math.max(1, deadline - Date.now());
      const response = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: remaining() });
      if (response && response.status() >= 400) {
        return result(system, false, `网络错误，目标系统返回 HTTP ${response.status()}，请检查目标服务。`);
      }
      let networkIdleTimedOut = false;
      try {
        await page.waitForLoadState('networkidle', { timeout: Math.min(networkIdleTimeoutMs, remaining()) });
      } catch (error) {
        if (error.name !== 'TimeoutError') throw error;
        networkIdleTimedOut = true;
        report(system, 'networkidle 等待超时，继续检查已加载页面（部分系统存在持续网络请求）。');
      }
      if (target.hash || new URL(page.url()).hash) {
        await page.waitForTimeout(Math.min(spaWaitMs, remaining()));
      }
      if (page.url().startsWith('chrome-error:')) return result(system, false, navigationError(new Error('net::ERR_FAILED'), target.href, documentResponded));
      if (await hasChallenge(page, selectors)) return result(system, false, MANUAL_VERIFICATION);
      if (!await pageHasContent(page)) {
        return result(system, false, '页面加载超时或内容为空，请在已打开的浏览器中检查目标系统。');
      }

      const password = await findPassword(page, selectors, system);
      if (!password) {
        if (await configuredSuccess(page, selectors)) return result(system, true, '系统已打开，当前页面已登录。');
        if (selectors.password) {
          return result(system, false, '未找到密码输入框，请检查 loginSelectors.password；浏览器窗口已保留。');
        }
        if (networkIdleTimedOut) {
          return result(system, false, '页面加载超时：网络请求尚未完成且未找到密码输入框，无法确认页面是否就绪；浏览器窗口已保留。');
        }
        return result(system, true, '系统已打开：未检测到密码输入框，可能无需登录或已登录。');
      }
      report(system, `密码输入框选择器：${password.selector}（frame ${page.frames().indexOf(password.frame)}）`);
      if (!await waitForEditable(page, password.locator)) {
        if (await hasChallenge(page, selectors)) return result(system, false, MANUAL_VERIFICATION);
        return result(system, false, '密码输入框暂不可编辑（已禁用、只读或尚未就绪），请在已打开的浏览器中检查。');
      }
      if (await hasChallenge(page, selectors)) return result(system, false, MANUAL_VERIFICATION);
      const username = await findUsername(page, password, selectors, system);
      if (!username) return result(system, false, '未找到账号输入框，请配置 loginSelectors.username 或在浏览器中手动登录。');
      report(system, `账号输入框选择器：${username.selector}（frame ${page.frames().indexOf(username.frame)}）`);
      if (!String(system.username ?? '').trim() || !String(system.password ?? '')) {
        return result(system, false, '账号或密码未配置，请检查本地系统配置。');
      }

      try {
        await username.locator.fill(String(system.username), { timeout: inputReadyTimeoutMs });
        await username.locator.dispatchEvent('input');
        await username.locator.dispatchEvent('change');
        await password.locator.fill(String(system.password), { timeout: inputReadyTimeoutMs });
        await password.locator.dispatchEvent('input');
        await password.locator.dispatchEvent('change');
      } catch (error) {
        if (error.name !== 'TimeoutError') throw error;
        if (await hasChallenge(page, selectors)) return result(system, false, MANUAL_VERIFICATION);
        return result(system, false, '账号或密码输入框暂不可编辑，请等待页面就绪或在已打开的浏览器中手动登录。');
      }
      if (await hasChallenge(page, selectors)) return result(system, false, MANUAL_VERIFICATION);

      const submit = await findSubmit(page, password, selectors, system);
      const beforeUrl = page.url();
      if (submit) {
        report(system, `登录按钮选择器：${submit.selector}（frame ${page.frames().indexOf(submit.frame)}）`);
        await submit.locator.click();
      } else {
        report(system, `未找到登录按钮，使用密码输入框回车提交：${password.selector}`);
        await password.locator.press('Enter');
      }

      const submitDeadline = Date.now() + postSubmitWaitMs;
      let passwordGoneSince;
      do {
        if (page.isClosed()) return result(system, false, '浏览器窗口已关闭，请重新打开系统。');
        try {
          if (page.url().startsWith('chrome-error:')) return result(system, false, navigationError(new Error('net::ERR_FAILED'), target.href, documentResponded));
          if (await configuredSuccess(page, selectors)) return result(system, true, '系统已打开，自动登录成功。');
          if (await hasChallenge(page, selectors)) return result(system, false, MANUAL_VERIFICATION);
          const failure = await loginFailure(page);
          if (failure) return result(system, false, failure);
          const currentPassword = await findPassword(page, selectors, system);
          if (!currentPassword && await pageHasContent(page)) {
            passwordGoneSince ??= Date.now();
            // A brief disappearance during a route transition is not itself proof of success.
            if (Date.now() - passwordGoneSince >= Math.min(500, postSubmitWaitMs / 2)) {
              report(system, page.url() !== beforeUrl ? '登录后 URL 已变化，密码输入框已消失。' : '登录后密码输入框已消失。');
              return result(system, true, '系统已打开，自动登录成功。');
            }
          } else {
            passwordGoneSince = undefined;
          }
        } catch (error) {
          if (!/Execution context was destroyed|Cannot find context|Frame was detached/i.test(String(error.message))) throw error;
        }
        if (Date.now() < submitDeadline) await page.waitForTimeout(Math.min(200, submitDeadline - Date.now()));
      } while (Date.now() < submitDeadline);

      return result(system, false, submit
        ? '已提交登录，但未确认登录成功；浏览器窗口已保留，请检查账号密码、验证码或配置登录成功选择器。'
        : '未找到登录按钮，已尝试回车提交但未确认登录成功；请配置 loginSelectors.submit 或在浏览器中手动登录。');
    } catch (error) {
      return result(system, false, navigationError(error, target.href, documentResponded));
    }
  }

  return { openSystem, closeBrowser };
}

const defaultAutomation = createAutomation();
module.exports = { ...defaultAutomation, createAutomation };
