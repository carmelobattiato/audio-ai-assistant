'use strict';

var _events     = [];
var _jsonVisible = false;

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtAgo(ts) {
  if (!ts) return '—';
  var s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)    return 'adesso';
  if (s < 60)   return s + 's fa';
  if (s < 3600) return Math.floor(s / 60) + 'min fa';
  return Math.floor(s / 3600) + 'h fa';
}

function fmtTime(iso) {
  if (!iso) return '?';
  var d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function fmtDayShort(iso) {
  if (!iso) return '';
  var d    = new Date(iso);
  var now  = new Date();
  if (d.toDateString() === now.toDateString()) return 'oggi';
  var days = ['dom','lun','mar','mer','gio','ven','sab'];
  return days[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function el(id) { return document.getElementById(id); }

function showSaved(id) {
  var e = el(id); if (!e) return;
  e.classList.add('show');
  setTimeout(function() { e.classList.remove('show'); }, 1500);
}

// ── Operation status renderer ─────────────────────────────────────────────────

function renderOp(dotId, labelId, tsId, state, kind, tsVal) {
  var dotCls = {
    idle:     'dot dot-idle',
    fetching: 'dot dot-working',
    sending:  'dot dot-working',
    ok:       'dot dot-ok',
    error:    'dot dot-error',
  };
  var lbl = {
    idle:     '—',
    fetching: 'In corso…',
    sending:  'Invio…',
    ok:       kind === 'get' ? 'Riuscito' : 'Inviato',
    error:    'Fallito',
  };
  el(dotId).className       = dotCls[state] || 'dot dot-idle';
  el(labelId).textContent   = lbl[state]    || '—';
  el(tsId).textContent      = tsVal ? fmtAgo(tsVal) : '—';
}

// ── Events list renderer ──────────────────────────────────────────────────────

function renderEvents(events) {
  var label = el('evtCountLabel');
  var list  = el('evtList');

  if (!events.length) {
    label.textContent = 'nessun evento';
    list.innerHTML = '<div class="empty-hint">Nessun evento rilevato — clicca Forza Sync</div>';
    return;
  }

  label.textContent = events.length + (events.length === 1 ? ' evento' : ' eventi');

  list.innerHTML = events.map(function(ev) {
    var subj  = (ev.subject || '(senza titolo)').slice(0, 42);
    var day   = fmtDayShort(ev.start);
    var time  = fmtTime(ev.start) + '–' + fmtTime(ev.end);
    var teams = ev.isTeams ? '<span class="evt-teams">Teams</span>' : '';
    return '<div class="evt-row">'
      + '<span class="evt-arrow">▸</span>'
      + '<span class="evt-subj">' + escHtml(subj) + '</span>'
      + teams
      + '<span class="evt-time">' + escHtml(day ? day + ' ' : '') + escHtml(time) + '</span>'
      + '</div>';
  }).join('');

  if (_jsonVisible) el('jsonArea').value = JSON.stringify(events, null, 2);
}

// ── Main render ───────────────────────────────────────────────────────────────

function render(s) {
  _events = s.events || [];

  // Connection: Outlook
  var outlookOk = s.seenAt && (Date.now() - s.seenAt) < 5 * 60 * 1000;
  el('dotOutlook').className      = 'dot ' + (outlookOk ? 'dot-on' : 'dot-off');
  el('statusOutlook').textContent = outlookOk ? 'Connesso' : 'Non rilevato';
  el('statusOutlook').style.color = outlookOk ? '#6ee7b7' : '#64748b';
  el('seenAgo').textContent       = fmtAgo(s.seenAt);

  // Connection: App
  var appOk = s.appSeenAt && (Date.now() - s.appSeenAt) < 90 * 1000;
  el('dotApp').className      = 'dot ' + (appOk ? 'dot-app' : 'dot-off');
  el('statusApp').textContent = appOk ? 'Rilevata' : 'Non trovata';
  el('statusApp').style.color = appOk ? '#93c5fd' : '#64748b';
  el('appSeenAgo').textContent = fmtAgo(s.appSeenAt);

  // Operations: GET — timeout guard: fetching > 30s → show as error
  var getState = s.getState || 'idle';
  if (getState === 'fetching' && s.getTs && Date.now() - s.getTs > 30000) getState = 'error';
  renderOp('dotGet', 'getLabel', 'getTsEl', getState, 'get', s.getTs);

  // Operations: POST
  renderOp('dotPost', 'postLabel', 'postTsEl', s.postState || 'idle', 'post', s.postTs);

  // Events
  renderEvents(_events);

  // Settings inputs
  var inp = el('intervalInput');
  if (inp && document.activeElement !== inp) inp.value = s.interval || 1;
  var urlInp = el('appUrl');
  if (urlInp && document.activeElement !== urlInp && s.appUrl) urlInp.value = s.appUrl;
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {

  chrome.runtime.sendMessage({ type: 'V2_GET_STATUS' }, function(s) {
    if (s) render(s);
  });

  var tick = setInterval(function() {
    chrome.runtime.sendMessage({ type: 'V2_GET_STATUS' }, function(s) {
      if (s) render(s);
    });
  }, 2000);
  window.addEventListener('unload', function() { clearInterval(tick); });

  // Forza Sync
  el('syncBtn').addEventListener('click', function() {
    el('syncBtn').disabled = true;
    chrome.runtime.sendMessage({ type: 'V2_SYNC_NOW' }, function() {
      setTimeout(function() {
        chrome.runtime.sendMessage({ type: 'V2_GET_STATUS' }, function(s) {
          if (s) render(s);
        });
      }, 350);
      setTimeout(function() { el('syncBtn').disabled = false; }, 2000);
    });
  });

  // Ricarica Outlook
  el('reloadBtn').addEventListener('click', function() {
    el('reloadBtn').disabled = true;
    chrome.runtime.sendMessage({ type: 'V2_RELOAD_OUTLOOK' }, function() {
      setTimeout(function() { el('reloadBtn').disabled = false; }, 3000);
    });
  });

  // JSON toggle
  el('jsonBtn').addEventListener('click', function() {
    _jsonVisible = !_jsonVisible;
    var area = el('jsonArea');
    area.classList.toggle('visible', _jsonVisible);
    el('jsonBtn').classList.toggle('active', _jsonVisible);
    if (_jsonVisible) area.value = JSON.stringify(_events, null, 2);
  });

  // Auto-sync interval
  function saveInterval() {
    var min = Math.max(1, Math.min(60, parseInt(el('intervalInput').value, 10) || 1));
    el('intervalInput').value = min;
    chrome.runtime.sendMessage({ type: 'V2_SET_INTERVAL', minutes: min }, function() {
      showSaved('intervalSaved');
    });
  }
  el('intervalInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') saveInterval(); });
  el('intervalInput').addEventListener('blur', saveInterval);

  // App URL (auto-save)
  var urlTimer = null;
  el('appUrl').addEventListener('input', function() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function() {
      chrome.runtime.sendMessage({ type: 'V2_SAVE_URL', url: el('appUrl').value.trim() }, function() {
        showSaved('urlSaved');
      });
    }, 600);
  });
});
