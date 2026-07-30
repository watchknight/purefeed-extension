// youtube-main.js — PureFeed v14: Instant 0ms ad-skip with forced play trigger

(function () {
    'use strict';

    const SKIP_SELECTORS = [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        'button[class*="ytp-ad-skip"]',
        '.ytp-ad-skip-button-slot button',
        '.ytp-ad-skip-button-container button',
        '.ytp-ad-overlay-close-button',
        '[class*="skip-button"]'
    ].join(', ');

    function isVideoAdPlaying(player) {
        if (!player) return false;
        if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
            return true;
        }
        if (player.querySelector('.ytp-ad-player-overlay, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button')) {
            return true;
        }
        return false;
    }

    let wasMutedInMain = false;

    function executeZeroDelaySkip() {
        const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (!player) return;

        const isAd = isVideoAdPlaying(player);

        if (isAd) {
            const videos = player.querySelectorAll('video');
            videos.forEach(v => {
                if (!v.muted) { v.muted = true; wasMutedInMain = true; }
                try { v.playbackRate = 16; } catch(e) {}
                try {
                    if (isFinite(v.duration) && v.duration > 0) {
                        v.currentTime = Math.max(0, v.duration - 0.01);
                    }
                } catch(e) {}
                // Crucial fix: Force play so HTML5 video engine fires the ended event and advances stream!
                try {
                    if (v.paused) {
                        v.play().catch(() => {});
                    }
                } catch(e) {}
                try { v.dispatchEvent(new Event('ended', { bubbles: true })); } catch(e) {}
            });

            // Fast-click skip buttons
            player.querySelectorAll(SKIP_SELECTORS).forEach(btn => {
                try { btn.click(); } catch(e) {}
                try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch(e) {}
            });

            // Call native player APIs
            try { if (typeof player.skipAd === 'function') player.skipAd(); } catch(e) {}

        } else if (wasMutedInMain) {
            const videos = player.querySelectorAll('video');
            videos.forEach(v => {
                v.muted = false;
                try { v.playbackRate = 1; } catch(e) {}
                if (v.paused && v.readyState >= 2) {
                    v.play().catch(() => {});
                }
            });
            wasMutedInMain = false;
        }
    }

    // High-speed 20ms polling interval for immediate 0ms ad skipping
    setInterval(executeZeroDelaySkip, 20);
})();
