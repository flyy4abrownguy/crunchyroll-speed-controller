// End-to-end smoke suite: loads the unpacked extension into Chrome for Testing
// and drives the popup, options page, content script and service worker together.
//
//   cd tests/e2e && npm install && npm test
//
// Chrome for Testing is used because branded Chrome ignores --load-extension.
// Set CFT_PATH to its executable, or install one into tests/e2e/.browsers with
//   npx @puppeteer/browsers install chrome@stable --path .browsers
// (an existing ~/.cache/puppeteer install is also picked up).

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PAGES, URLS, webStorePage } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PROFILE = path.join(HERE, '.profile', `run-${process.pid}`);

const ROUTED_HOSTS = ['www.crunchyroll.com', 'www.hidive.com', 'example.com', 'chromewebstore.google.com'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Browser discovery ----
function versionKey(p) {
  const m = p.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1).map(Number) : [0, 0, 0, 0];
}

function findChrome() {
  if (process.env.CFT_PATH) return process.env.CFT_PATH;
  const app = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  const patterns = [
    path.join(HERE, '.browsers/chrome/*/chrome-mac*', app),
    path.join(os.homedir(), '.cache/puppeteer/chrome/*/chrome-mac*', app)
  ];
  for (const pattern of patterns) {
    const hits = fs.globSync(pattern).sort((a, b) => {
      const va = versionKey(a);
      const vb = versionKey(b);
      for (let i = 0; i < 4; i++) if (va[i] !== vb[i]) return vb[i] - va[i];
      return 0;
    });
    if (hits.length) return hits[0];
  }
  throw new Error(
    'Chrome for Testing not found. Set CFT_PATH or run: ' +
    'npx @puppeteer/browsers install chrome@stable --path .browsers'
  );
}

// ---- Polling ----
// Retries an async assertion until it passes or the timeout runs out.
async function eventually(fn, { timeout = 5000, interval = 100 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (Date.now() >= end) throw e;
    }
    await sleep(interval);
  }
}

// ---- Shared state ----
let context;
let sw;
let extId;
let executablePath;
let closing = false;

async function swEval(fn, arg) {
  return sw.evaluate(fn, arg);
}

const sync = (keys = null) => swEval((k) => chrome.storage.sync.get(k), keys);
const local = (keys = null) => swEval((k) => chrome.storage.local.get(k), keys);
const setSync = (obj) => swEval((o) => chrome.storage.sync.set(o), obj);
const setLocal = (obj) => swEval((o) => chrome.storage.local.set(o), obj);

// Matches by URL, so only works on hosts the extension has permission for
// (no "tabs" permission). See newTabFor() for anything else.
async function tabIdFor(urlPattern) {
  return eventually(async () => {
    const ids = await swEval(async (url) => (await chrome.tabs.query({ url })).map((t) => t.id), urlPattern);
    assert.equal(ids.length, 1, `expected one tab matching ${urlPattern}, got ${ids.length}`);
    return ids[0];
  });
}

// Opens url in a new page and finds its tab id by diffing the tab list, for
// hosts where chrome.tabs.query({url}) can't see the URL (e.g. example.com).
async function newTabFor(url) {
  const listIds = () => swEval(async () => (await chrome.tabs.query({})).map((t) => t.id));
  const beforeIds = new Set(await listIds());
  const page = await context.newPage();
  await page.goto(url);
  const tabId = await eventually(async () => {
    const fresh = (await listIds()).filter((id) => !beforeIds.has(id));
    assert.equal(fresh.length, 1, `expected one new tab, got ${fresh.length}`);
    return fresh[0];
  });
  return { page, tabId };
}

// Waits until the tab's content script answers getSpeed (and, when
// wantVideo is set, until the answer comes from a frame that has the video).
async function contentReady(tabId, { wantVideo = true, timeout = 8000 } = {}) {
  return eventually(async () => {
    const res = await swEval(async (id) => {
      try {
        return await chrome.tabs.sendMessage(id, { action: 'getSpeed' });
      } catch (e) {
        return null;
      }
    }, tabId);
    assert.ok(res, 'content script not answering yet');
    if (wantVideo) assert.equal(res.hasVideo, true, 'video frame not ready yet');
    return res;
  }, { timeout, interval: 50 });
}

