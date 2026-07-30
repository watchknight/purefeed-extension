// popup.js — Handles toggle state persistence and multi-tab real-time updates

const DEFAULTS = {
  ytShorts: true,
  ytAds: true,
  fbReels: true,
  fbAds: true
};

const TOGGLES = {
  'yt-shorts': 'ytShorts',
  'yt-ads': 'ytAds',
  'fb-reels': 'fbReels',
  'fb-ads': 'fbAds'
};

// Load saved state
chrome.storage.local.get(DEFAULTS, (settings) => {
  for (const [id, key] of Object.entries(TOGGLES)) {
    const el = document.getElementById(id);
    if (el) el.checked = settings[key];
  }
});

// Listen for toggle changes
for (const [id, key] of Object.entries(TOGGLES)) {
  const el = document.getElementById(id);
  if (!el) continue;
  
  el.addEventListener('change', (e) => {
    const update = { [key]: e.target.checked };
    chrome.storage.local.set(update);

    // Broadcast settings update to ALL open YouTube and Facebook tabs immediately
    chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://*.facebook.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'settingsChanged', ...update }).catch(() => {});
        });
      }
    });
  });
}
