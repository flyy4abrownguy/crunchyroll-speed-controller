# Privacy Policy for Crunchyroll Speed Controller

**Last Updated:** July 2026

## Overview

Crunchyroll Speed Controller is a browser extension that lets users control video playback speed and auto-skip intros/outros on supported anime streaming sites (Crunchyroll and HIDIVE). This privacy policy explains how the extension handles user data.

## Data Collection

**We do not collect any personal data.**

Crunchyroll Speed Controller:
- Does NOT collect personal information
- Does NOT track browsing history
- Does NOT use analytics or tracking services
- Does NOT share any information with third parties

The only exception is the **optional feedback feature**: when you choose to submit feedback through the extension popup, your message (along with the feedback type, extension version, and current speed setting) is sent to a Google Sheet managed by the developer. This is entirely voluntary and user-initiated. No data is sent automatically.

## Local Storage

The extension uses Chrome's built-in storage API (`chrome.storage.sync`) to save your preferences locally. This includes:

- **Playback speed setting** - Your preferred video playback speed
- **Remember speed preference** - Whether to remember your speed setting
- **Show indicator preference** - Whether to display the on-screen speed indicator
- **Speed step preference** - Your chosen increment for speed adjustments
- **Per-series speed settings** - Speed preferences saved per anime series (if enabled)
- **Auto-skip preference** - Whether intros/outros are skipped automatically
- **Custom keyboard shortcuts** - Your rebound in-page shortcut keys
- **Watch statistics** - Cumulative time saved, time skipped, intros skipped, per-series totals, and daily activity used to power the stats dashboard and streaks (stored locally only via `chrome.storage.local`, never synced or transmitted)

This data:
- Is stored locally in your browser
- Syncs across your Chrome browsers if you're signed into Chrome (via Chrome's built-in sync)
- Is never transmitted to any external servers
- Can be cleared by removing the extension or clearing browser data

## Permissions Explained

### Storage Permission
Used solely to save your speed preferences locally so they persist between browser sessions.

### Host Permissions (crunchyroll.com, hidive.com)
Required to inject the content script that controls video playback speed and auto-skips intros/outros on supported sites. The extension only runs on crunchyroll.com and hidive.com domains.

## Third-Party Services

**Feedback (Google Apps Script).** The optional feedback feature sends user-submitted feedback to a Google Sheet via Google Apps Script. This only occurs when the user explicitly clicks "Submit" in the feedback form. Only the message text you type is sent — no identifiers, browsing data, or page content. No data is sent automatically or without user action.

**Tip jar (PayPal).** The popup and stats dashboard include optional tip buttons. Clicking one simply opens a PayPal.me page in a new browser tab; the extension does not process, handle, or receive any payment information, and no data about you is transmitted by the extension when you click. Anything that happens on PayPal's site is governed by [PayPal's own privacy policy](https://www.paypal.com/us/legalhub/privacy-full). You never need to tip to use any feature — the extension is fully functional for free.

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last Updated" date above.

## Contact

If you have questions about this privacy policy or the extension, please open an issue on our GitHub repository or contact the developer.

## Open Source

This extension's source code is available for review. You can verify that no data collection occurs by examining the code yourself.
