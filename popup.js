// popup.js — Handles toggle state persistence and real-time updates

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
    document.getElementById(id).checked = settings[key];
  }
});

// Listen for toggle changes
for (const [id, key] of Object.entries(TOGGLES)) {
  document.getElementById(id).addEventListener('change', (e) => {
    const update = { [key]: e.target.checked };
    chrome.storage.local.set(update);

    // Notify active tab immediately so the content script can react
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'settingsChanged', ...update }).catch(() => {});
      }
    });
  });
}
