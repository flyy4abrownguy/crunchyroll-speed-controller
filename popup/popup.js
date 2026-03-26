// DOM Elements
const speedValue = document.getElementById('speedValue');
const speedSlider = document.getElementById('speedSlider');
const quickButtons = document.querySelectorAll('.quick-btn');
const decreaseBtn = document.getElementById('decreaseBtn');
const resetBtn = document.getElementById('resetBtn');
const increaseBtn = document.getElementById('increaseBtn');
const rememberSpeedCheckbox = document.getElementById('rememberSpeed');
const showIndicatorCheckbox = document.getElementById('showIndicator');
const statusElement = document.getElementById('status');
const speedStepSelect = document.getElementById('speedStepSelect');
const perSeriesSpeedCheckbox = document.getElementById('perSeriesSpeed');
const decreaseLabel = document.getElementById('decreaseLabel');
const increaseLabel = document.getElementById('increaseLabel');

// Speed step for fine controls
let speedStep = 0.25;
const MIN_SPEED = 0.25;
const MAX_SPEED = 4.0;

// Current state
let currentSpeed = 1.0;
let isOnCrunchyroll = false;

function updateStepLabels() {
  const stepStr = speedStep % 1 === 0 ? speedStep.toFixed(1) : String(speedStep);
  decreaseLabel.textContent = `-${stepStr}`;
  increaseLabel.textContent = `+${stepStr}`;
}

// Initialize popup
async function init() {
  // Load saved settings
  const settings = await chrome.storage.sync.get({
    speed: 1.0,
    rememberSpeed: true,
    showIndicator: true,
    speedStep: 0.25,
    perSeriesSpeed: false
  });

  currentSpeed = settings.speed;
  rememberSpeedCheckbox.checked = settings.rememberSpeed;
  showIndicatorCheckbox.checked = settings.showIndicator;
  speedStep = settings.speedStep;
  speedStepSelect.value = String(settings.speedStep);
  perSeriesSpeedCheckbox.checked = settings.perSeriesSpeed;
  updateStepLabels();

  updateUI(currentSpeed);

  // Check if we're on Crunchyroll
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.includes('crunchyroll.com')) {
    isOnCrunchyroll = true;
    setStatus(true);

    // Get current speed from content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSpeed' });
      if (response && response.speed !== undefined) {
        currentSpeed = response.speed;
        updateUI(currentSpeed);
      }
    } catch (e) {
      // Content script might not be loaded yet
      console.log('Could not communicate with content script');
    }
  } else {
    isOnCrunchyroll = false;
    setStatus(false);
  }

  // Load time saved stats
  const statsData = await chrome.storage.local.get({
    stats: { totalTimeSavedSec: 0, totalTimeWatchedSec: 0 }
  });
  const timeSavedEl = document.getElementById('timeSaved');
  const totalSec = Math.round(statsData.stats.totalTimeSavedSec);
  if (totalSec >= 3600) {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    timeSavedEl.textContent = `${hours}h ${mins}m`;
  } else {
    const mins = Math.floor(totalSec / 60);
    timeSavedEl.textContent = `${mins}m`;
  }
}

// Update UI to reflect current speed
function updateUI(speed) {
  speedValue.textContent = speed.toFixed(2);
  speedSlider.value = speed;

  // Update speed display color
  if (speed === 1.0) {
    speedValue.classList.add('normal');
  } else {
    speedValue.classList.remove('normal');
  }

  // Update quick button states
  quickButtons.forEach(btn => {
    const btnSpeed = parseFloat(btn.dataset.speed);
    if (Math.abs(btnSpeed - speed) < 0.01) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Set status indicator
function setStatus(active) {
  if (active) {
    statusElement.classList.add('active');
    statusElement.classList.remove('inactive');
    statusElement.querySelector('.status-text').textContent = 'Active';
  } else {
    statusElement.classList.remove('active');
    statusElement.classList.add('inactive');
    statusElement.querySelector('.status-text').textContent = 'Not on Crunchyroll';
  }
}

// Send speed change to content script
async function setSpeed(speed) {
  speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
  speed = Math.round(speed * 100) / 100; // Round to 2 decimal places

  currentSpeed = speed;
  updateUI(speed);

  // Save to storage if remember is enabled
  if (rememberSpeedCheckbox.checked) {
    await chrome.storage.sync.set({ speed: speed });
  }

  // Send to content script if on Crunchyroll
  if (isOnCrunchyroll) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'setSpeed',
          speed: speed
        });
      } catch (e) {
        console.log('Could not send speed to content script');
      }
    }
  }
}

