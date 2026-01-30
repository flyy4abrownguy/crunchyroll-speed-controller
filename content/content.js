// Crunchyroll Speed Controller - Content Script

(function() {
  'use strict';

  // State
  let currentSpeed = 1.0;
  let showIndicator = true;
  let indicatorTimeout = null;
  let indicatorElement = null;
  let videoElement = null;

  // Speed limits
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 4.0;
  const SPEED_STEP = 0.25;

  // Initialize
  async function init() {
    // Load saved settings
    const settings = await chrome.storage.sync.get({
      speed: 1.0,
      rememberSpeed: true,
      showIndicator: true
    });

    showIndicator = settings.showIndicator;

    if (settings.rememberSpeed) {
      currentSpeed = settings.speed;
    }

    // Create indicator element
    createIndicator();

    // Find and set up video
    findAndSetupVideo();

    // Watch for dynamically loaded videos
    observeVideoChanges();

    // Periodic check for videos (backup for dynamic loading)
    setInterval(() => {
      const videos = document.querySelectorAll('video');
      if (videos.length > 0 && !videoElement) {
        findAndSetupVideo();
      }
      // Ensure speed is applied to all videos
      videos.forEach(video => {
        if (video.playbackRate !== currentSpeed) {
          video.playbackRate = currentSpeed;
        }
      });
    }, 2000);

    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener(handleMessage);

    console.log('Crunchyroll Speed Controller initialized');
  }

  // Create the on-screen speed indicator
  function createIndicator() {
    if (indicatorElement) return;

    indicatorElement = document.createElement('div');
    indicatorElement.id = 'csc-speed-indicator';
    indicatorElement.className = 'csc-indicator';
    indicatorElement.textContent = `${currentSpeed.toFixed(2)}x`;
    document.body.appendChild(indicatorElement);
  }

  // Show the speed indicator temporarily
  function showSpeedIndicator(speed, persistent = false) {
    if (!showIndicator || !indicatorElement) return;

    indicatorElement.textContent = `${speed.toFixed(2)}x`;
    indicatorElement.classList.add('visible');

    // Add modified class if not at normal speed
    if (Math.abs(speed - 1.0) > 0.01) {
      indicatorElement.classList.add('modified');
    } else {
      indicatorElement.classList.remove('modified');
    }

    // Clear existing timeout
    if (indicatorTimeout) {
      clearTimeout(indicatorTimeout);
      indicatorTimeout = null;
    }

    // Auto-hide after delay (unless persistent)
    if (!persistent) {
      indicatorTimeout = setTimeout(() => {
        indicatorElement.classList.remove('visible');
      }, 1500);
    }
  }

  // Hide the indicator
  function hideIndicator() {
    if (indicatorElement) {
      indicatorElement.classList.remove('visible');
    }
  }

  // Find video element and apply speed
  function findAndSetupVideo() {
    // Crunchyroll uses HTML5 video
    const videos = document.querySelectorAll('video');

    if (videos.length > 0) {
      videoElement = videos[0]; // Primary video player

      // Apply saved speed
      setVideoSpeed(currentSpeed, false);

      // Listen for video events
      videoElement.addEventListener('ratechange', onRateChange);
      videoElement.addEventListener('loadeddata', () => {
        // Reapply speed when new video loads
        setVideoSpeed(currentSpeed, false);
      });

      // Also reapply on play to catch any resets
      videoElement.addEventListener('play', () => {
        if (videoElement.playbackRate !== currentSpeed) {
          videoElement.playbackRate = currentSpeed;
        }
      });

      console.log('Video element found and configured:', videoElement);
    } else {
      // Retry after a delay if no video found yet
      setTimeout(findAndSetupVideo, 1000);
    }
  }

  // Handle rate change events (for sync with native controls)
  function onRateChange(e) {
    if (e.target.playbackRate !== currentSpeed) {
      // Only update if changed externally
      // currentSpeed = e.target.playbackRate;
      // showSpeedIndicator(currentSpeed);
    }
  }

  // Observe DOM for dynamically loaded videos
  function observeVideoChanges() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          // Check if a video was added
          const newVideo = document.querySelector('video');
          if (newVideo && newVideo !== videoElement) {
            videoElement = newVideo;
            setVideoSpeed(currentSpeed, false);

            videoElement.addEventListener('ratechange', onRateChange);
            videoElement.addEventListener('loadeddata', () => {
              setVideoSpeed(currentSpeed, false);
            });
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Set video playback speed
  function setVideoSpeed(speed, showUI = true) {
    speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
    speed = Math.round(speed * 100) / 100;

    currentSpeed = speed;

    // Apply to all videos (in case there are multiple)
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      video.playbackRate = speed;
    });

    // Show indicator
    if (showUI) {
      showSpeedIndicator(speed);
    }

    // Save to storage
    chrome.storage.sync.get({ rememberSpeed: true }, (settings) => {
      if (settings.rememberSpeed) {
        chrome.storage.sync.set({ speed: speed });
      }
    });

    return speed;
  }

  // Handle messages from popup or background script
  function handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case 'setSpeed':
        const newSpeed = setVideoSpeed(message.speed);
        sendResponse({ success: true, speed: newSpeed });
        break;

      case 'getSpeed':
        sendResponse({ speed: currentSpeed });
        break;

      case 'increaseSpeed':
        const increased = setVideoSpeed(currentSpeed + SPEED_STEP);
        sendResponse({ success: true, speed: increased });
        break;

      case 'decreaseSpeed':
        const decreased = setVideoSpeed(currentSpeed - SPEED_STEP);
        sendResponse({ success: true, speed: decreased });
        break;

      case 'resetSpeed':
        const reset = setVideoSpeed(1.0);
        sendResponse({ success: true, speed: reset });
        break;

      case 'toggleIndicator':
        showIndicator = message.show !== undefined ? message.show : !showIndicator;
        if (!showIndicator) {
          hideIndicator();
        }
        sendResponse({ success: true, showIndicator });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }

    return true; // Keep message channel open for async response
  }

  // Keyboard shortcut handling (fallback for when chrome.commands doesn't work)
  document.addEventListener('keydown', (e) => {
    // Only handle if video exists and focus is not on input
    if (!videoElement) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Shift + > (period) - Increase speed
    if (e.shiftKey && e.key === '>') {
      e.preventDefault();
      setVideoSpeed(currentSpeed + SPEED_STEP);
    }

    // Shift + < (comma) - Decrease speed
    if (e.shiftKey && e.key === '<') {
      e.preventDefault();
      setVideoSpeed(currentSpeed - SPEED_STEP);
    }

    // Shift + ? (slash) - Reset speed
    if (e.shiftKey && e.key === '?') {
      e.preventDefault();
      setVideoSpeed(1.0);
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
