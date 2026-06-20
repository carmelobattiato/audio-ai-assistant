'use strict';
/**
 * Runs in ISOLATED world (default) — has full access to chrome.runtime.
 * Receives messages from the MAIN world content script (content-outlook.js)
 * via window.postMessage and forwards them to the background service worker.
 */
window.addEventListener('message', function (event) {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.type !== '__CAL_BRIDGE__') return;
  if (!Array.isArray(msg.appointments)) return;
  chrome.runtime.sendMessage({ type: 'CALENDAR_SYNC', appointments: msg.appointments });
});
