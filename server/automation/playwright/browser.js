/**
 * Shared Playwright browser/login plumbing — ported verbatim from
 * alis-hub's server/automation/playwright/browser.js, which this is
 * confirmed-live and already proven against admin.alisonline.com's real
 * login form. Kept as its own module rather than shared/imported, matching
 * this codebase's established "port the piece, don't couple the repos"
 * convention (see docs/CONTEXT.md).
 */
const { chromium } = require('playwright');

let _browser = null;

/** Returns a shared, lazy-launched browser instance. Call closeBrowser() on server shutdown. */
async function getBrowser() {
  if (!_browser) {
    const headed = process.env.PLAYWRIGHT_HEADED === 'true';
    _browser = await chromium.launch({
      headless: !headed,
      slowMo: headed ? 80 : 50,
    });
    console.log(`🎭  Playwright browser launched (headless: ${!headed})`);
  }
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

/** Fresh page in a fresh context — no cookie reuse across calls, so every call re-authenticates (see ensureLoggedIn). */
async function newPage() {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return context.newPage();
}

/**
 * Ensures the page is logged in to ALIS admin. Idempotent — safe to call
 * before every job; no-ops if the page didn't redirect to a login route.
 */
async function ensureLoggedIn(page, targetUrl = null) {
  const username = process.env.ALIS_USERNAME;
  const password = process.env.ALIS_PASSWORD;

  if (!username || !password) {
    throw new Error('ALIS_USERNAME / ALIS_PASSWORD not set in server/.env');
  }

  const navUrl = targetUrl || 'https://admin.alisonline.com/';
  await page.goto(navUrl, { waitUntil: 'networkidle' });

  const url = page.url();
  if (!url.includes('/Login') && !url.includes('/Account/Login') && !url.includes('/Account/SignIn')) {
    return; // already logged in
  }

  const usernameField = page.locator(
    'input[name="Username"], input[name="UserName"], #Username, #UserName, input[name="Email"], #Email, input[type="text"]'
  ).first();
  const passwordField = page.locator(
    'input[name="Password"], input[type="password"], #Password'
  ).first();

  const usernameVisible = await usernameField.isVisible().catch(() => false);
  const passwordVisible = await passwordField.isVisible().catch(() => false);
  if (!usernameVisible || !passwordVisible) {
    throw new Error('Could not find login fields on ALIS admin\'s login page — its markup may have changed.');
  }

  await usernameField.fill(username);
  await page.waitForTimeout(200);
  await passwordField.fill(password);
  await page.waitForTimeout(200);

  const loginButton = page.locator(
    'button:has-text("Login"), input[type="submit"], button[type="submit"]'
  ).first();
  await loginButton.click();

  await page.waitForFunction(
    () => !window.location.href.includes('/Login') &&
          !window.location.href.includes('/Account/Login') &&
          !window.location.href.includes('/Account/SignIn'),
    { timeout: 15_000 }
  );
}

module.exports = { getBrowser, closeBrowser, newPage, ensureLoggedIn };
