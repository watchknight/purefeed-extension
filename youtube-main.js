// youtube-main.js — PureFeed Manifest V3 Main-World Instant Ad Skip Engine

(function () {
    'use strict';

    const SKIP_SELECTORS = [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        'button[class*="ytp-ad-skip"]',
        '.ytp-ad-skip-button-slot button',
        '.ytp-ad-skip-button-container button',
        '.ytp-ad-overlay-close-button'
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
                try { v.dispatchEvent(new Event('ended', { bubbles: true })); } catch(e) {}
            });

            player.querySelectorAll(SKIP_SELECTORS).forEach(btn => {
                try { btn.click(); } catch(e) {}
                try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch(e) {}
            });

            try {
                if (typeof player.skipAd === 'function') player.skipAd();
            } catch(e) {}

        } else if (wasMutedInMain) {
            const videos = player.querySelectorAll('video');
            videos.forEach(v => {
                v.muted = false;
                try { v.playbackRate = 1; } catch(e) {}
            });
            wasMutedInMain = false;
        }
    }

    setInterval(executeZeroDelaySkip, 40);
})();
