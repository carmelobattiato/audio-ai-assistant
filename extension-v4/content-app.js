'use strict';
// Audio AI Assistance Plugin — content-app.js (ISOLATED world, tab dell'app)
// La pagina non può parlare col service worker: questo relay traduce una
// postMessage della pagina in chrome.runtime.sendMessage e restituisce l'esito.

if (!window.__aai_v4_app_relay_loaded) {
window.__aai_v4_app_relay_loaded = true;

var REQUEST = '__AAI_V4_APP_SYNC_REQUEST__';
var RESULT  = '__AAI_V4_APP_SYNC_RESULT__';
var PRESENT = '__AAI_V4_APP_PRESENT__';
var STALE_MSG = 'The plugin was updated after this page loaded: reload this page (F5)';

window.addEventListener('message', function (e) {
  if (e.source !== window || !e.data || e.data.type !== REQUEST) return;

  var reason = String(e.data.reason || 'richiesta dal Calendar v4').slice(0, 60);
  // Dopo un aggiornamento dell'estensione la pagina conserva lo script vecchio,
  // il cui contesto è invalidato: sendMessage lancia invece di rispondere. Senza
  // questo catch la pagina non riceveva alcun esito e andava in timeout.
  try {
    chrome.runtime.sendMessage({ type: 'AAI_V4_SYNC_NOW', reason: reason }, function (res) {
      // Il service worker può essere stato terminato: lastError va letto per
      // evitare l'unchecked-error warning e va riportato alla pagina.
      var err = chrome.runtime.lastError;
      window.postMessage({
        type: RESULT,
        ok: !err && !!(res && res.ok),
        error: err ? err.message : (res && res.ok ? null : 'The plugin could not sync'),
      }, '*');
    });
  } catch (err) {
    window.postMessage({ type: RESULT, ok: false, error: STALE_MSG }, '*');
  }
});

// L'app usa questo per distinguere "plugin assente" da "plugin installato ma
// non ancora sincronizzato".
window.postMessage({ type: PRESENT }, '*');

}
