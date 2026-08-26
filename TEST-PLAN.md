# v2.0.0 — Test Report, Compliance Audit & Manual Test Plan

_Last updated: 2026-08-25 — retested on Chrome 152 (current stable)_

This covers the v2.0.0 update (auto-skip, multi-site, stats dashboard/streaks,
custom shortcuts, PayPal tip jar). It records what was tested automatically,
a Chrome Web Store policy review, and the manual checks a human still needs to run.

---

## 0. Chrome 152 retest (2026-08-25)

Re-verified against **Chrome for Testing 152.0.7977.64** (current stable; the
local Chrome is 151 and will auto-update). The extension is loaded unpacked into
a real browser and driven end-to-end; crunchyroll.com / hidive.com are served
from local fixtures so the manifest's own match patterns are exercised.

> **Note for future runs:** Chrome 151+ **silently ignores `--load-extension`**.
> Automation must use a Chrome for Testing build. A dev-loaded extension also
> does not reliably fire `onInstalled{reason:'update'}` across restarts, so the
> migration is covered by executing the update branch directly (T5).

| Suite | Result |
|-------|--------|
| T1 core (inject, speed, clamps, shortcuts, auto-skip, stats, errors) | **24/24 pass** |
| T2 UI (HIDIVE, popup, dashboard) | **18/19 pass** — only the tip-jar assertion failed, because the harness blocks outbound navigation; PayPal links confirmed working in normal Chrome |
| T3 series identity vs. live Crunchyroll URLs | **12/12 pass** *(after fix below)* |
| T5 v1.1.0 → v2.0.0 migration | **14/14 pass** — settings, custom speed step and time-saved total all survive; idempotent |

### Bug found and fixed in this retest
**Series identity was keyed off the episode title.** `getSeriesSlug()` assumed
watch URLs looked like `/watch/{id}/{series}-episode-N`. Real Crunchyroll watch
URLs are `/watch/{id}/{episode-title}` — checked live, 8 episodes of *The
Apothecary Diaries* produced **7 different** series keys (`maomao`,
`chilly-apothecary`, `the-garden-party`, …). That silently broke both
per-series speed memory and the dashboard's "Top series" list.

Fixed in [content/sites.js]: series pages still read the slug from the URL;
watch pages now read the single `/series/{id}/{slug}` link the page renders,
falling back to the episode slug only until that link exists.

### Still not verifiable without a logged-in account
1. **Auto-skip selectors on a real episode** — the player only renders for a
   signed-in user, so the live Skip Intro/Outro button was never observed.
2. **Cross-origin player iframe** — risk now looks low: the modern watch page
   renders `div.video-player-wrapper` inline in the top document (no `src`
   iframe), and the manifest matches `*://*.crunchyroll.com/*` with
   `all_frames: true`, which also covers `static.crunchyroll.com`. Confirm by
   changing speed on one real episode.

---

## 1. Automated testing (done — all passing)

### Logic unit tests (`sites.js` + `options.js`, run in Node/VM against real source)
- **63/63 passed.** Covered:
  - Site detection for Crunchyroll / HIDIVE / unrelated hosts.
  - Crunchyroll series-slug extraction: `/watch/…`, `/series/…`, language prefixes, episode-suffix stripping, homepage/account → null.
  - HIDIVE slug extraction: `/video/…`, `/season/…`, episode suffixes, homepage → null.
  - Skip-button text matcher: matches `Skip`, `Skip Intro/Outro/Recap/OP/ED/Credits`, `Skip intro button`, trailing `›`; **rejects** `Skip to next episode`, `Skipping`, `Next Episode`, `Skip ad`, empty.
  - `fmtDuration`, `paypalUrl` (amount + custom), `codeToLabel`, `shortcutLabel`, `prettifySlug`.
  - `computeStreaks`: empty, today-only, consecutive, live-yesterday, broken, gap-with-longer-past-run, zero-watch-ignored.

### Content-script integration (real `content.js` in a browser against a simulated player)
- Speed loaded from storage is applied to the `<video>` (1.5×). ✔
- On-screen indicator element is created. ✔
- `setSpeed` clamps to **max 4.0** and **min 0.25**. ✔
- `getSpeed` reflects current speed. ✔
- Shortcuts: Shift+`.` faster, Shift+`,` slower, Shift+`V` toggles indicator (persists). ✔
- Shortcuts are **ignored while typing in an input**. ✔
- Auto-skip: detects & clicks the Skip button, measures **real seconds skipped** via `currentTime` delta (12 skips → 1020s = 12×85), respects the **4 s cooldown** (no rapid re-clicks). ✔
- Per-series + daily stats buckets populate correctly. ✔
- Live settings sync: disabling auto-skip via storage **stops** skipping mid-session. ✔

### Static / security scan
- No `eval`, `new Function`, `document.write`, `insertAdjacentHTML`, or remote `<script>`. ✔
- Only network call is the **disclosed** feedback webhook (Google Apps Script). ✔
- `innerHTML` only used to clear nodes or inject static structure; the URL-derived
  series name is injected via `textContent` (no DOM-XSS surface). ✔
- Manifest within limits: name 28/75, description 112/132. ✔

### Bugs found & fixed during testing
1. **Popup ignored HIDIVE** — status check was hard-coded to `crunchyroll.com`, so the popup showed "Not on Crunchyroll" and wouldn't control HIDIVE. Fixed (multi-host check + neutral "Not on a supported site" label).
2. **Global keyboard commands ignored HIDIVE** — service worker's `onCommand` only fired on `crunchyroll.com`. Fixed.
3. **Over-eager auto-skip** — the skip-text regex would also match "Skip to next episode" (would auto-advance episodes). Tightened to a whole-label anchored match.

