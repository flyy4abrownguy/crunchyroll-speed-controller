// Crunchyroll Speed Controller - Service Worker

// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  // Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes('crunchyroll.com')) {
    return; // Only work on Crunchyroll
  }

  let action;
  switch (command) {
    case 'increase-speed':
      action = 'increaseSpeed';
      break;
    case 'decrease-speed':
      action = 'decreaseSpeed';
      break;
    case 'reset-speed':
      action = 'resetSpeed';
      break;
    case 'toggle-indicator':
      action = 'toggleIndicator';
      break;
    default:
      return;
  }

  // Send message to content script
  try {
    await chrome.tabs.sendMessage(tab.id, { action });
  } catch (e) {
    console.log('Could not send command to content script:', e.message);
  }
});

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  const defaultSettings = {
    speed: 1.0,
    rememberSpeed: true,
    showIndicator: true,
    speedStep: 0.25,
    perSeriesSpeed: false,
    seriesSpeeds: {}
  };

  if (details.reason === 'install') {
    // Set default settings on first install
    chrome.storage.sync.set(defaultSettings);
    chrome.storage.local.set({
      stats: { totalTimeSavedSec: 0, totalTimeWatchedSec: 0 }
    });

    console.log('Crunchyroll Speed Controller installed');
  } else if (details.reason === 'update') {
    // Migrate storage: add new keys without overwriting existing settings
    chrome.storage.sync.get(null, (existing) => {
      const updates = {};
      for (const [key, value] of Object.entries(defaultSettings)) {
        if (!(key in existing)) {
          updates[key] = value;
        }
      }
      if (Object.keys(updates).length > 0) {
        chrome.storage.sync.set(updates);
      }
    });
    chrome.storage.local.get('stats', (result) => {
      if (!result.stats) {
        chrome.storage.local.set({
          stats: { totalTimeSavedSec: 0, totalTimeWatchedSec: 0 }
        });
      }
    });

    console.log('Crunchyroll Speed Controller updated to version', chrome.runtime.getManifest().version);
  }
});

const FEEDBACK_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxV8gykfeOxENvhRDSHXAce7DHkTr0My0yRuOCv7trGl6xxoNn_XRLEC7aqPV8Cev5P/exec';

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'submitFeedback') {
    fetch(FEEDBACK_WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify(message.data)
    })
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'getSettings') {
    chrome.storage.sync.get({
      speed: 1.0,
      rememberSpeed: true,
      showIndicator: true,
      speedStep: 0.25,
      perSeriesSpeed: false,
      seriesSpeeds: {}
    }, (settings) => {
      sendResponse(settings);
    });
    return true; // Keep channel open for async response
  }
});
