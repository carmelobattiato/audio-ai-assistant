'use strict';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(ts) {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5)  return 'adesso';
  if (diff < 60) return diff + 's fa';
  if (diff < 3600) return Math.floor(diff / 60) + 'min fa';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
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
  setText('outlookSeenAt', fmtTime(s.outlookSeenAt));

  const appOk = s.appSeenAt && (Date.now() - s.appSeenAt < 90 * 1000);
  setDot('dotApp', appOk, true);
  setBadge('badgeApp',
    appOk ? 'badge badge-blue' : 'badge badge-gray',
    appOk ? '● Rilevata' : 'Non trovata');
  setText('syncedCount',  s.syncedCount ? s.syncedCount + ' riunioni' : '—');
  setText('syncedAt',     fmtTime(s.syncedAt));
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

  // Refresh status every 2s while popup is open
  var refreshInterval = setInterval(function () {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, function (s) {
      if (s) renderStatus(s);
    });
  }, 2000);

  window.addEventListener('unload', function () { clearInterval(refreshInterval); });

  // Sync now
  syncBtn.addEventListener('click', function () {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Sincronizzazione…';
    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, function () {
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
