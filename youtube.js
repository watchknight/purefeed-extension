// youtube.js — PureFeed v18: Centralized selector dictionary & robust DOM cleanup

(function () {
    'use strict';

    // ========================
    // CENTRALIZED SELECTOR MAP
    // ========================

    const SELECTORS = {
        guideShorts: 'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer',
        reelShelf: 'ytd-reel-shelf-renderer',
        richSection: 'ytd-rich-section-renderer',
        richShelfShorts: 'ytd-rich-shelf-renderer[is-shorts]',
        viewModelShorts: '[class*="shortsLockupViewModelHost"]',
        shelfRenderer: 'ytd-shelf-renderer',
        chipCloud: 'yt-chip-cloud-chip-renderer',
        tabShape: 'yt-tab-shape',
        shelfHeader: 'yt-shelf-header-layout',
        individualShortsLinks: 'a[href*="/shorts/"]',
        shortsContainers: 'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-notification-renderer',
        adElements: [
            'ytd-ad-slot-renderer',
            'ytd-in-feed-ad-layout-renderer',
            'ytd-promoted-sparkles-web-renderer',
            'ytd-promoted-video-renderer',
            'ytd-display-ad-renderer',
            'ytd-banner-promo-renderer',
            'ytd-search-pyv-renderer',
            'ytd-compact-promoted-video-renderer',
            'ytd-companion-slot-renderer',
            'ytd-action-companion-ad-renderer',
            'ytd-mealbar-promo-renderer',
            '#masthead-ad',
            '#player-ads'
        ].join(', '),
        adBadges: 'ad-badge-view-model, feed-ad-metadata-view-model',
        adBadgeContainers: 'ytd-video-renderer, ytd-rich-item-renderer'
    };

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
        document.querySelectorAll(SELECTORS.guideShorts).forEach(el => {
            if (processed.has(el)) return;
            if (el.querySelector('a[href*="/shorts"]')) {
                hide(el);
            }
        });

        // 2. Reel shelf tags
        document.querySelectorAll(SELECTORS.reelShelf).forEach(shelf => {
            const parent = shelf.closest(SELECTORS.richSection);
            hide(parent || shelf);
        });

        // 3. Rich shelf with is-shorts attribute
        document.querySelectorAll(SELECTORS.richShelfShorts).forEach(shelf => {
            hide(shelf.closest(SELECTORS.richSection) || shelf);
        });

        // 4. View-model shorts elements
        document.querySelectorAll(SELECTORS.viewModelShorts).forEach(el => {
            const shelf = el.closest(SELECTORS.shelfRenderer + ', ' + SELECTORS.richSection);
            if (shelf) {
                hide(shelf);
            } else {
                hide(el);
            }
        });

        // 5. Shorts filter chip
        document.querySelectorAll(SELECTORS.chipCloud).forEach(chip => {
            if (processed.has(chip)) return;
            if (chip.querySelector('a[href*="/shorts"], [path*="shorts"]')) {
                hide(chip);
            }
        });

        // 6. Channel page Shorts tab
        document.querySelectorAll(SELECTORS.tabShape).forEach(tab => {
            if (processed.has(tab)) return;
            if (tab.querySelector('a[href*="/shorts"]') || (tab.getAttribute('tab-title') || '').toLowerCase().includes('shorts')) {
                hide(tab);
            }
        });

        // 7. Shelf headers with shorts links
        document.querySelectorAll(SELECTORS.shelfHeader).forEach(header => {
            if (processed.has(header)) return;
            if (header.querySelector('a[href*="/shorts"]')) {
                const shelf = header.closest(SELECTORS.shelfRenderer);
                if (shelf) hide(shelf);
            }
        });

        // 8. Individual shorts links — non-protected pages
        if (!isProtectedPage()) {
            document.querySelectorAll(SELECTORS.individualShortsLinks).forEach(link => {
                const c = link.closest(SELECTORS.shortsContainers);
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

        document.querySelectorAll(SELECTORS.adElements).forEach(hide);

        document.querySelectorAll(SELECTORS.adBadges).forEach(el => {
            hide(el.closest(SELECTORS.adBadgeContainers) || el);
        });
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