async function openSite(url, { wantVideo = true } = {}) {
  const page = await context.newPage();
  await page.goto(url);
  const tabId = await tabIdFor(url);
  await contentReady(tabId, { wantVideo });
  return { page, tabId };
}

async function openPopup(tabId) {
  const page = await context.newPage();
  const query = tabId == null ? '' : `?tabId=${tabId}`;
  await page.goto(`chrome-extension://${extId}/popup/popup.html${query}`);
  return page;
}

// URL a page was sent to. The Web Store host is unresolvable here (see
// --host-resolver-rules), so the tab commits an error page whose page.url()
// is chrome-error://; the navigation entry keeps the requested URL.
async function navigatedUrl(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const cdp = await context.newCDPSession(page);
  try {
    return await eventually(async () => {
      const { currentIndex, entries } = await cdp.send('Page.getNavigationHistory');
      const url = entries[currentIndex].url;
      assert.ok(url && url !== 'about:blank', 'navigation not started yet');
      return url;
    });
  } finally {
    await cdp.detach();
  }
}

const playbackRate = (frame) => frame.evaluate(() => document.querySelector('video').playbackRate);

async function expectRate(frame, rate, timeout = 3000) {
  await eventually(async () => assert.equal(await playbackRate(frame), rate), { timeout });
}

async function textOf(page, selector) {
  return (await page.locator(selector).textContent()).trim();
}

async function expectVisible(page, selector, timeout = 5000) {
  await page.locator(selector).waitFor({ state: 'visible', timeout });
}

