// youtube.js — PureFeed v11 ULTIMATE: Main-world injected zero-delay ad skip & shorts blocker

(function () {
    'use strict';

    // ========================
    // MAIN-WORLD INJECTION (Direct access to YouTube #movie_player internal API)
    // ========================

    function injectMainWorldSkipEngine() {
        const scriptId = 'purefeed-main-world-skip';
        if (document.getElementById(scriptId)) return;

        const script = document.createElement('script');
        script.id = scriptId;
        script.textContent = `
            (function() {
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

                function executeZeroDelaySkip() {
                    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
                    if (!player) return;

                    const isAdShowing = player.classList.contains('ad-showing') ||
                                        player.classList.contains('ad-interrupting') ||
                                        player.classList.contains('ad-created') ||
                                        player.querySelector('.ytp-ad-player-overlay, .ytp-ad-module, .ytp-ad-badge, ad-badge-view-model, .ytp-ad-text') !== null;

                    if (isAdShowing) {
                        // 1. Target all video tags inside player
                        const videos = player.querySelectorAll('video');
                        videos.forEach(v => {
                            if (!v.muted) v.muted = true;
                            try { v.playbackRate = 16; } catch(e) {}
                            try {
                                if (isFinite(v.duration) && v.duration > 0) {
                                    v.currentTime = Math.max(0, v.duration - 0.01);
                                } else {
                                    v.currentTime = 99999;
                                }
                            } catch(e) {}
                            try { v.dispatchEvent(new Event('ended', { bubbles: true })); } catch(e) {}
                        });

                        // 2. Click all skip buttons
                        player.querySelectorAll(SKIP_SELECTORS).forEach(btn => {
                            try { btn.click(); } catch(e) {}
                            try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch(e) {}
                        });

                        // 3. Invoke YouTube internal player API methods directly
                        try {
                            if (typeof player.skipAd === 'function') player.skipAd();
                        } catch(e) {}
                    }
                }

                // Sub-millisecond continuous polling in main world
                setInterval(executeZeroDelaySkip, 30);
            })();
        `;
        (document.head || document.documentElement).appendChild(script);
    }

    if (document.head || document.documentElement) {
        injectMainWorldSkipEngine();
    } else {
        document.addEventListener('DOMContentLoaded', injectMainWorldSkipEngine, { once: true });
    }

    // ========================
    // SETTINGS & DOM FLAGS
    // ========================

    let settings = { ytShorts: true, ytAds: true };

    function applyDOMFlags() {
        const root = document.documentElement || document.body;
        if (!root) return;
        root.setAttribute('data-purefeed-yt-shorts', settings.ytShorts ? 'true' : 'false');
        root.setAttribute('data-purefeed-yt-ads', settings.ytAds ? 'true' : 'false');
    }

    applyDOMFlags();
    if (!document.documentElement) {
        document.addEventListener('DOMContentLoaded', applyDOMFlags, { once: true });
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ ytShorts: true, ytAds: true }, (s) => {
            if (chrome.runtime.lastError) return;
            settings = s;
            applyDOMFlags();
            cleanPage();
        });

        chrome.runtime.onMessage.addListener((msg, sender) => {
            if (sender.id !== chrome.runtime.id) return;
            if (msg.type === 'settingsChanged') {
                if (msg.ytShorts !== undefined) settings.ytShorts = msg.ytShorts;
                if (msg.ytAds !== undefined) settings.ytAds = msg.ytAds;
                applyDOMFlags();
                cleanPage();
            }
        });
    }

    // ========================
    // CORE
    // ========================

    const processed = new WeakSet();

    function hide(el) {
        if (!el || processed.has(el)) return;
        processed.add(el);
        el.style.setProperty('display', 'none', 'important');
    }

    function isProtectedPage() {
        const path = window.location.pathname;
        return path.startsWith('/feed/') ||
               path.startsWith('/playlist') ||
               path === '/';
    }

    // ========================
    // SHORTS REMOVAL
    // ========================

    function removeShorts() {
        if (!settings.ytShorts) return;

        // 1. Sidebar
        document.querySelectorAll(
            'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer'
        ).forEach(el => {
            if (processed.has(el)) return;
            if (el.querySelector('a[href*="/shorts"]')) {
                hide(el);
            }
        });

        // 2. Reel shelf tags
        document.querySelectorAll('ytd-reel-shelf-renderer').forEach(shelf => {
            const parent = shelf.closest('ytd-rich-section-renderer');
            hide(parent || shelf);
        });

        // 3. Rich shelf with is-shorts attribute
        document.querySelectorAll('ytd-rich-shelf-renderer[is-shorts]').forEach(shelf => {
            hide(shelf.closest('ytd-rich-section-renderer') || shelf);
        });

        // 4. View-model shorts elements
        document.querySelectorAll('[class*="shortsLockupViewModelHost"]').forEach(el => {
            const shelf = el.closest('ytd-shelf-renderer, ytd-rich-section-renderer');
            if (shelf) {
                hide(shelf);
            } else {
                hide(el);
            }
        });

        // 5. Shorts filter chip
        document.querySelectorAll('yt-chip-cloud-chip-renderer').forEach(chip => {
            if (processed.has(chip)) return;
            if (chip.querySelector('a[href*="/shorts"], [path*="shorts"]')) {
                hide(chip);
            }
        });

        // 6. Channel page Shorts tab
        document.querySelectorAll('yt-tab-shape').forEach(tab => {
            if (processed.has(tab)) return;
            if (tab.querySelector('a[href*="/shorts"]') || (tab.getAttribute('tab-title') || '').toLowerCase().includes('shorts')) {
                hide(tab);
            }
        });

        // 7. Shelf headers with shorts links
        document.querySelectorAll('yt-shelf-header-layout').forEach(header => {
            if (processed.has(header)) return;
            if (header.querySelector('a[href*="/shorts"]')) {
                const shelf = header.closest('ytd-shelf-renderer');
                if (shelf) hide(shelf);
            }
        });

        // 8. Individual shorts links — non-protected pages
        if (!isProtectedPage()) {
            document.querySelectorAll('a[href*="/shorts/"]').forEach(link => {
                const c = link.closest(
                    'ytd-rich-item-renderer, ytd-grid-video-renderer, ' +
                    'ytd-reel-item-renderer, ytd-notification-renderer'
                );
                if (c) hide(c);
            });
        }

        // 9. Redirect from /shorts/ pages to regular watch
        if (window.location.pathname.startsWith('/shorts/')) {
            const id = window.location.pathname.split('/shorts/')[1];
            window.location.replace(id ? '/watch?v=' + id.split(/[/?]/)[0] : '/');
        }
    }

    // ========================
    // AD REMOVAL
    // ========================

    function removeAdElements() {
        if (!settings.ytAds) return;

        document.querySelectorAll(
            'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ' +
            'ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer, ' +
            'ytd-display-ad-renderer, ytd-banner-promo-renderer, ' +
            'ytd-search-pyv-renderer, ytd-compact-promoted-video-renderer, ' +
            'ytd-companion-slot-renderer, ytd-action-companion-ad-renderer, ' +
            'ytd-mealbar-promo-renderer, #masthead-ad, #player-ads'
        ).forEach(hide);

        document.querySelectorAll('ad-badge-view-model, feed-ad-metadata-view-model').forEach(el => {
            hide(el.closest('ytd-video-renderer, ytd-rich-item-renderer') || el);
        });
    }

    // ========================
    // CONTENT SCRIPT AD SKIP FALLBACK
    // ========================

    let wasMutedByUs = false;
    let adSkipActive = false;

    const SKIP_SELECTORS = [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        'button[class*="ytp-ad-skip"]',
        '.ytp-ad-skip-button-slot button',
        '.ytp-ad-skip-button-slot .ytp-ad-skip-button-container button',
        '.ytp-ad-overlay-close-button',
        '[class*="skip-button"]'
    ].join(', ');

    function forceSkipAd() {
        if (!settings.ytAds) return;

        const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (!player) return;

        const isAdShowing = player.classList.contains('ad-showing') ||
                            player.classList.contains('ad-interrupting') ||
                            player.classList.contains('ad-created') ||
                            player.querySelector('.ytp-ad-player-overlay, .ytp-ad-module, .ytp-ad-badge, ad-badge-view-model, .ytp-ad-text') !== null;

        if (isAdShowing) {
            adSkipActive = true;
            const videos = player.querySelectorAll('video');
            videos.forEach(video => {
                if (!video.muted) { video.muted = true; wasMutedByUs = true; }
                try { video.playbackRate = 16; } catch (e) {}
                try {
                    if (isFinite(video.duration) && video.duration > 0) {
                        video.currentTime = Math.max(0, video.duration - 0.01);
                    } else {
                        video.currentTime = 99999;
                    }
                } catch (e) {}
                try { video.dispatchEvent(new Event('ended', { bubbles: true })); } catch (e) {}
            });

            player.querySelectorAll(SKIP_SELECTORS).forEach(btn => {
                try { btn.click(); } catch (e) {}
            });

        } else if (adSkipActive || wasMutedByUs) {
            const video = player.querySelector('video');
            if (video) {
                if (wasMutedByUs) { video.muted = false; wasMutedByUs = false; }
                try { video.playbackRate = 1; } catch (e) {}
                if (video.paused) {
                    video.play().catch(() => {});
                }
            }
            adSkipActive = false;
        }
    }

    setInterval(forceSkipAd, 40);

    // ========================
    // MAIN CLEANUP
    // ========================

    let timer = null;
    let running = false;

    function cleanPage() {
        if (running) return;
        running = true;
        try {
            removeShorts();
            removeAdElements();
        } finally {
            running = false;
        }
    }

    const observer = new MutationObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(cleanPage, 150);
    });

    function start() {
        const root = document.documentElement || document.body;
        if (root) {
            observer.observe(root, { childList: true, subtree: true });
            cleanPage();
        } else {
            setTimeout(start, 50);
        }
    }

    start();
    window.addEventListener('yt-navigate-finish', () => setTimeout(cleanPage, 100));
    setTimeout(cleanPage, 1000);
    setTimeout(cleanPage, 3000);
})();
