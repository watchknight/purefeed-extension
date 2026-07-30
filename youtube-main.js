// youtube-main.js — PureFeed v15 PROVEN: Non-looping zero-delay ad skip & instant video resume

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

    function clickAllSkipButtons(player) {
        player.querySelectorAll(SKIP_SELECTORS).forEach(btn => {
            try { btn.click(); } catch(e) {}
            try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch(e) {}
        });
    }

    function executeZeroDelaySkip() {
        const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (!player) return;

        const isAd = isVideoAdPlaying(player);
        const videos = player.querySelectorAll('video');

        if (isAd) {
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

    // High-speed 20ms continuous monitoring loop
    setInterval(executeZeroDelaySkip, 20);
})();
