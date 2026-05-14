// background.js — Service worker: initializes default settings on install

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (existing) => {
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
      chrome.storage.local.set(toSet);
    }
  });
});
