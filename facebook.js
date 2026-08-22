// facebook.js — PureFeed v10: Centralized selector dictionary, zero-FOUC & anti-scramble blocker

(function () {
    'use strict';

    // ========================
    // CENTRALIZED SELECTOR MAP
    // ========================

    const SELECTORS = {
        reelsLinks: 'a[href*="/reel/"], a[href*="/reels/"], a[href*="/watch"]',
        navWatchReels: 'a[href*="/watch"], a[href*="/reel"]',
        navContainers: '[role="listitem"], li, [data-visualcompletion]',
        articles: '[role="article"]',
        sponsoredAria: '[aria-label="Sponsored"], [aria-label="Ad"], [aria-label*="Sponsored"]',
        adLinks: 'a[href*="/ads/about/"], a[href*="adchoices"], a[href*="/ad_preferences/"]',
        sponsoredSpans: 'a[role="link"] span, a span[dir="auto"]',
        headerCandidates: 'a span, div > span',
        autoSpans: 'span[dir="auto"]',
        feed: '[role="feed"]',
        rightRail: '[data-pagelet="RightRail"]',
        rightRailNodes: 'span, a, b, strong, div, h3, h4',
        adBeholder: '[data-testid="ad_beholder"]'
    };

    // ========================
    // SETTINGS & SYNCHRONOUS DOM FLAGS
    // ========================

    let settings = { fbReels: true, fbAds: true };

    function applyDOMFlags() {
        const root = document.documentElement || document.body;
        if (!root) return;
        root.setAttribute('data-purefeed-fb-reels', settings.fbReels ? 'true' : 'false');
        root.setAttribute('data-purefeed-fb-ads', settings.fbAds ? 'true' : 'false');
    }

    // Apply default flags immediately (synchronous)
    applyDOMFlags();
    if (!document.documentElement) {
        document.addEventListener('DOMContentLoaded', applyDOMFlags, { once: true });
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ fbReels: true, fbAds: true }, (s) => {
            if (chrome.runtime.lastError) return;
            settings = s;
            applyDOMFlags();
            cleanPage();
        });

        chrome.runtime.onMessage.addListener((msg, sender) => {
            if (sender.id !== chrome.runtime.id) return;
            if (msg.type === 'settingsChanged') {
                if (msg.fbReels !== undefined) settings.fbReels = msg.fbReels;
                if (msg.fbAds !== undefined) settings.fbAds = msg.fbAds;
                applyDOMFlags();
                cleanPage();
            }
        });
    }

    // ========================
    // CORE
    // ========================

    const processed = new WeakSet();
    const scrambleCache = new Map();

    function hide(el) {
        if (!el || processed.has(el)) return;
        processed.add(el);
        el.style.setProperty('display', 'none', 'important');
    }

    function hideClosestFeedChild(el) {
        let p = el.parentElement;
        for (let i = 0; i < 12 && p; i++) {
            if (p.parentElement && p.parentElement.getAttribute('role') === 'feed') {
                hide(p);
                return;
            }
            p = p.parentElement;
        }
    }

    // ========================
    // REELS REMOVAL
    // ========================

    function hideReels() {
        if (!settings.fbReels) return;

        const path = window.location.pathname;
        if (path.startsWith('/reel/') || path.startsWith('/reels') || 
            path === '/watch' || path.startsWith('/watch/') || path.startsWith('/watch?')) {
            window.location.replace('/');
            return;
        }

        document.querySelectorAll(SELECTORS.reelsLinks).forEach(link => {
            const href = link.getAttribute('href') || '';
            if (href.includes('/watch') && href.match(/\/watch[\/?].*v=/)) return;

            const post = link.closest(SELECTORS.articles);
            if (post) { hide(post); return; }
            hideClosestFeedChild(link);
        });

        document.querySelectorAll(SELECTORS.navWatchReels).forEach(link => {
            const href = link.getAttribute('href') || '';
            if (href.match(/\/watch[\/]?$/) || href.match(/\/reel(s|\/)?$/)) {
                const navItem = link.closest(SELECTORS.navContainers);
                if (navItem) {
                    hide(navItem);
                } else {
                    let p = link.parentElement;
                    for (let i = 0; i < 4 && p; i++) {
                        const next = p.parentElement;
                        if (next && (next.getAttribute('role') === 'navigation' || next.getAttribute('role') === 'list')) {
                            hide(p); break;
                        }
                        p = next;
                    }
                }
            }
        });

        // Structural and text fallback
        document.querySelectorAll(SELECTORS.autoSpans).forEach(span => {
            if (processed.has(span)) return;
            const t = span.textContent.trim().toLowerCase();
            if (t.includes('reels') || t.includes('videos for you')) {
                hideClosestFeedChild(span);
            }
        });
    }

    // ========================
    // AD / SPONSORED REMOVAL (STACK SAFE)
    // ========================

    function getVisibleText(el, depth = 0) {
        if (depth > 10 || !el) return '';
        if (!el.children || el.children.length === 0) {
            return (el.textContent || '').replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD]/g, '').trim();
        }
        let text = '';
        for (let i = 0; i < el.childNodes.length; i++) {
            const child = el.childNodes[i];
            if (child.nodeType === Node.TEXT_NODE) {
                text += child.textContent;
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const s = child.style;
                if (s && (
                    s.position === 'absolute' ||
                    s.clip === 'rect(0, 0, 0, 0)' ||
                    s.clipPath === 'inset(50%)' ||
                    s.width === '0px' || s.width === '1px' ||
                    s.height === '0px' || s.height === '1px'
                )) continue;
                if (child.offsetWidth <= 1 || child.offsetHeight <= 1) continue;
                text += getVisibleText(child, depth + 1);
            }
        }
        return text.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD]/g, '').trim();
    }

    const SPONSORED = new Set([
        'Sponsored', 'sponsored', 'SPONSORED',
        'Sponsorisé', 'Gesponsert', 'Patrocinado', 'Sponsorizzato',
        'Sponsorlu', 'Bersponsor', 'Sponsrad', 'Sponset',
        'Được tài trợ', 'Publicidad',
        'スポンサー', '赞助内容', '광고', 'ممول', 'प्रायोजित'
    ]);

    function hasCanvasLabel(el) {
        const canvases = el.querySelectorAll('canvas');
        if (canvases.length < 5 || canvases.length > 14) return false;
        let small = 0;
        for (const c of canvases) {
            if (c.width <= 20 && c.height <= 20) small++;
        }
        return small >= 5;
    }

    function isScrambledSponsored(text) {
        if (!text || text.length < 7 || text.length > 20) return false;
        
        if (scrambleCache.has(text)) {
            return scrambleCache.get(text);
        }

        const clean = text.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD\s]/g, '');
        if (clean.length < 7 || clean.length > 15) {
            scrambleCache.set(text, false);
            return false;
        }

        const sorted = clean.toLowerCase().split('').sort().join('');
        let isMatch = (sorted === 'ddenoorpss');

        if (!isMatch) {
            const targets = ['gesponsert', 'sponsorisé', 'patrocinado'];
            for (const target of targets) {
                if (sorted === target.split('').sort().join('')) {
                    isMatch = true;
                    break;
                }
            }
        }

        // FIFO Cache Eviction (prevents cache thrashing)
        if (scrambleCache.size > 300) {
            const firstKey = scrambleCache.keys().next().value;
            scrambleCache.delete(firstKey);
        }
        scrambleCache.set(text, isMatch);
        return isMatch;
    }

    function isSponsoredElement(el) {
        const text = getVisibleText(el);
        if (SPONSORED.has(text)) return true;
        if (isScrambledSponsored(el.textContent)) return true;
        return false;
    }

    function hideAds() {
        if (!settings.fbAds) return;

        // === FEED ADS ===
        document.querySelectorAll(SELECTORS.articles).forEach(article => {
            if (processed.has(article)) return;

            if (article.querySelector(SELECTORS.sponsoredAria)) {
                hide(article); return;
            }

            if (article.querySelector(SELECTORS.adLinks)) {
                hide(article); return;
            }

            const links = article.querySelectorAll('a');
            for (const link of links) {
                if (link.querySelectorAll('canvas').length >= 5 && hasCanvasLabel(link)) {
                    hide(article); return;
                }
            }

            const spans = article.querySelectorAll(SELECTORS.sponsoredSpans);
            for (const span of spans) {
                if (span.textContent.length > 30) continue;
                if (isSponsoredElement(span)) {
                    hide(article); return;
                }
            }

            const headerCandidates = article.querySelectorAll(SELECTORS.headerCandidates);
            for (const el of headerCandidates) {
                if (el.textContent.length > 25) continue;
                if (el.children.length > 10) continue;
                if (isSponsoredElement(el)) {
                    hide(article); return;
                }
            }

            const autoSpans = article.querySelectorAll(SELECTORS.autoSpans);
            for (const span of autoSpans) {
                if (span.textContent.length > 30) continue;
                const t = span.textContent.trim().toLowerCase();
                if (t.includes('suggested for you')) {
                    hide(article); return;
                }
            }
        });

        // === FEED-LEVEL ===
        const feed = document.querySelector(SELECTORS.feed);
        if (feed) {
            for (const child of feed.children) {
                if (processed.has(child)) continue;
                if (child.querySelector(SELECTORS.sponsoredAria)) {
                    hide(child);
                } else if (hasCanvasLabel(child)) {
                    hide(child);
                }
            }
        }

        // === RIGHT SIDEBAR ===
        const rail = document.querySelector(SELECTORS.rightRail);
        if (rail) {
            const allNodes = rail.querySelectorAll(SELECTORS.rightRailNodes);
            for (const node of allNodes) {
                if (processed.has(node)) continue;
                if (node.textContent.length > 25) continue;

                if (isSponsoredElement(node)) {
                    let container = node;
                    while (container.parentElement && container.parentElement !== rail) {
                        container = container.parentElement;
                    }
                    if (container && container !== rail) {
                        hide(container);
                    }
                    break;
                }
            }

            for (const child of rail.children) {
                if (processed.has(child)) continue;
                if (child.querySelector(SELECTORS.adBeholder) || hasCanvasLabel(child)) {
                    hide(child);
                }
            }
        }

        document.querySelectorAll(SELECTORS.adBeholder).forEach(hide);
    }

    // ========================
    // OBSERVER
    // ========================

    let timer = null;
    let running = false;

    function cleanPage() {
        if (running) return;
        running = true;
        try {
            hideReels();
            hideAds();
        } finally {
            running = false;
        }
    }

    const observer = new MutationObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(cleanPage, 250);
    });

    function start() {
        const target = document.body || document.documentElement;
        if (target) {
            observer.observe(target, { childList: true, subtree: true });
            cleanPage();
        } else {
            setTimeout(start, 50);
        }
    }

    start();
    setTimeout(cleanPage, 2000);
    setTimeout(cleanPage, 5000);
})();
