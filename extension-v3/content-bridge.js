'use strict';
// Calendar Bridge v3 — content-bridge.js (ISOLATED world)
// Relay: postMessage dalla pagina → chrome.runtime → background.js

// Invia subito al MAIN world la modalità debug salvata
chrome.storage.local.get(['v3_debugMode'], function(r) {
  window.postMessage({ type: '__CAL_DEBUG_MODE__', show: !!r.v3_debugMode }, '*');
});

// Riceve dal background la nuova modalità debug e la relaya alla pagina
chrome.runtime.onMessage.addListener(function(msg) {
  if (msg.type === 'V3_DEBUG_MODE') {
    window.postMessage({ type: '__CAL_DEBUG_MODE__', show: !!msg.show }, '*');
  }
});

window.addEventListener('message', function(e) {
  if (e.source !== window || !e.data) return;

  if (e.data.type === '__CAL_V2_EVENTS__') {
    chrome.runtime.sendMessage({
      type: 'CAL_V2_EVENTS',
      events: e.data.events,
      ts: e.data.ts,
    });
    return;
  }

  if (e.data.type === '__CAL_V2_GET_ERROR__') {
    chrome.runtime.sendMessage({ type: 'CAL_V2_GET_ERROR', ts: e.data.ts, reason: e.data.reason });
    return;
  }

  if (e.data.type === '__CAL_V2_GET_IDLE__') {
    chrome.runtime.sendMessage({ type: 'CAL_V2_GET_IDLE' });
    return;
  }

  if (e.data.type === '__CAL_V2_ENRICH__') {
    chrome.runtime.sendMessage({
      type: 'CAL_V2_ENRICH',
      id: e.data.id,
      onlineMeetingUrl: e.data.onlineMeetingUrl,
    });
  }

  if (e.data.type === '__CAL_V2_LOG__') {
    chrome.runtime.sendMessage({ type: 'CAL_V2_LOG', msg: e.data.msg });
  }
});
