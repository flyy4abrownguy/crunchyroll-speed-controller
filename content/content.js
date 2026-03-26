// Crunchyroll Speed Controller - Content Script

(function() {
  'use strict';

  // State
  let currentSpeed = 1.0;
  let showIndicator = true;
  let indicatorTimeout = null;
  let indicatorElement = null;
  let videoElement = null;

  // Time tracking
  let timeSavedSec = 0;
  let timeWatchedSec = 0;
  let lastStatsSave = Date.now();

  // Per-series speed
  let perSeriesSpeed = false;
  let seriesSpeeds = {};
  let lastUrl = window.location.href;

  // Speed limits
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 4.0;
  let speedStep = 0.25;

  // Initialize
  async function init() {
    // Load saved settings
    const settings = await chrome.storage.sync.get({
      speed: 1.0,
      rememberSpeed: true,
      showIndicator: true,
      speedStep: 0.25,
      perSeriesSpeed: false,
      seriesSpeeds: {}
    });

    showIndicator = settings.showIndicator;
    speedStep = settings.speedStep;
    perSeriesSpeed = settings.perSeriesSpeed;
    seriesSpeeds = settings.seriesSpeeds;

    if (settings.rememberSpeed) {
      currentSpeed = settings.speed;
    }

    // Apply per-series speed if enabled
    if (perSeriesSpeed) {
      const slug = getSeriesSlug();
      if (slug && seriesSpeeds[slug] !== undefined) {
        currentSpeed = seriesSpeeds[slug];
      }
    }

    // Load existing stats
    const statsData = await chrome.storage.local.get({
      stats: { totalTimeSavedSec: 0, totalTimeWatchedSec: 0 }
    });
    timeSavedSec = statsData.stats.totalTimeSavedSec;
    timeWatchedSec = statsData.stats.totalTimeWatchedSec;

    // Create indicator element
    createIndicator();

    // Find and set up video
    findAndSetupVideo();

    // Watch for dynamically loaded videos
    observeVideoChanges();

    // Periodic check for videos (backup for dynamic loading) + time tracking
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

      // Check for SPA URL changes
      checkUrlChange();

      // Track time saved when watching at modified speed
      if (videoElement && !videoElement.paused && currentSpeed > 1.0) {
        const interval = 2; // seconds (matches setInterval period)
        const saved = interval * (1 - 1 / currentSpeed);
        timeSavedSec += saved;
        timeWatchedSec += interval;
      }

      // Persist stats every 30 seconds
      if (Date.now() - lastStatsSave >= 30000) {
        chrome.storage.local.set({
          stats: {
            totalTimeSavedSec: Math.round(timeSavedSec),
            totalTimeWatchedSec: Math.round(timeWatchedSec)
          }
        });
        lastStatsSave = Date.now();
      }
    }, 2000);

    // Listen for SPA navigation
    window.addEventListener('popstate', checkUrlChange);

    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener(handleMessage);

    console.log('Crunchyroll Speed Controller initialized');
  }

  // Extract series slug from Crunchyroll URL
  // URLs follow: /watch/{episodeId}/{slug} or /series/{seriesId}/{slug}
  function getSeriesSlug() {
    const path = window.location.pathname;
    const watchMatch = path.match(/^\/(?:[a-z]{2}\/)?watch\/[^/]+\/([^/]+)/);
    if (watchMatch) {
      // Extract series name from episode slug (e.g., "one-piece-episode-1100" → "one-piece")
      const slug = watchMatch[1];
      // Remove episode number suffix like "-episode-123"
      return slug.replace(/-episode-\d+.*$/, '');
    }
    const seriesMatch = path.match(/^\/(?:[a-z]{2}\/)?series\/[^/]+\/([^/]+)/);
    if (seriesMatch) {
      return seriesMatch[1];
    }
    return null;
  }

  // Handle URL changes (Crunchyroll is a SPA)
  function checkUrlChange() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      if (perSeriesSpeed) {
        const slug = getSeriesSlug();
        if (slug && seriesSpeeds[slug] !== undefined) {
          setVideoSpeed(seriesSpeeds[slug]);
        }
      }
    }
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
    chrome.storage.sync.get({ rememberSpeed: true, perSeriesSpeed: false, seriesSpeeds: {} }, (settings) => {
      if (settings.rememberSpeed) {
        chrome.storage.sync.set({ speed: speed });
      }
      // Save per-series speed if enabled
      if (settings.perSeriesSpeed) {
        const slug = getSeriesSlug();
        if (slug) {
          const updatedSpeeds = { ...settings.seriesSpeeds, [slug]: speed };
          // Cap at 50 entries (LRU: remove oldest if over limit)
          const keys = Object.keys(updatedSpeeds);
          if (keys.length > 50) {
            delete updatedSpeeds[keys[0]];
          }
          seriesSpeeds = updatedSpeeds;
          chrome.storage.sync.set({ seriesSpeeds: updatedSpeeds });
        }
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
        const increased = setVideoSpeed(currentSpeed + speedStep);
        sendResponse({ success: true, speed: increased });
        break;

      case 'decreaseSpeed':
        const decreased = setVideoSpeed(currentSpeed - speedStep);
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

      case 'setSpeedStep':
        speedStep = message.speedStep;
        sendResponse({ success: true, speedStep });
        break;

      case 'setPerSeriesSpeed':
        perSeriesSpeed = message.enabled;
        sendResponse({ success: true, perSeriesSpeed });
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
      setVideoSpeed(currentSpeed + speedStep);
    }

    // Shift + < (comma) - Decrease speed
    if (e.shiftKey && e.key === '<') {
      e.preventDefault();
      setVideoSpeed(currentSpeed - speedStep);
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
