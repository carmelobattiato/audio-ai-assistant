'use strict';

const RESYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 min

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCountdown(ts) {
  if (!ts) return '—';
  const elapsed  = Date.now() - ts;
  const remaining = Math.max(0, RESYNC_INTERVAL_MS - elapsed);
  if (remaining === 0) return 'prossimo sync…';
  const secs = Math.floor(remaining / 1000);
  const mm   = Math.floor(secs / 60);
  const ss   = secs % 60;
  return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

function setDot(id, on, blue) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = on ? (blue ? 'dot-ok' : 'dot-on') : 'dot-off';
}

function setBadge(id, cls, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'badge ' + cls;
  el.textContent = text;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = (val == null) ? '—' : String(val);
}

// ── Status render ─────────────────────────────────────────────────────────────

function renderStatus(s) {
  const outlookOk = s.outlookSeenAt && (Date.now() - s.outlookSeenAt < 3 * 60 * 60 * 1000);
  setDot('dotOutlook', outlookOk, false);
  setBadge('badgeOutlook',
    outlookOk ? 'badge badge-green' : 'badge badge-gray',
    outlookOk ? '● Connesso' : 'Non rilevato');
  setText('outlookCount',  s.outlookCount ? s.outlookCount + ' riunioni' : '—');
  setText('outlookSeenAt', fmtCountdown(s.outlookSeenAt));

  const appOk = s.appSeenAt && (Date.now() - s.appSeenAt < 90 * 1000);
  setDot('dotApp', appOk, true);
  setBadge('badgeApp',
    appOk ? 'badge badge-blue' : 'badge badge-gray',
    appOk ? '● Rilevata' : 'Non trovata');
  setText('syncedCount',  s.syncedCount ? s.syncedCount + ' riunioni' : '—');
  setText('syncedAt',     fmtCountdown(s.syncedAt));
}

// ── Main ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  var syncBtn          = document.getElementById('syncBtn');
  var reloadOutlookBtn = document.getElementById('reloadOutlookBtn');
  var appUrlInput      = document.getElementById('appUrl');
  var savedIcon        = document.getElementById('savedIcon');
  var saveTimer        = null;

  // Load initial state
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, function (s) {
    if (!s) return;
    renderStatus(s);
    if (s.appUrl) appUrlInput.value = s.appUrl;
  });

  // Refresh status every 2s while popup is open (also updates countdowns)
  var refreshInterval = setInterval(function () {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, function (s) {
      if (s) renderStatus(s);
    });
  }, 2000);

  window.addEventListener('unload', function () { clearInterval(refreshInterval); });

  // Sync now — trigger a real re-fetch from Outlook then also re-broadcast cache
  syncBtn.addEventListener('click', function () {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Sincronizzazione…';
    console.log('[CAL-BRIDGE popup] 🔄 Sincronizza ora premuto — invio TRIGGER_RESYNC');

    // 1. Trigger a fresh fetch from the Outlook content script
    chrome.runtime.sendMessage({ type: 'TRIGGER_RESYNC' }, function (r) {
      console.log('[CAL-BRIDGE popup] TRIGGER_RESYNC risposta:', r);
    });

    // 2. Also immediately re-broadcast cached data so the app tab refreshes now
    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, function (r) {
      console.log('[CAL-BRIDGE popup] SYNC_NOW risposta:', r);
      syncBtn.disabled = false;
      syncBtn.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">'
        + '<path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/>'
        + '</svg> Sincronizza ora';
      chrome.runtime.sendMessage({ type: 'GET_STATUS' }, function (s) {
        if (s) renderStatus(s);
      });
    });
  });

  // Reload Outlook tab
  reloadOutlookBtn.addEventListener('click', function () {
    reloadOutlookBtn.disabled = true;
    console.log('[CAL-BRIDGE popup] 🔄 Ricarica Outlook tab');
    chrome.runtime.sendMessage({ type: 'RELOAD_OUTLOOK' }, function () {
      setTimeout(function () { reloadOutlookBtn.disabled = false; }, 3000);
    });
  });

  // Auto-save URL on input (debounced 600ms)
  appUrlInput.addEventListener('input', function () {
    clearTimeout(saveTimer);
    savedIcon.classList.remove('show');
    saveTimer = setTimeout(function () {
      var url = appUrlInput.value.trim();
      chrome.runtime.sendMessage({ type: 'SAVE_APP_URL', url: url }, function () {
        savedIcon.style.color = '#10b981';
        savedIcon.classList.add('show');
        setTimeout(function () { savedIcon.classList.remove('show'); }, 1500);
      });
    }, 600);
  });
});