// Event Listeners

// Slider input
speedSlider.addEventListener('input', (e) => {
  const speed = parseFloat(e.target.value);
  setSpeed(speed);
});

// Quick buttons
quickButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const speed = parseFloat(btn.dataset.speed);
    setSpeed(speed);
  });
});

// Fine control buttons
decreaseBtn.addEventListener('click', () => {
  setSpeed(currentSpeed - speedStep);
});

increaseBtn.addEventListener('click', () => {
  setSpeed(currentSpeed + speedStep);
});

resetBtn.addEventListener('click', () => {
  setSpeed(1.0);
});

// Settings toggles
rememberSpeedCheckbox.addEventListener('change', async () => {
  await chrome.storage.sync.set({
    rememberSpeed: rememberSpeedCheckbox.checked
  });

  // Save current speed if enabling remember
  if (rememberSpeedCheckbox.checked) {
    await chrome.storage.sync.set({ speed: currentSpeed });
  }
});

showIndicatorCheckbox.addEventListener('change', async () => {
  const showIndicator = showIndicatorCheckbox.checked;
  await chrome.storage.sync.set({ showIndicator });

  // Send to content script
  if (isOnCrunchyroll) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'toggleIndicator',
          show: showIndicator
        });
      } catch (e) {
        console.log('Could not send indicator toggle to content script');
      }
    }
  }
});

// Per-series speed toggle
perSeriesSpeedCheckbox.addEventListener('change', async () => {
  const enabled = perSeriesSpeedCheckbox.checked;
  await chrome.storage.sync.set({ perSeriesSpeed: enabled });

  if (isOnCrunchyroll) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'setPerSeriesSpeed',
          enabled: enabled
        });
      } catch (e) {
        console.log('Could not send per-series setting to content script');
      }
    }
  }
});

// Speed step change
speedStepSelect.addEventListener('change', async () => {
  speedStep = parseFloat(speedStepSelect.value);
  updateStepLabels();
  await chrome.storage.sync.set({ speedStep });

  // Notify content script
  if (isOnCrunchyroll) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'setSpeedStep',
          speedStep: speedStep
        });
      } catch (e) {
        console.log('Could not send speed step to content script');
      }
    }
  }
});

// Feedback system

const feedbackTrigger = document.getElementById('feedbackTrigger');
const feedbackPanel = document.getElementById('feedbackPanel');
const feedbackMsg = document.getElementById('feedbackMsg');
const feedbackSubmit = document.getElementById('feedbackSubmit');
const feedbackStatus = document.getElementById('feedbackStatus');

feedbackTrigger.addEventListener('click', () => {
  feedbackPanel.classList.toggle('open');
  feedbackStatus.textContent = '';
  feedbackStatus.className = 'feedback-status';
});

feedbackSubmit.addEventListener('click', async () => {
  const message = feedbackMsg.value.trim();
  if (!message) {
    feedbackStatus.textContent = 'Please enter your feedback';
    feedbackStatus.className = 'feedback-status error';
    return;
  }

  // Rate limit: 5 min between submissions
  const rateData = await chrome.storage.local.get({ lastFeedbackTime: 0 });
  if (Date.now() - rateData.lastFeedbackTime < 5 * 60 * 1000) {
    feedbackStatus.textContent = 'Please wait a few minutes before submitting again';
    feedbackStatus.className = 'feedback-status error';
    return;
  }

  const type = document.querySelector('input[name="fbType"]:checked').value;
  const version = chrome.runtime.getManifest().version;

  feedbackSubmit.disabled = true;
  feedbackSubmit.textContent = 'Sending...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'submitFeedback',
      data: {
        type,
        message,
        version,
        speed: currentSpeed,
        timestamp: new Date().toISOString()
      }
    });

    if (response && response.success) {
      feedbackStatus.textContent = 'Thanks for your feedback!';
      feedbackStatus.className = 'feedback-status success';
      feedbackMsg.value = '';
      await chrome.storage.local.set({ lastFeedbackTime: Date.now() });
    } else {
      feedbackStatus.textContent = 'Failed to send. Try again later.';
      feedbackStatus.className = 'feedback-status error';
    }
  } catch (e) {
    feedbackStatus.textContent = 'Failed to send. Try again later.';
    feedbackStatus.className = 'feedback-status error';
  } finally {
    feedbackSubmit.disabled = false;
    feedbackSubmit.textContent = 'Submit';
  }
});

// Initialize on load
init();