// ---- Suite ----
describe('Speed Controller v2.1 smoke', () => {
  before(async () => {
    executablePath = findChrome();
    fs.rmSync(PROFILE, { recursive: true, force: true });
    fs.mkdirSync(PROFILE, { recursive: true });

    context = await chromium.launchPersistentContext(PROFILE, {
      executablePath,
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${ROOT}`,
        `--load-extension=${ROOT}`,
        // Belt and braces: anything on these hosts that escapes routing fails
        // to resolve instead of reaching the real site. Tabs the extension
        // opens itself (chrome.tabs.create) start navigating before Playwright
        // can intercept them, so the Web Store review tab relies on this.
        `--host-resolver-rules=${ROUTED_HOSTS.map((h) => `MAP ${h} ~NOTFOUND`).join(', ')}`
      ]
    });
    context.on('close', () => {
      if (!closing) console.log('# browser context closed unexpectedly');
    });

    // Route only the fixture origins; a catch-all route would also intercept
    // chrome-extension:// requests and blank the extension pages.
    const serve = async (route) => {
      const url = route.request().url().split('#')[0];
      const body = PAGES[url];
      if (body) await route.fulfill({ status: 200, contentType: 'text/html', body });
      else await route.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' });
    };
    await context.route('https://www.crunchyroll.com/**', serve);
    await context.route('https://www.hidive.com/**', serve);
    await context.route('https://example.com/**', serve);
    await context.route('https://chromewebstore.google.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: webStorePage })
    );

    sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => {
        throw new Error(`Extension service worker never started. Is ${executablePath} Chrome for Testing? Branded Chrome ignores --load-extension.`);
      });
    }
    extId = new URL(sw.url()).host;
  });

  after(async () => {
    closing = true;
    if (context) await context.close();
    fs.rmSync(PROFILE, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await swEval(async () => {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
    });
  });

  afterEach(async () => {
    // Keep one blank tab so the browser window stays open; close the rest.
    const pages = context.pages();
    for (const p of pages.slice(1)) await p.close();
    if (pages[0] && pages[0].url() !== 'about:blank') await pages[0].goto('about:blank');
  });

  test('1. watching state', async () => {
    const { tabId } = await openSite(URLS.crWatch);
    const popup = await openPopup(tabId);
    await expectVisible(popup, '#watching');
    assert.equal(await textOf(popup, '#showName'), 'Frieren Beyond Journeys End');
    assert.equal(await textOf(popup, '#siteLabel'), 'Crunchyroll');
  });

  test('2. preset sets speed and saves per show', async () => {
    const { page, tabId } = await openSite(URLS.crWatch);
    let popup = await openPopup(tabId);
    await expectVisible(popup, '#watching');
    await popup.click('#watching .preset[data-speed="1.5"]');

    await expectRate(page, 1.5);
    await eventually(async () => {
      const s = await sync(['speed', 'seriesSpeeds']);
      assert.equal(s.speed, 1.5);
      assert.deepEqual(s.seriesSpeeds, { 'frieren-beyond-journeys-end': 1.5 });
    });
    const { seriesSpeeds } = await sync('seriesSpeeds');
    assert.ok(!('the-journeys-end' in seriesSpeeds), 'episode slug must not be saved');

    await popup.close();
    popup = await openPopup(tabId);
    await expectVisible(popup, '#watching');
    await eventually(async () => assert.match(await textOf(popup, '#speedValue'), /^1\.5/));
  });

  test('3. use for all shows', async () => {
    const { page, tabId } = await openSite(URLS.crWatch);
    const popup = await openPopup(tabId);
    await expectVisible(popup, '#watching');
    await popup.click('#watching .preset[data-speed="1.5"]');
    await expectRate(page, 1.5);
    await eventually(async () =>
      assert.deepEqual((await sync('seriesSpeeds')).seriesSpeeds, { 'frieren-beyond-journeys-end': 1.5 })
    );

    await popup.click('#useForAllBtn');
    await eventually(async () => assert.deepEqual((await sync('seriesSpeeds')).seriesSpeeds, {}));
    await eventually(async () =>
      assert.ok((await textOf(popup, '#seriesLine')).includes('1.5x is now your speed for every show'))
    );
  });

  test('4. remember off saves nothing', async () => {
    const seeded = {
      rememberSpeed: false,
      speed: 1.25,
      seriesSpeeds: { 'frieren-beyond-journeys-end': 1.75 }
    };
    await setSync(seeded);
    const { page, tabId } = await openSite(URLS.crWatch);
    const popup = await openPopup(tabId);
    await expectVisible(popup, '#watching');
    await popup.click('#watching .preset[data-speed="2"]');

    await expectRate(page, 2);
    await sleep(500); // give any (wrong) storage write time to land
    const s = await sync(['speed', 'seriesSpeeds']);
    assert.equal(s.speed, seeded.speed);
    assert.deepEqual(s.seriesSpeeds, seeded.seriesSpeeds);
  });

  test('5. iframe video', async () => {
    const { page, tabId } = await openSite(URLS.crIframe);
    const popup = await openPopup(tabId);
    await expectVisible(popup, '#watching');
    await popup.click('#watching .preset[data-speed="1.25"]');

    const player = page.frames().find((f) => f.url() === URLS.crIframePlayer);
    assert.ok(player, 'player iframe not found');
    await expectRate(player, 1.25);
  });

  test('6. late series link', async () => {
    // A saved per-show speed that differs from both the global speed and the
    // user's pick: a late per-show apply overriding the user would show 1.25.
    await setSync({ speed: 1, seriesSpeeds: { 'frieren-beyond-journeys-end': 1.25 } });
    const page = await context.newPage();
    await page.goto(URLS.crWatchLateLink);
    const loadedAt = Date.now();
    const tabId = await tabIdFor(URLS.crWatchLateLink);
    await contentReady(tabId);
    const popup = await openPopup(tabId);
    await expectVisible(popup, '#watching');
    await popup.click('#watching .preset[data-speed="1.75"]');
    const clickMs = Date.now() - loadedAt;

    // The point of the test: the click lands before the series link exists.
    assert.equal(await page.locator('a[href*="/series/"]').count(), 0, `link already rendered at click (+${clickMs} ms)`);
    console.log(`# late-link: preset clicked ${clickMs} ms after load`);

    await sleep(4000);
    // Normally the link rendered and the content script resolved the slug long
    // ago; these waits only absorb machine stalls, they don't shorten the 4 s.
    await page.locator('a[href*="/series/"]').waitFor({ state: 'attached', timeout: 3000 });
    await eventually(async () => assert.equal((await contentReady(tabId)).slugResolved, true), { timeout: 3000 });

    assert.equal(await playbackRate(page), 1.75);
    const { seriesSpeeds = {} } = await sync('seriesSpeeds');
    assert.ok(!('the-journeys-end' in seriesSpeeds), `episode slug saved: ${JSON.stringify(seriesSpeeds)}`);
    await eventually(async () =>
      assert.equal((await sync('seriesSpeeds')).seriesSpeeds?.['frieren-beyond-journeys-end'], 1.75,
        'pending per-show save not written once the slug resolved')
    );
  });

  test('7. catalog is idle', async () => {
    const { tabId } = await openSite(URLS.crCatalog, { wantVideo: false });
    const popup = await openPopup(tabId);
    await expectVisible(popup, '#idle');
    await sleep(3000); // let the probe retries finish
    assert.equal(await popup.locator('#idle').isVisible(), true);
    assert.equal(await popup.locator('#notWorkingLink').isHidden(), true);
  });

  test('8. broken watch page', async () => {
    const { tabId } = await openSite(URLS.crWatchNoVideo, { wantVideo: false });
    const popup = await openPopup(tabId);
    const openedAt = Date.now();
    // No blank popup while probing: idle shows right away, link still hidden.
    await expectVisible(popup, '#idle', 1000);
    assert.equal(await popup.locator('#notWorkingLink').isHidden(), true, 'link shown before probing finished');
    console.log(`# broken-watch: idle shown ${Date.now() - openedAt} ms after popup load`);
    await expectVisible(popup, '#notWorkingLink', 4000);
    console.log(`# broken-watch: link shown ${Date.now() - openedAt} ms after popup load`);
    assert.equal(await popup.locator('#idle').isVisible(), true);
  });

  test('9. non-supported tab', async () => {
    const { tabId } = await newTabFor(URLS.example);
    const popup = await openPopup(tabId);
    await expectVisible(popup, '#idle');
    assert.ok((await textOf(popup, '#idleHint')).includes('Open an episode'));
  });

  test('10. HIDIVE', async () => {
    const { tabId } = await openSite(URLS.hidiveWatch);
    const popup = await openPopup(tabId);
    await expectVisible(popup, '#watching');
    assert.equal(await textOf(popup, '#siteLabel'), 'HIDIVE');
  });

  test('11. milestone flow', async () => {
    const { tabId } = await newTabFor(URLS.example);

    await setLocal({ stats: { totalTimeSavedSec: 30 * 3600 } });
    let popup = await openPopup(tabId);
    const openedAt = Date.now();
    await expectVisible(popup, '#milestoneCard');
    assert.equal(await textOf(popup, '#milestoneTitle'), "You've saved 25 hours");
    await popup.close();
    assert.ok(Date.now() - openedAt < 1000, 'popup was not closed within 1 s');

    // Closed before the 2 s "seen" window: still unseen.
    popup = await openPopup(tabId);
    await expectVisible(popup, '#milestoneCard');
    await sleep(2500);
    await popup.close();

    // Seen for > 2 s: gone.
    popup = await openPopup(tabId);
    await expectVisible(popup, '#idle');
    assert.equal(await popup.locator('#milestoneCard').isHidden(), true);
    await popup.close();

    await setLocal({ stats: { totalTimeSavedSec: 120 * 3600 } });
    popup = await openPopup(tabId);
    await expectVisible(popup, '#milestoneCard');
    assert.match(await textOf(popup, '#milestoneTitle'), /100 hours/);

    const [review] = await Promise.all([
      context.waitForEvent('page'),
      popup.click('#rateBtn')
    ]);
    const reviewUrl = await navigatedUrl(review);
    assert.ok(
      reviewUrl.startsWith(`https://chromewebstore.google.com/detail/${extId}/reviews`),
      `unexpected review url: ${reviewUrl}`
    );
    await eventually(async () => assert.equal((await local('milestonePrompt')).milestonePrompt?.done, true));
  });

  test('12. options anchors and settings', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/options/options.html#settings`);
    await page.waitForLoadState('load');
    assert.equal(await page.locator('#settings').count(), 1);
    assert.equal(await page.locator('#feedback').count(), 1);
    assert.equal(await page.locator('#tipLink').count(), 1);
    const hasEmoji = await page.evaluate(() => /\p{Extended_Pictographic}/u.test(document.body.innerText));
    assert.equal(hasEmoji, false, 'options page contains an emoji');

    const toggle = page.locator('label.toggle-row:has(#autoSkip) .switch');
    await eventually(async () => assert.equal(await page.locator('#autoSkip').isChecked(), true));
    const initial = (await sync('autoSkip')).autoSkip;
    assert.notEqual(initial, false, 'autoSkip should default to on');

    await toggle.click();
    await eventually(async () => assert.equal((await sync('autoSkip')).autoSkip, false));
    await toggle.click();
    await eventually(async () => assert.equal((await sync('autoSkip')).autoSkip, true));
  });

  test('13. manifest guard', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    assert.equal(manifest.version, '2.1.0');
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.deepEqual(manifest.host_permissions, [
      '*://*.crunchyroll.com/*',
      '*://*.hidive.com/*',
      'https://script.google.com/*',
      'https://script.googleusercontent.com/*'
    ]);
  });

  test('14. unsaved show after in-page navigation uses global speed', async () => {
    await setSync({ speed: 1.5, seriesSpeeds: { 'frieren-beyond-journeys-end': 2 } });
    const { page } = await openSite(URLS.crWatch);
    await expectRate(page, 2);

    await page.evaluate(() => {
      document.querySelector('a[href*="/series/"]').setAttribute('href', '/series/G2/another-show');
      history.pushState({}, '', '/watch/DEF/other-episode');
    });
    await expectRate(page, 1.5, 3000);

    await sleep(1000); // let any (wrong) write land
    const { seriesSpeeds } = await sync('seriesSpeeds');
    assert.ok(!('another-show' in seriesSpeeds), `unsaved show was written: ${JSON.stringify(seriesSpeeds)}`);
    assert.deepEqual(seriesSpeeds, { 'frieren-beyond-journeys-end': 2 });
  });

  test('15. stale series link after in-page navigation', async () => {
    const seeded = { 'frieren-beyond-journeys-end': 2, 'another-show': 1.25 };
    await setSync({ speed: 1.5, seriesSpeeds: seeded });
    const { page, tabId } = await openSite(URLS.crWatch);
    await expectRate(page, 2);

    // Like Back/Forward on the real site: the URL changes first and the old
    // page's series link stays in the DOM until the SPA re-renders.
    await page.evaluate(() => {
      history.pushState({}, '', '/watch/DEF/other-episode');
      setTimeout(() => {
        const fresh = document.createElement('a');
        fresh.href = '/series/G2/another-show';
        fresh.textContent = 'Another Show';
        document.querySelector('a[href*="/series/"]').replaceWith(fresh);
      }, 600);
    });
    // A popup opened right away reads the series info while the stale link
    // is still there; that read must not settle the show.
    const early = await contentReady(tabId);
    assert.equal(early.slugResolved, false, `stale link accepted: ${JSON.stringify(early)}`);

    await expectRate(page, 1.25, 4000);
    const popup = await openPopup(tabId);
    await expectVisible(popup, '#watching');
    assert.equal(await textOf(popup, '#showName'), 'Another Show');

    const { seriesSpeeds } = await sync('seriesSpeeds');
    assert.deepEqual(seriesSpeeds, seeded, `per-show speeds changed: ${JSON.stringify(seriesSpeeds)}`);
  });

  test('16. HIDIVE numeric-only URL', async () => {
    const { tabId } = await openSite(URLS.hidiveNumeric);
    const popup = await openPopup(tabId);
    await expectVisible(popup, '#watching');
    assert.equal(await textOf(popup, '#showName'), 'HIDIVE');
    assert.equal(await popup.locator('#seriesLine').isHidden(), true);
  });
});
