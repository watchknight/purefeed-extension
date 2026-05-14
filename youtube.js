// youtube.js — PureFeed v7 FINAL: History-safe, instant ad skip

(function () {
    'use strict';

    // ========================
    // SETTINGS
    // ========================

    let settings = { ytShorts: true, ytAds: true };

    if (chrome.storage) {
        chrome.storage.local.get({ ytShorts: true, ytAds: true }, (s) => {
            settings = s;
        });
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.type === 'settingsChanged') {
                if (msg.ytShorts !== undefined) settings.ytShorts = msg.ytShorts;
                if (msg.ytAds !== undefined) settings.ytAds = msg.ytAds;
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

    // Pages where shorts hiding should be limited to avoid breaking content
    function isProtectedPage() {
        const path = window.location.pathname;
        return path.startsWith('/feed/') ||    // history, library, subscriptions
               path.startsWith('/playlist') || // playlists
               path === '/';                   // don't break homepage (CSS handles it)
    }

    // ========================
    // SHORTS REMOVAL
    // ========================

    function removeShorts() {
        if (!settings.ytShorts) return;

        // 1. Sidebar — always safe to hide
        document.querySelectorAll(
            'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer'
        ).forEach(el => {
            if (processed.has(el)) return;
            if (el.querySelector('a[title="Shorts"], a[href="/shorts"], a[href="/shorts/"]')) {
                hide(el);
            }
        });

        // 2. Reel shelf tags — these are ONLY used for shorts, safe everywhere
        document.querySelectorAll('ytd-reel-shelf-renderer').forEach(shelf => {
            const parent = shelf.closest('ytd-rich-section-renderer');
            hide(parent || shelf);
        });

        // 3. Rich shelf with is-shorts attribute — only used for shorts
        document.querySelectorAll('ytd-rich-shelf-renderer[is-shorts]').forEach(shelf => {
            hide(shelf.closest('ytd-rich-section-renderer') || shelf);
        });

        // 4. View-model shorts elements — ONLY hide their immediate container,
        //    NOT parent ytd-item-section-renderer (which could be the history page)
        document.querySelectorAll('[class*="shortsLockupViewModelHost"]').forEach(el => {
            // Only hide the shelf-renderer, not item-section-renderer
            const shelf = el.closest('ytd-shelf-renderer, ytd-rich-section-renderer');
            if (shelf) {
                hide(shelf);
            } else {
                hide(el);
            }
        });

        // 5. Shorts filter chip — always safe
        document.querySelectorAll('yt-chip-cloud-chip-renderer').forEach(chip => {
            if (processed.has(chip)) return;
            if (chip.textContent.trim() === 'Shorts') hide(chip);
        });

        // 6. Channel page Shorts tab
        document.querySelectorAll('yt-tab-shape[tab-title="Shorts"]').forEach(hide);

        // 7. Shelf headers with "Shorts" text — ONLY hide the shelf, not section
        document.querySelectorAll('yt-shelf-header-layout').forEach(header => {
            if (processed.has(header)) return;
            if (header.querySelector('a[href="/shorts"], a[href="/shorts/"]')) {
                const shelf = header.closest('ytd-shelf-renderer');
                if (shelf) hide(shelf);
            }
        });

        // 8. Individual shorts links — ONLY on non-protected pages
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
    // INSTANT AD SKIP (50ms poll)
    // ========================

    let wasMutedByUs = false;

    function skipVideoAd() {
        if (!settings.ytAds) return;

        const player = document.querySelector('.html5-video-player');
        if (!player) return;

        if (player.classList.contains('ad-showing')) {
            const video = player.querySelector('video');
            if (video) {
                if (!video.muted) { video.muted = true; wasMutedByUs = true; }
                if (isFinite(video.duration) && video.duration > 0) {
                    video.currentTime = video.duration;
                }
                if (video.playbackRate !== 16) video.playbackRate = 16;
            }
            const skip = player.querySelector(
                '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, ' +
                '.ytp-skip-ad-button, button[class*="ytp-ad-skip"]'
            );
            if (skip) skip.click();
            const close = player.querySelector('.ytp-ad-overlay-close-button');
            if (close) close.click();
        } else if (wasMutedByUs) {
            const video = player.querySelector('video');
            if (video) { video.muted = false; video.playbackRate = 1; }
            wasMutedByUs = false;
        }
    }

    setInterval(skipVideoAd, 50);

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
        timer = setTimeout(cleanPage, 200);
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
    window.addEventListener('yt-navigate-finish', () => setTimeout(cleanPage, 150));
    setTimeout(cleanPage, 2000);
    setTimeout(cleanPage, 4000);
})();
