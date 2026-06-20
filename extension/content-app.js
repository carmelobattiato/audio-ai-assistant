'use strict';
// Runs on the app tab (localhost / 127.0.0.1).
// Bridges BroadcastChannel sync requests → background service worker.
var bc = new BroadcastChannel('calendar-sync-v1');
bc.onmessage = function (e) {
  if (e.data && e.data.type === 'request-sync') {
    chrome.runtime.sendMessage({ type: 'TRIGGER_RESYNC' });
  }
};
