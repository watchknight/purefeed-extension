// youtube.js — PureFeed v10 ULTIMATE: Zero-delay instant ad skip & shorts blocker

(function () {
    'use strict';

    // ========================
    // SETTINGS & SYNCHRONOUS DOM FLAGS
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
    // INSTANT ZERO-DELAY AD SKIP ENGINE
    // ========================

    let wasMutedByUs = false;
    let adSkipActive = false;
    let adStartTime = 0;

    const SKIP_SELECTORS = [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        'button[class*="ytp-ad-skip"]',
        '.ytp-ad-skip-button-slot button',
        '.ytp-ad-skip-button-slot .ytp-ad-skip-button-container button'
    ].join(', ');

    function clickAllSkipButtons(player) {
        player.querySelectorAll(SKIP_SELECTORS).forEach(btn => {
            btn.click();
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        player.querySelectorAll(
            '.ytp-ad-overlay-close-button, .ytp-ad-overlay-close-container button'
        ).forEach(btn => btn.click());
    }

    function forceSkipAd() {
        if (!settings.ytAds) return;

        const player = document.querySelector('.html5-video-player');
        if (!player) return;

        const isAdShowing = player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');

        if (isAdShowing) {
            if (!adSkipActive) {
                adSkipActive = true;
                adStartTime = Date.now();
            }

            const video = player.querySelector('video');
            if (video) {
                // 1. Instant Mute (0ms delay)
                if (!video.muted) { video.muted = true; wasMutedByUs = true; }

                // 2. Instant 16x playback speed
                try { video.playbackRate = 16; } catch (e) {}

                // 3. Instant Seek to End (No readyState requirement)
                try {
                    if (isFinite(video.duration) && video.duration > 0) {
                        video.currentTime = Math.max(0, video.duration - 0.05);
                    } else {
                        video.currentTime = 99999;
                    }
                } catch (e) {}

                // 4. Instant synthetic ended event dispatch
                try {
                    video.dispatchEvent(new Event('ended', { bubbles: true }));
                } catch (e) {}
            }

            // 5. Instant Skip Button Clicks
            clickAllSkipButtons(player);

            // 6. Native YouTube Player API skip invocation
            try {
                if (typeof player.skipAd === 'function') player.skipAd();
            } catch (e) {}

            // 7. Safety override: force-remove ad-showing class if player stalls (>300ms)
            const elapsed = Date.now() - adStartTime;
            if (elapsed > 300) {
                player.classList.remove('ad-showing');
                player.classList.remove('ad-interrupting');
                if (video && video.paused) {
                    video.play().catch(() => {});
                }
            }

        } else if (adSkipActive || wasMutedByUs) {
            // Ad completed — restore user volume and playback state instantly
            const video = player.querySelector('video');
            if (video) {
                if (wasMutedByUs) { video.muted = false; wasMutedByUs = false; }
                try { video.playbackRate = 1; } catch (e) {}
                if (video.paused) {
                    video.play().catch(() => {});
                }
            }
            adSkipActive = false;
            adStartTime = 0;
        }
    }

    // High-frequency rAF loop for sub-millisecond execution
    let rafId = null;
    function startAdSkipRAF() {
        if (rafId !== null) return;
        function loop() {
            forceSkipAd();
            if (adSkipActive) {
                rafId = requestAnimationFrame(loop);
            } else {
                rafId = null;
            }
        }
        rafId = requestAnimationFrame(loop);
    }

    // Continuous 25ms monitor to catch ads instantly as they load
    setInterval(forceSkipAd, 25);

    function watchPlayerClassChanges() {
        const player = document.querySelector('.html5-video-player');
        if (!player) {
            setTimeout(watchPlayerClassChanges, 100);
            return;
        }

        forceSkipAd();

        const classObserver = new MutationObserver((mutations) => {
            if (!settings.ytAds) return;
            for (const m of mutations) {
                if (m.attributeName === 'class' && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
                    forceSkipAd();
                    startAdSkipRAF();
                    break;
                }
            }
        });
        classObserver.observe(player, { attributes: true, attributeFilter: ['class'] });

        let currentVideo = player.querySelector('video');
        
        function attachVideoListeners(v) {
            if (!v) return;
            const handler = () => {
                forceSkipAd();
                startAdSkipRAF();
            };
            v.addEventListener('timeupdate', handler);
            v.addEventListener('waiting', handler);
            v.addEventListener('stalled', handler);
            v.addEventListener('error', handler);
            v.addEventListener('loadstart', handler);
        }
        attachVideoListeners(currentVideo);
        
        const childObserver = new MutationObserver(() => {
            const newVideo = player.querySelector('video');
            if (newVideo && newVideo !== currentVideo) {
                currentVideo = newVideo;
                attachVideoListeners(currentVideo);
            }
        });
        childObserver.observe(player, { childList: true, subtree: true });
    }
    
    watchPlayerClassChanges();

    // Observe document body for player insertion early in page lifecycle
    const rootObserver = new MutationObserver(() => {
        if (document.querySelector('.html5-video-player')) {
            forceSkipAd();
        }
    });
    if (document.documentElement) {
        rootObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

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
