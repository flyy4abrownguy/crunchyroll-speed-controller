# v2.0.0 — Chrome Web Store submission pack

Package: `crunchyroll-speed-controller-v2.0.0.zip` (29 KB, 20 files, rebuilt
2026-08-25 with the series-identity fix). Dashboard:
<https://chrome.google.com/webstore/devconsole>

---

## 1. "What's new" (release notes)

```
v2.0.0

• Auto-skip intros, outros and recaps — no more reaching for the Skip button
• HIDIVE support, alongside Crunchyroll
• New stats dashboard: time saved, watch streaks, top series, milestones
• Customisable keyboard shortcuts
• Choose your speed step (0.05×, 0.10× or 0.25×)
• Optional per-series speed memory
• If it saves you time, there's now a tip jar — entirely optional
```

## 2. Permission justifications (the dashboard prompts for each)

| Item | Justification |
|---|---|
| `storage` | Saves the user's playback preferences (speed, shortcuts, toggles) and their local watch statistics. Nothing is sent anywhere. |
| `*://*.crunchyroll.com/*` | Core function: injects the playback-speed controller and auto-skip logic into the video player on Crunchyroll. |
| `*://*.hidive.com/*` | Same core function on HIDIVE, the second supported streaming site. |
| `https://script.google.com/*`, `https://script.googleusercontent.com/*` | Delivers the optional, user-initiated "Send Feedback" message. Only fires when the user types feedback and presses Submit. |

**Single purpose:** "Control video playback on supported anime streaming sites."
Auto-skip, shortcuts and statistics all serve that one purpose.

## 3. Data safety declarations

- **Personally identifiable information** — not collected.
- **Health / financial / authentication / location / web history** — not collected.
- **Personal communications** — **YES.** The optional feedback form transmits the
  free-text message the user chooses to submit. Nothing else is attached to it.
- **User activity** — not collected. Watch statistics stay in `storage.local` on
  the user's own machine and are never transmitted.

Certify all three: not sold to third parties; not used or transferred for any
purpose unrelated to the single purpose; not used to determine creditworthiness.

Privacy policy: already published in the repo (`privacy-policy.md`) and updated
for HIDIVE + the new statistics.

## 4. Listing assets — regenerated for v2.0.0

All rebuilt from the real shipping UI (not mock-ups), in `store-assets/`.
Upload the five 1280×800 screenshots in this order:

| # | File | Shows |
|---|---|---|
| 1 | `screenshot-1280x800.png` | Hero — popup + the five v2 features |
| 2 | `screenshot-dashboard-1280x800.png` | Stats dashboard: cards, streak, 30-day chart |
| 3 | `screenshot-series-1280x800.png` | Top series + milestone badges |
| 4 | `screenshot-autoskip-1280x800.png` | Auto-skip toast + speed indicator |
| 5 | `screenshot-shortcuts-1280x800.png` | Shortcut editor |

Also updated: `marquee-promo-1400x560.png` (now mentions auto-skip + HIDIVE) and
`promo-tile-440x280.png` (icon-led; the old tile was illegible at that size).

`screenshot-feedback-1280x800.png` is the **stale v1.1.0** image — don't upload
it. The store allows five screenshots and the five above are the current set.

**Description:** full replacement copy is in `store-assets/description-v2.0.0.txt`
— paste it over the existing text wholesale.

### Second bug found while building these
The dashboard's "Top series" bars never painted: `.series-bar-fill` is a `<span>`
with no `display`, so as an inline element its `width`/`height` were ignored.
Fixed in `options/options.css`; the bars render correctly now.

## 5. Known review risk

The name uses the **Crunchyroll trademark**, and the extension now also supports
HIDIVE. The "…for <site>" pattern is common and v1.1.0 was accepted, but Google
can flag brand names — more easily now that the listing spans two brands. If it
is rejected on that basis, the fix is a rename ("Anime Speed Controller", or
adding "(unofficial)"); no code change is required.

---

## Pre-submit check (~2 minutes, needs a signed-in account)

Two code paths have never been observed on a live episode, because the player
does not render for anonymous visitors. Both are core to the update:

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
2. Play any episode, set **2×** in the popup → audio/video should speed up.
   *(Confirms the content script reaches the `<video>`.)*
3. Let the intro run → the **Skip Intro** button should auto-click within ~1s.
   *(Confirms the auto-skip selectors match the live DOM.)*

If step 2 fails, speed control is broken on current Crunchyroll — which would
also explain the uninstall spike on the shipped v1.1.0, and should be fixed
before this version goes out rather than after.
