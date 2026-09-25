'use strict';
// Audio AI Assistance Plugin — popup.js

var DEFAULT_OUTLOOK_URL = 'https://outlook.cloud.microsoft/calendar/view/workweek';
var ALT_OUTLOOK_URL     = 'https://outlook.live.com/calendar/';
var ALARM = 'v4_resync';

var _events   = [];
var _log      = [];
var _jsonOpen = false;
var _advOpen  = false;
var _logOpen  = false;

function el(id) { return document.getElementById(id); }

function fmtTime(ts) {
  if (!ts) return '—';
  var d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':'
       + String(d.getMinutes()).padStart(2, '0') + ':'
       + String(d.getSeconds()).padStart(2, '0');
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showSaved(node) {
  node.classList.add('show');
  setTimeout(function() { node.classList.remove('show'); }, 1200);
}

// ── Render ────────────────────────────────────────────────────────────────────

var STATE_LABEL = { ok: 'OK', error: 'Errore', fetching: 'Sync in corso', idle: 'In attesa' };

function render(s) {
  _events = s.events || [];
  _log    = s.log || [];

  // Connesso a
  var host = '';
  try { if (s.connectedUrl) host = new URL(s.connectedUrl).hostname; } catch (e) {}
  var badge = el('connectedUrl');
  badge.textContent = host || 'non connesso';
  badge.className = host ? 'badge' : 'badge none';

  // Stato
  var state = s.getState || 'idle';
  el('statusDot').className = 'dot ' + state;
  el('statusText').className = 'state-text ' + state;
  el('statusText').textContent = STATE_LABEL[state] || state;

  var errBox = el('errorBox');
  if (state === 'error' && s.getError) {
    errBox.textContent = s.getError;
    errBox.classList.remove('hidden');
  } else {
    errBox.classList.add('hidden');
  }

  el('lastSync').textContent = fmtTime(s.seenAt);

  // Conteggi
  var now = Date.now();
  var past = 0, future = 0;
  _events.forEach(function(e) {
    var t = e.start ? new Date(e.start).getTime() : 0;
    if (!t) return;
    if (t < now) past++; else future++;
  });
  el('countMain').textContent = _events.length > 0 ? String(_events.length) : '—';
  el('countSub').textContent = _events.length === 1 ? 'appuntamento caricato' : 'appuntamenti caricati';
  el('countPast').textContent = _events.length > 0 ? String(past) : '—';
  el('countFuture').textContent = _events.length > 0 ? String(future) : '—';

  el('downloadBtn').disabled = _events.length === 0;
  el('syncBtn').disabled = state === 'fetching';

  // Avanzate
  var target = s.outlookUrl || DEFAULT_OUTLOOK_URL;
  el('optCloud').checked = target !== ALT_OUTLOOK_URL;
  el('optLive').checked  = target === ALT_OUTLOOK_URL;
  if (document.activeElement !== el('intervalInput')) {
    el('intervalInput').value = s.interval || 1;
  }
  el('debugModeToggle').checked = !!s.debugMode;

  if (_advOpen) renderEvents();
  if (_logOpen) renderLog();
}

function renderEvents() {
  var list = el('evtList');
  if (!_events.length) {
    list.innerHTML = '<div class="evt-empty">nessun evento</div>';
  } else {
    var sorted = _events.slice().sort(function(a, b) {
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });
    list.innerHTML = sorted.map(function(e) {
      var d = new Date(e.start);
      var when = isNaN(d.getTime()) ? '—'
        : String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
          + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      return '<div class="evt"><span class="evt-time">' + when + '</span>'
           + '<span class="evt-subj">' + escHtml(e.subject) + '</span></div>';
    }).join('');
  }
  if (_jsonOpen) el('jsonArea').value = JSON.stringify(_events, null, 2);
}

function renderLog() {
  var panel = el('logPanel');
  if (!_log.length) {
    panel.innerHTML = '<div class="log-empty">nessuna voce</div>';
    return;
  }
  panel.innerHTML = _log.map(function(e) {
    return '<div class="log-entry">'
      + '<span class="log-ts">' + fmtTime(e.ts) + '</span>'
      + '<span class="log-ev">' + escHtml(e.event) + '</span>'
      + '<span class="log-detail">' + escHtml(e.detail) + '</span>'
      + '</div>';
  }).join('');
  panel.scrollTop = panel.scrollHeight;
}

// Il countdown viene dall'alarm reale, non da lastSync: resta corretto anche
// quando il service worker è stato sospeso.
function renderCountdown() {
  chrome.alarms.get(ALARM, function(alarm) {
    if (!alarm) { el('nextSync').textContent = '—'; return; }
    var secs = Math.max(0, Math.round((alarm.scheduledTime - Date.now()) / 1000));
    el('nextSync').textContent = secs > 0 ? 'tra ' + secs + 's' : 'in corso…';
  });
}

// ── Data ──────────────────────────────────────────────────────────────────────

function refresh() {
  chrome.runtime.sendMessage({ type: 'AAI_V4_GET_STATUS' }, function(s) {
    if (chrome.runtime.lastError || !s) return;
    render(s);
  });
  renderCountdown();
}

function logToText() {
  return _log.map(function(e) {
    return '[' + new Date(e.ts).toISOString() + '] [' + e.event + '] ' + e.detail;
  }).join('\n');
}

function downloadBlob(content, filename, mime) {
  var blob = new Blob([content], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
}

// ── Azioni ────────────────────────────────────────────────────────────────────

el('syncBtn').addEventListener('click', function() {
  el('syncBtn').disabled = true;
  chrome.runtime.sendMessage({ type: 'AAI_V4_SYNC_NOW' }, function() {
    void chrome.runtime.lastError;
    refresh();
  });
});

el('downloadBtn').addEventListener('click', function() {
  if (!_events.length) return;
  downloadBlob(JSON.stringify(_events, null, 2),
    'outlook-appuntamenti-' + new Date().toISOString().slice(0, 10) + '.json',
    'application/json');
});

// ── Avanzate ──────────────────────────────────────────────────────────────────

el('advToggle').addEventListener('click', function() {
  _advOpen = !_advOpen;
  el('advPanel').classList.toggle('hidden', !_advOpen);
  el('advToggle').textContent = _advOpen ? '⚙ Nascondi avanzate' : '⚙ Avanzate';
  if (_advOpen) renderEvents();
});

el('jsonBtn').addEventListener('click', function() {
  _jsonOpen = !_jsonOpen;
  el('jsonArea').classList.toggle('hidden', !_jsonOpen);
  if (_jsonOpen) el('jsonArea').value = JSON.stringify(_events, null, 2);
});

function saveOutlookTarget(url) {
  chrome.runtime.sendMessage({ type: 'AAI_V4_SAVE_OUTLOOK_URL', url: url }, function() {
    void chrome.runtime.lastError;
    refresh();
  });
}
el('optCloud').addEventListener('change', function() { saveOutlookTarget(DEFAULT_OUTLOOK_URL); });
el('optLive').addEventListener('change', function() { saveOutlookTarget(ALT_OUTLOOK_URL); });

var _intervalTimer = null;
el('intervalInput').addEventListener('input', function() {
  clearTimeout(_intervalTimer);
  var v = Number(el('intervalInput').value);
  if (!v || v < 1) return;
  _intervalTimer = setTimeout(function() {
    chrome.runtime.sendMessage({ type: 'AAI_V4_SET_INTERVAL', minutes: v }, function() {
      void chrome.runtime.lastError;
      showSaved(el('intervalSaved'));
    });
  }, 600);
});

el('debugModeToggle').addEventListener('change', function() {
  chrome.runtime.sendMessage({
    type: 'AAI_V4_SET_DEBUG_MODE', show: el('debugModeToggle').checked,
  }, function() { void chrome.runtime.lastError; });
});

el('reloadBtn').addEventListener('click', function() {
  el('reloadBtn').disabled = true;
  chrome.runtime.sendMessage({ type: 'AAI_V4_RELOAD_OUTLOOK' }, function() {
    void chrome.runtime.lastError;
    setTimeout(function() { el('reloadBtn').disabled = false; }, 2000);
  });
});

// ── Log ───────────────────────────────────────────────────────────────────────

el('logToggle').addEventListener('click', function() {
  _logOpen = !_logOpen;
  el('logPanel').classList.toggle('hidden', !_logOpen);
  el('logActions').classList.toggle('hidden', !_logOpen);
  el('logToggle').textContent = _logOpen ? '🪲 Nascondi log' : '🪲 Log debug';
  if (_logOpen) renderLog();
});

el('logCopy').addEventListener('click', function() {
  navigator.clipboard.writeText(logToText()).catch(function() {});
});

el('logDownload').addEventListener('click', function() {
  downloadBlob(logToText(), 'aai-plugin-log-' + stamp() + '.txt', 'text/plain');
});

el('logClear').addEventListener('click', function() {
  chrome.runtime.sendMessage({ type: 'AAI_V4_CLEAR_LOG' }, function() {
    void chrome.runtime.lastError;
    _log = [];
    renderLog();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

el('version').textContent = 'v' + chrome.runtime.getManifest().version;

refresh();
var _poll = setInterval(refresh, 1000);
window.addEventListener('unload', function() { clearInterval(_poll); });
