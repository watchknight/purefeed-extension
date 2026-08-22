// background.js — Service worker: initializes default settings on install

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (existing) => {
    if (chrome.runtime.lastError) {
      console.warn('PureFeed: Storage read error on install', chrome.runtime.lastError);
      return;
    }
    const defaults = {
      ytShorts: true,
      ytAds: true,
      fbReels: true,
      fbAds: true
    };
    // Only set defaults for keys that don't already exist
    const toSet = {};
    for (const [key, val] of Object.entries(defaults)) {
      if (existing[key] === undefined) {
        toSet[key] = val;
      }
    }
    if (Object.keys(toSet).length > 0) {
      chrome.storage.local.set(toSet, () => {
        if (chrome.runtime.lastError) {
          console.warn('PureFeed: Storage write error on install', chrome.runtime.lastError);
        }
      });
    }
  });
});
