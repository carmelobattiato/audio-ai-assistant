'use strict';
// Audio AI Assistance Plugin — content-bridge.js (ISOLATED world)
// Relay: postMessage dalla pagina → chrome.runtime → background.js

// Re-iniettato on-demand dal background: senza questa guardia ogni iniezione
// aggiungerebbe un listener in più, duplicando i messaggi.
if (!window.__aai_v4_bridge_loaded) {
window.__aai_v4_bridge_loaded = true;

// Invia subito al MAIN world la modalità debug salvata
chrome.storage.local.get(['v4_debugMode'], function(r) {
  window.postMessage({ type: '__AAI_V4_DEBUG_MODE__', show: !!r.v4_debugMode }, '*');
});

// Riceve dal background la nuova modalità debug e la relaya alla pagina
chrome.runtime.onMessage.addListener(function(msg) {
  if (msg.type === 'AAI_V4_DEBUG_MODE') {
    window.postMessage({ type: '__AAI_V4_DEBUG_MODE__', show: !!msg.show }, '*');
  }
});

window.addEventListener('message', function(e) {
  if (e.source !== window || !e.data) return;

  if (e.data.type === '__AAI_V4_EVENTS__') {
    chrome.runtime.sendMessage({
      type: 'AAI_V4_EVENTS',
      events: e.data.events,
      ts: e.data.ts,
    });
    return;
  }

  if (e.data.type === '__AAI_V4_GET_ERROR__') {
    chrome.runtime.sendMessage({ type: 'AAI_V4_GET_ERROR', ts: e.data.ts, reason: e.data.reason });
    return;
  }

  if (e.data.type === '__AAI_V4_GET_IDLE__') {
    chrome.runtime.sendMessage({ type: 'AAI_V4_GET_IDLE' });
    return;
  }

  if (e.data.type === '__AAI_V4_ENRICH__') {
    chrome.runtime.sendMessage({
      type: 'AAI_V4_ENRICH',
      id: e.data.id,
      onlineMeetingUrl: e.data.onlineMeetingUrl,
    });
  }

  if (e.data.type === '__AAI_V4_AUTH__') {
    chrome.runtime.sendMessage({
      type: 'AAI_V4_AUTH', header: e.data.header, origin: e.data.origin,
    });
    return;
  }

  if (e.data.type === '__AAI_V4_LOG__') {
    chrome.runtime.sendMessage({ type: 'AAI_V4_LOG', msg: e.data.msg });
  }
});

} // end guard __aai_v4_bridge_loaded
