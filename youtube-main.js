// youtube-main.js — PureFeed v17: Adaptive zero-delay ad skip & power-optimized video resume

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
    let adHandlingActive = false;
    let burstIntervalId = null;

    function clickAllSkipButtons(player) {
        player.querySelectorAll(SKIP_SELECTORS).forEach(btn => {
            try { btn.click(); } catch(e) {}
            try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch(e) {}
        });
    }

    function executeZeroDelaySkip() {
        const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (!player) return;

        // Check if user has disabled YouTube Ad Blocking in extension settings
        const isAdBlockEnabled = document.documentElement.getAttribute('data-purefeed-yt-ads') !== 'false';
        if (!isAdBlockEnabled) {
            if (wasMutedInMain || adHandlingActive) {
                const videos = player.querySelectorAll('video');
                videos.forEach(v => {
                    if (wasMutedInMain) { v.muted = false; }
                    try { v.playbackRate = 1; } catch(e) {}
                });
                wasMutedInMain = false;
                adHandlingActive = false;
            }
            if (burstIntervalId) {
                clearInterval(burstIntervalId);
                burstIntervalId = null;
            }
            return;
        }

        const isAd = isVideoAdPlaying(player);
        const videos = player.querySelectorAll('video');

        if (isAd) {
            // Activate high-frequency 20ms burst polling during active ad skipping
            if (!burstIntervalId) {
                burstIntervalId = setInterval(executeZeroDelaySkip, 20);
            }

            if (!adHandlingActive) {
                adHandlingActive = true;

                // 1. Mute instantly
                videos.forEach(v => {
                    if (!v.muted) { v.muted = true; wasMutedInMain = true; }
                });

                // 2. Fast forward ONCE to the end (prevents 15-second resetting loop)
                videos.forEach(v => {
                    try { v.playbackRate = 16; } catch(e) {}
                    try {
                        if (isFinite(v.duration) && v.duration > 0) {
                            v.currentTime = Math.max(0, v.duration - 0.01);
                        } else {
                            v.currentTime = 99999;
                        }
                    } catch(e) {}
                    try { if (v.paused) v.play().catch(() => {}); } catch(e) {}
                    try { v.dispatchEvent(new Event('ended', { bubbles: true })); } catch(e) {}
                });

                // 3. Invoke native player APIs
                try { if (typeof player.skipAd === 'function') player.skipAd(); } catch(e) {}
                clickAllSkipButtons(player);

            } else {
                // Continuation while ad finishes unloading — maintain speed & clicks without resetting currentTime
                videos.forEach(v => {
                    try { v.playbackRate = 16; } catch(e) {}
                    try { if (v.paused) v.play().catch(() => {}); } catch(e) {}
                });
                clickAllSkipButtons(player);
                try { if (typeof player.skipAd === 'function') player.skipAd(); } catch(e) {}
            }

        } else if (adHandlingActive || wasMutedInMain) {
            // Ad is completely finished — restore volume, speed, and resume main video
            adHandlingActive = false;
            if (burstIntervalId) {
                clearInterval(burstIntervalId);
                burstIntervalId = null;
            }

            videos.forEach(v => {
                if (wasMutedInMain) { v.muted = false; }
                try { v.playbackRate = 1; } catch(e) {}
                try { if (v.paused) v.play().catch(() => {}); } catch(e) {}
            });
            wasMutedInMain = false;

            // Trigger native player play to guarantee immediate video resume
            try { if (typeof player.playVideo === 'function') player.playVideo(); } catch(e) {}
        }
    }

    // Adaptive background loop (100ms idle interval + event-driven acceleration)
    setInterval(executeZeroDelaySkip, 100);

    // Event-driven instant response on player class change
    function initPlayerObserver() {
        const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (!player) {
            setTimeout(initPlayerObserver, 200);
            return;
        }
        const observer = new MutationObserver(() => {
            if (isVideoAdPlaying(player)) {
                executeZeroDelaySkip();
            }
        });
        observer.observe(player, { attributes: true, attributeFilter: ['class'] });
    }
    initPlayerObserver();
})();
