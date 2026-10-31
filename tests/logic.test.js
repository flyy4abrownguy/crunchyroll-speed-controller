const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../shared/logic.js');

const H = 3600;

test('constants', () => {
  assert.equal(L.PAYPAL_USERNAME, 'AkilRajpariLLC');
  assert.deepEqual(L.MILESTONE_HOURS, [5, 25, 100]);
  assert.equal(L.SERIES_SPEED_CAP, 50);
  assert.deepEqual(L.PRESETS, [1, 1.25, 1.5, 1.75, 2]);
});

test('fmtDuration', () => {
  assert.equal(L.fmtDuration(0), '0s');
  assert.equal(L.fmtDuration(45), '45s');
  assert.equal(L.fmtDuration(125), '2m');
  assert.equal(L.fmtDuration(3600), '1h');
  assert.equal(L.fmtDuration(3660), '1h 1m');
  assert.equal(L.fmtDuration(undefined), '0s');
});

test('fmtSpeed', () => {
  assert.equal(L.fmtSpeed(1), '1');
  assert.equal(L.fmtSpeed(1.5), '1.5');
  assert.equal(L.fmtSpeed(1.25), '1.25');
  assert.equal(L.fmtSpeed(0.1), '0.1');
  assert.equal(L.fmtSpeed(2.0), '2');
});

