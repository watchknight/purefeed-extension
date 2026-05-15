// facebook.js — PureFeed v7 FINAL: Anti-scramble sponsored detection

(function () {
    'use strict';

    // ========================
    // SETTINGS
    // ========================

    let settings = { fbReels: true, fbAds: true };

    if (chrome.storage) {
        chrome.storage.local.get({ fbReels: true, fbAds: true }, (s) => {
            settings = s;
        });
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.type === 'settingsChanged') {
                if (msg.fbReels !== undefined) settings.fbReels = msg.fbReels;
                if (msg.fbAds !== undefined) settings.fbAds = msg.fbAds;
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

        // --- Redirect from reel/reels/watch pages ---
        const path = window.location.pathname;
        if (path.startsWith('/reel/') || path.startsWith('/reels') || 
            path === '/watch' || path.startsWith('/watch/') || path.startsWith('/watch?')) {
            window.location.replace('/');
            return; // No point processing further, we're redirecting
        }

        // --- Hide reel/watch links in feed ---
        document.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"], a[href*="/watch"]').forEach(link => {
            const href = link.getAttribute('href') || '';
            // Allow through specific videos but block watch feed pages
            if (href.includes('/watch') && href.match(/\/watch[\/?].*v=/)) return;

            const post = link.closest('[role="article"]');
            if (post) { hide(post); return; }
            hideClosestFeedChild(link);
        });

        // --- Hide "Reels" / "Watch" sidebar navigation links ---
        document.querySelectorAll('a[href*="/watch"], a[href*="/reel"]').forEach(link => {
            const href = link.getAttribute('href') || '';
            // Only target the main /watch or /watch/ navigation links
            if (href.match(/\/watch[\/]?$/) || href.match(/\/reel(s|\/)?$/)) {
                // Walk up to find the navigation item container
                const navItem = link.closest('[role="listitem"], li, [data-visualcompletion]');
                if (navItem) {
                    hide(navItem);
                } else {
                    // Fallback: hide up to 4 levels
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

        // --- Hide "Reels and short videos" sections in feed ---
        document.querySelectorAll('span[dir="auto"]').forEach(span => {
            if (processed.has(span)) return;
            const t = span.textContent.trim();
            if (t === 'Reels and short videos' || t === 'Reels' || t === 'Reels and Short Videos' ||
                t === 'Watch' || t === 'Videos for you') {
                hideClosestFeedChild(span);
            }
        });
    }

    // ========================
    // AD / SPONSORED REMOVAL
    // ========================

    // --- Visible text extraction (no getComputedStyle) ---
    function getVisibleText(el) {
        if (!el.children || el.children.length === 0) {
            return el.textContent.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD]/g, '').trim();
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
                text += getVisibleText(child);
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

    // --- Canvas detection ---
    function hasCanvasLabel(el) {
        const canvases = el.querySelectorAll('canvas');
        if (canvases.length < 5 || canvases.length > 14) return false;
        let small = 0;
        for (const c of canvases) {
            if (c.width <= 20 && c.height <= 20) small++;
        }
        return small >= 5;
    }

    // --- Character-scramble detection ---
    // Facebook scrambles "Sponsored" letters into random order in DOM,
    // using CSS to visually rearrange them (e.g. "ndstpoeorS").
    // We detect this by checking if a small element's text contains
    // EXACTLY the right letters to spell "Sponsored" when sorted.
    function isScrambledSponsored(text) {
        if (text.length < 7 || text.length > 20) return false;
        // Strip zero-width and non-letter characters
        const clean = text.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD\s]/g, '');
        if (clean.length < 7 || clean.length > 15) return false;

        // Check if sorted letters match "Sponsored" (case-insensitive)
        const sorted = clean.toLowerCase().split('').sort().join('');
        // "sponsored" sorted = "ddenoorpss"
        if (sorted === 'ddenoorpss') return true;

        // Also check other languages
        const targets = [
            'gesponsert',  // German
            'sponsorisé',  // French
            'patrocinado', // Spanish/Portuguese
        ];
        for (const target of targets) {
            if (sorted === target.split('').sort().join('')) return true;
        }
        return false;
    }

    // --- Comprehensive sponsored check for an element ---
    function isSponsoredElement(el) {
        // Quick text checks
        const text = getVisibleText(el);
        if (SPONSORED.has(text)) return true;

        // Scramble detection
        if (isScrambledSponsored(el.textContent)) return true;

        return false;
    }

    function hideAds() {
        if (!settings.fbAds) return;

        // === FEED ADS ===
        document.querySelectorAll('[role="article"]').forEach(article => {
            if (processed.has(article)) return;

            // 1. aria-label
            if (article.querySelector('[aria-label="Sponsored"], [aria-label="Ad"]')) {
                hide(article); return;
            }

            // 2. Ad transparency links
            if (article.querySelector('a[href*="/ads/about/"], a[href*="adchoices"], a[href*="/ad_preferences/"]')) {
                hide(article); return;
            }

            // 3. Canvas-rendered labels
            const links = article.querySelectorAll('a');
            for (const link of links) {
                if (link.querySelectorAll('canvas').length >= 5 && hasCanvasLabel(link)) {
                    hide(article); return;
                }
            }

            // 4. Text + scramble detection on link spans
            const spans = article.querySelectorAll('a[role="link"] span, a span[dir="auto"]');
            for (const span of spans) {
                if (span.textContent.length > 30) continue;
                if (isSponsoredElement(span)) {
                    hide(article); return;
                }
            }

            // 5. Deep scan — check ALL small text elements in the header area
            const headerCandidates = article.querySelectorAll('a span, div > span');
            for (const el of headerCandidates) {
                if (el.textContent.length > 25) continue;
                if (el.children.length > 10) continue;
                if (isSponsoredElement(el)) {
                    hide(article); return;
                }
            }

            // 6. "Suggested for you"
            const autoSpans = article.querySelectorAll('span[dir="auto"]');
            for (const span of autoSpans) {
                if (span.textContent.length > 30) continue;
                if (span.textContent.trim() === 'Suggested for you') {
                    hide(article); return;
                }
            }
        });

        // === FEED-LEVEL ===
        const feed = document.querySelector('[role="feed"]');
        if (feed) {
            for (const child of feed.children) {
                if (processed.has(child)) continue;
                if (child.querySelector('[aria-label="Sponsored"]')) {
                    hide(child);
                } else if (hasCanvasLabel(child)) {
                    hide(child);
                }
            }
        }

        // === RIGHT SIDEBAR ===
        const rail = document.querySelector('[data-pagelet="RightRail"]');
        if (rail) {
            const allNodes = rail.querySelectorAll('span, a, b, strong, div, h3, h4');
            for (const node of allNodes) {
                if (processed.has(node)) continue;
                if (node.textContent.length > 25) continue;

                if (isSponsoredElement(node)) {
                    // Walk up to hide the rail's direct child
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

            // Canvas + data-testid in sidebar
            for (const child of rail.children) {
                if (processed.has(child)) continue;
                if (child.querySelector('[data-testid="ad_beholder"]') || hasCanvasLabel(child)) {
                    hide(child);
                }
            }
        }

        // Global catch
        document.querySelectorAll('[data-testid="ad_beholder"]').forEach(hide);
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
