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
  if (details.reason === 'install') {
    // Set default settings on first install
    chrome.storage.sync.set({
      speed: 1.0,
      rememberSpeed: true,
      showIndicator: true
    });

    console.log('Crunchyroll Speed Controller installed');
  } else if (details.reason === 'update') {
    console.log('Crunchyroll Speed Controller updated to version', chrome.runtime.getManifest().version);
  }
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle any background-specific messages here
  if (message.action === 'getSettings') {
    chrome.storage.sync.get({
      speed: 1.0,
      rememberSpeed: true,
      showIndicator: true
    }, (settings) => {
      sendResponse(settings);
    });
    return true; // Keep channel open for async response
  }
});
