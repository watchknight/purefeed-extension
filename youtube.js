// youtube.js — PureFeed v9 AUDITED: Zero-FOUC, locale-resilient, safe MV3 ad & shorts blocker

(function () {
    'use strict';

    // ========================
    // SETTINGS & SYNCHRONOUS DOM FLAGS
    // ========================

    let settings = { ytShorts: true, ytAds: true };

    // Synchronous immediate flag setting at document_start to prevent FOUC / flickering
    function applyDOMFlags() {
        const root = document.documentElement || document.body;
        if (!root) return;
        root.setAttribute('data-purefeed-yt-shorts', settings.ytShorts ? 'true' : 'false');
        root.setAttribute('data-purefeed-yt-ads', settings.ytAds ? 'true' : 'false');
    }

    // Apply default flags immediately (synchronous)
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
            // Security audit fix: Validate message sender ID
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
    // SHORTS REMOVAL (LOCALE RESILIENT)
    // ========================

    function removeShorts() {
        if (!settings.ytShorts) return;

        // 1. Sidebar — structural selection via href
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

        // 5. Shorts filter chip — structural selection via href or path
        document.querySelectorAll('yt-chip-cloud-chip-renderer').forEach(chip => {
            if (processed.has(chip)) return;
            if (chip.querySelector('a[href*="/shorts"], [path*="shorts"]')) {
                hide(chip);
            }
        });

        // 6. Channel page Shorts tab — structural selection via endpoint/href
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
    // INSTANT AD SKIP — Zero-delay system with readyState checks
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

        const isAdShowing = player.classList.contains('ad-showing');

        if (isAdShowing) {
            if (!adSkipActive) {
                adSkipActive = true;
                adStartTime = Date.now();
            }

            const video = player.querySelector('video');
            if (video && video.readyState >= 1) { // Robustness audit fix: check readyState >= HAVE_METADATA
                if (!video.muted) { video.muted = true; wasMutedByUs = true; }

                try { video.playbackRate = 16; } catch (e) {}

                if (isFinite(video.duration) && video.duration > 0) {
                    video.currentTime = Math.max(0, video.duration - 0.1);
                }

                const elapsed = Date.now() - adStartTime;
                if (elapsed > 500 && (video.readyState < 2 || video.paused)) {
                    if (isFinite(video.duration) && video.duration > 0) {
                        video.currentTime = video.duration;
                    }
                    video.dispatchEvent(new Event('ended'));
                }

                if (elapsed > 2000) {
                    const adContainers = player.querySelectorAll(
                        '.video-ads, .ytp-ad-module, .ytp-ad-player-overlay, ' +
                        '.ytp-ad-action-interstitial'
                    );
                    adContainers.forEach(c => c.style.setProperty('display', 'none', 'important'));
                }
            }

            clickAllSkipButtons(player);

        } else if (adSkipActive || wasMutedByUs) {
            const video = player.querySelector('video');
            if (video) {
                if (wasMutedByUs) { video.muted = false; wasMutedByUs = false; }
                try { video.playbackRate = 1; } catch (e) {}
                if (video.paused && video.readyState >= 2) {
                    video.play().catch(() => {});
                }
            }
            adSkipActive = false;
            adStartTime = 0;
        }
    }

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

    setInterval(() => {
        if (adSkipActive) {
            forceSkipAd();
            startAdSkipRAF();
        }
    }, 150);

    function watchPlayerClassChanges() {
        const player = document.querySelector('.html5-video-player');
        if (!player) { setTimeout(watchPlayerClassChanges, 500); return; }

        const classObserver = new MutationObserver((mutations) => {
            if (!settings.ytAds) return;
            for (const m of mutations) {
                if (m.attributeName === 'class' && player.classList.contains('ad-showing')) {
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
                if (player.classList.contains('ad-showing')) startAdSkipRAF();
            };
            v.addEventListener('waiting', handler);
            v.addEventListener('stalled', handler);
            v.addEventListener('error', handler);
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