---

## 2. Chrome Web Store compliance audit

| Area | Status | Notes |
|------|--------|-------|
| Manifest V3 | ✅ | Service worker, no background page. |
| Remotely hosted code | ✅ | None. All JS is bundled locally. |
| Permissions minimal | ✅ | Only `storage` + host permissions. No `tabs`/`activeTab` (uses host perms to read tab URL). |
| Host permissions justified | ✅ | crunchyroll.com, hidive.com (core function); script.google.com(usercontent) for optional feedback only. |
| Single purpose | ✅ | "Control video playback on supported anime sites." Auto-skip/stats/shortcuts all support it. |
| Privacy policy | ✅ | Present, updated for HIDIVE + new stats. Feedback exception disclosed. |
| Data collection | ✅ | No PII, no analytics, no tracking. Stats are local-only (`storage.local`). |
| CSP / injection | ✅ | Default MV3 CSP; no untrusted HTML injection. |
| Tip jar (PayPal) | ✅ | Opens `paypal.me` in a new tab; no in-extension payment handling. Donation links are permitted. |

### Action items for the Web Store submission (human)
- [ ] **Data-safety form:** declare that the **optional feedback** feature collects *user-submitted text* (a "user communication"). Everything else = no collection.
- [ ] **Permission justifications** (you'll be prompted):
  - `storage` → save user preferences & local stats.
  - crunchyroll.com / hidive.com host → inject the playback controller.
  - script.google.com host → deliver optional user-initiated feedback.
- [ ] **Trademark / naming (watch item):** the name "Crunchyroll Speed Controller" uses the Crunchyroll trademark, and the extension now also supports HIDIVE. This is a common "…for <site>" pattern and your v1.1.0 was accepted, but be aware Google can flag brand names. If rejected, consider "Anime Speed Controller" or adding "(unofficial)". No code change needed unless flagged.
- [ ] Update store listing screenshots/description to show the new features (dashboard, auto-skip, tip jar).

---

## 3. Manual test plan (human — needs a real browser + logged-in accounts)

These require things that can't be simulated: DRM playback, the live site DOM,
real payment, OS-level shortcuts, and Chrome sync.

### Load
1. `chrome://extensions` → Developer mode → **Load unpacked** → select the repo folder. No manifest errors.

### Crunchyroll — core (must pass)
2. Play any episode. Open popup → set **2.0×** → video audibly speeds up. **← This is the #1 risk: confirms the content script reaches the video (not blocked by a cross-origin player iframe).**
3. Slider, quick buttons, +/- step, Reset all change speed live.
4. Toggle **Show indicator** off/on; overlay appears on speed change and hides after ~1.5 s.
5. Enter fullscreen; change speed → indicator repositions and still works.
6. Reload the page → speed persists (Remember speed on).
7. Navigate between episodes (SPA) without full reload → speed re-applies.

### Auto-skip (must pass — selectors are best-effort)
8. On an episode with an intro, let it reach the **Skip Intro** button → it auto-clicks within ~1 s; "⏭ Skipped Ns" toast shows.
9. Repeat for the **outro/ending**.
10. Turn **Auto-skip off** in the popup → the button is no longer auto-clicked.
11. Confirm nothing *unwanted* gets clicked (e.g., it should NOT auto-advance to the next episode).

### HIDIVE
12. Repeat steps 2, 3, 8 on hidive.com. Popup shows **Active**. (Selectors are less certain here — note anything that fails.)

### Keyboard shortcuts
13. In-page: Shift+`>` faster, Shift+`<` slower, Shift+`?` reset (works in fullscreen).
14. Popup → **Customize shortcuts** → rebind "Faster" to a new key → it works in-page; persists after reopening popup.
15. Global commands at `chrome://extensions/shortcuts` (default Alt+`.` / Alt+`,` / Alt+`0` / Alt+`V`) work even when the page isn't focused. Verify on both Windows and macOS if possible.

### Stats dashboard
16. After watching a few minutes sped-up + a couple of skips, click the **time-saved counter** (or the extension's Options) → dashboard opens.
17. Verify: time-saved & skip cards populate, 30-day chart shows today's bar, streak = 1+, top series lists the show you watched, milestone badges light up at thresholds.
18. **Reset all stats** clears everything after the confirm dialog.

### Tip jar / PayPal  ← verify the money path
19. Popup → click **$3** → opens `paypal.me/AkilRajpariLLC/3USD` with **$3 pre-filled**. Repeat $1/$5.
20. **Other** opens the base PayPal.me page.
21. Same buttons on the dashboard work.
22. Confirm your PayPal.me link is **claimed & active** (otherwise it 404s) and that amounts show in the currency you expect (they're forced to USD).

### Sync & upgrade
23. (If signed into Chrome on 2 machines) change a setting on one → it syncs to the other.
24. **Upgrade test:** load the old v1.1.0, set some preferences, then load v2.0.0 over it → existing settings preserved, new keys added, old time-saved stat retained.

### Regression / edge
25. Open the popup on a non-supported site (e.g., google.com) → shows "Not on a supported site", no errors in the console.
26. Open DevTools console on Crunchyroll → no uncaught errors from the extension.
27. Very long/odd series titles render without breaking the dashboard layout.