test('dateKey uses local time and zero-pads', () => {
  assert.equal(L.dateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(L.dateKey(new Date(2026, 9, 31, 23, 59)), '2026-10-31');
});

test('prettifySlug', () => {
  assert.equal(L.prettifySlug('frieren-beyond-journeys-end'), 'Frieren Beyond Journeys End');
  assert.equal(L.prettifySlug(null), '');
  assert.equal(L.prettifySlug(''), '');
});

test('weekTotals counts the 7 local days ending today inclusive', () => {
  const daily = {
    '2026-10-24': { savedSec: 999, skips: 9 },
    '2026-10-25': { savedSec: 60, skips: 1 },
    '2026-10-31': { savedSec: 120, skips: 2 }
  };
  assert.deepEqual(L.weekTotals(daily, new Date(2026, 9, 31)), { savedSec: 180, skips: 3 });
  assert.deepEqual(L.weekTotals({}, new Date(2026, 9, 31)), { savedSec: 0, skips: 0 });
});

test('weekTotals does not mutate today', () => {
  const today = new Date(2026, 9, 31);
  L.weekTotals({}, today);
  assert.equal(L.dateKey(today), '2026-10-31');
});

test('computeStreaks', () => {
  const today = new Date(2026, 9, 31);
  assert.deepEqual(
    L.computeStreaks({ '2026-10-29': { watchedSec: 5 }, '2026-10-30': { watchedSec: 5 } }, today),
    { current: 2, longest: 2 }
  );
  assert.deepEqual(L.computeStreaks({}, today), { current: 0, longest: 0 });
  // today counts when active; zero watchedSec is inactive; gap breaks current but not longest
  assert.deepEqual(
    L.computeStreaks({
      '2026-10-31': { watchedSec: 5 },
      '2026-10-30': { watchedSec: 0 },
      '2026-10-20': { watchedSec: 5 },
      '2026-10-21': { watchedSec: 5 },
      '2026-10-22': { watchedSec: 5 }
    }, today),
    { current: 1, longest: 3 }
  );
});

test('topShow', () => {
  assert.equal(L.topShow({ a: { watchedSec: 10 }, b: { watchedSec: 50 }, c: { watchedSec: 0 } }), 'b');
  assert.equal(L.topShow({}), null);
  assert.equal(L.topShow({ a: { watchedSec: 0 } }), null);
});

test('nextMilestone', () => {
  assert.equal(L.nextMilestone(4.9 * H), null);
  assert.equal(L.nextMilestone(5 * H), 5);
  assert.equal(L.nextMilestone(30 * H), 25);
  assert.equal(L.nextMilestone(30 * H, { shown: [25], done: false }), null);
  assert.equal(L.nextMilestone(120 * H, { shown: [5], done: false }), 100);
  assert.equal(L.nextMilestone(120 * H, { shown: [], done: true }), null);
});

test('planSpeedSave', () => {
  const base = { userInitiated: true, rememberSpeed: true, hasVideo: true, slug: 'frieren', slugResolved: true };
  assert.deepEqual(L.planSpeedSave(base), { global: true, series: true });
  assert.deepEqual(L.planSpeedSave({ ...base, slugResolved: false }), { global: true, series: false });
  assert.deepEqual(L.planSpeedSave({ ...base, slug: null }), { global: true, series: false });
  assert.deepEqual(L.planSpeedSave({ ...base, rememberSpeed: false }), { global: false, series: false });
  assert.deepEqual(L.planSpeedSave({ ...base, userInitiated: false }), { global: false, series: false });
  assert.deepEqual(L.planSpeedSave({ ...base, hasVideo: false }), { global: false, series: false });
});

test('withSeriesSpeed: cap, recency, immutability', () => {
  const m = { a: 1, b: 1, c: 1 };
  const out = L.withSeriesSpeed(m, 'd', 2, 3);
  assert.deepEqual(Object.keys(out), ['b', 'c', 'd']);
  assert.deepEqual(m, { a: 1, b: 1, c: 1 });
  assert.deepEqual(Object.keys(L.withSeriesSpeed({ a: 1, b: 1 }, 'a', 2, 3)), ['b', 'a']);
  assert.equal(L.withSeriesSpeed({ a: 1 }, 'a', 2.5).a, 2.5);
});

test('urls', () => {
  assert.equal(L.reviewUrl('abc'), 'https://chromewebstore.google.com/detail/abc/reviews');
  assert.equal(L.paypalUrl(), 'https://www.paypal.me/AkilRajpariLLC');
  assert.equal(L.paypalUrl(3), 'https://www.paypal.me/AkilRajpariLLC/3USD');
  assert.equal(L.isWatchUrl('https://www.crunchyroll.com/watch/G1/ep'), true);
  assert.equal(L.isWatchUrl('https://www.crunchyroll.com/videos/popular'), false);
  assert.equal(L.isWatchUrl('https://www.hidive.com/video/123/show'), true);
  assert.equal(L.isWatchUrl('https://www.hidive.com/watch/123'), false);
  assert.equal(L.isWatchUrl('https://example.com/watch/1'), false);
});

test('isSupportedUrl', () => {
  assert.equal(L.isSupportedUrl('https://www.crunchyroll.com/'), true);
  assert.equal(L.isSupportedUrl('https://www.hidive.com/'), true);
  assert.equal(L.isSupportedUrl('https://example.com/'), false);
  assert.equal(L.isSupportedUrl('not a url'), false);
});

test('popupMode', () => {
  assert.equal(L.popupMode({ supported: false }), 'idle');
  assert.equal(L.popupMode({ supported: true, watchUrl: true, response: { hasVideo: true } }), 'watching');
  assert.equal(L.popupMode({ supported: true, watchUrl: true, error: new Error('no receiver') }), 'idle-reload');
  assert.equal(L.popupMode({ supported: true, watchUrl: true, response: { hasVideo: false } }), 'idle-broken');
  assert.equal(L.popupMode({ supported: true, watchUrl: false, response: { hasVideo: false } }), 'idle');
  assert.equal(L.popupMode({ supported: true, watchUrl: false, error: new Error('x') }), 'idle');
});

test('isFeedbackSuccess', () => {
  assert.equal(L.isFeedbackSuccess(200, '{"ok":true}'), true);
  assert.equal(L.isFeedbackSuccess(200, '{"ok":false}'), false);
  assert.equal(L.isFeedbackSuccess(500, ''), false);
  assert.equal(L.isFeedbackSuccess(500, '{"ok":true}'), false);
  assert.equal(L.isFeedbackSuccess(200, '<!DOCTYPE html><html>The script completed but did not return anything.</html>'), true);
  assert.equal(L.isFeedbackSuccess(200, '<html><body>Sign in - Google Accounts</body></html>'), false);
  assert.equal(L.isFeedbackSuccess(200, 'Success'), true);
  assert.equal(L.isFeedbackSuccess(200, ''), true);
});

test('migrateSyncSettings', () => {
  const defs = { speed: 1, perSeriesSpeed: true, autoSkip: true };
  assert.deepEqual(L.migrateSyncSettings({ speed: 1.5, perSeriesSpeed: false }, defs), { perSeriesSpeed: true, autoSkip: true });
  assert.deepEqual(L.migrateSyncSettings({ speed: 1.5, perSeriesSpeed: true, autoSkip: false }, defs), {});
  assert.deepEqual(L.migrateSyncSettings({}, defs), { speed: 1, perSeriesSpeed: true, autoSkip: true });
});
