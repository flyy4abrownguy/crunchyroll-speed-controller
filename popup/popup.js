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

// Speed step for fine controls
const SPEED_STEP = 0.25;
const MIN_SPEED = 0.25;
const MAX_SPEED = 4.0;

// Current state
let currentSpeed = 1.0;
let isOnCrunchyroll = false;

// Initialize popup
async function init() {
  // Load saved settings
  const settings = await chrome.storage.sync.get({
    speed: 1.0,
    rememberSpeed: true,
    showIndicator: true
  });

  currentSpeed = settings.speed;
  rememberSpeedCheckbox.checked = settings.rememberSpeed;
  showIndicatorCheckbox.checked = settings.showIndicator;

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
  setSpeed(currentSpeed - SPEED_STEP);
});

increaseBtn.addEventListener('click', () => {
  setSpeed(currentSpeed + SPEED_STEP);
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

// Initialize on load
init();
