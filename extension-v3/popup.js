'use strict';

var DEFAULT_OUTLOOK_URL = 'https://outlook.cloud.microsoft/calendar/view/workweek';
var ALT_OUTLOOK_URL     = 'https://outlook.live.com/calendar/';

var _events      = [];
var _jsonVisible  = false;
var _getInfoOpen  = false;
var _postInfoOpen = false;
var _lastStatus   = {};

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
  var d   = new Date(iso);
  var now = new Date();
  if (d.toDateString() === now.toDateString()) return 'oggi';
  var days = ['dom','lun','mar','mer','gio','ven','sab'];
  return days[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function el(id) { return document.getElementById(id); }

function showSaved(id) {
  var e = el(id); if (!e) return;
  e.classList.add('show');
  setTimeout(function() { e.classList.remove('show'); }, 1500);
}

// ── Outlet URL helpers ────────────────────────────────────────────────────────

function isCloud(url) {
  return !url || url.indexOf('outlook.live.com') === -1;
}

function outlookHostLabel(url) {
  if (!url || url.indexOf('outlook.cloud.microsoft') !== -1) return 'Outlook Cloud';
  if (url.indexOf('outlook.live.com') !== -1) return 'Outlook Live';
  return 'Outlook';
}

function setSelectedRadio(url) {
  var chosen = (url === ALT_OUTLOOK_URL) ? ALT_OUTLOOK_URL : DEFAULT_OUTLOOK_URL;
  document.querySelectorAll('input[name=outlookUrl]').forEach(function(inp) {
    inp.checked = (inp.value === chosen);
  });
  el('optCloud').classList.toggle('selected', chosen === DEFAULT_OUTLOOK_URL);
  el('optLive').classList.toggle('selected', chosen === ALT_OUTLOOK_URL);
  // Aggiorna etichetta nella sezione connessione
  el('outlookLabel').textContent = outlookHostLabel(chosen);
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function fmtTs(ts) {
  if (!ts) return '—';
  var d = new Date(ts);
  return d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) + ' — ' + fmtAgo(ts);
}

function buildDetailRows(rows) {
  return rows.map(function(r) {
    return '<div class="op-detail-row">'
      + '<span class="op-detail-key">' + escHtml(r[0]) + '</span>'
      + '<span class="op-detail-val">' + escHtml(r[1]) + '</span>'
      + '</div>';
  }).join('');
}

function updateGetDetail(s) {
  var rows = [
    ['stato',   s.getState || 'idle'],
    ['quando',  fmtTs(s.getTs)],
    ['errore',  s.getError || '—'],
    ['timeout', s.getState === 'fetching' && s.getTs && Date.now() - s.getTs > 30000 ? 'sì (>30s)' : 'no'],
  ];
  el('getDetail').innerHTML = buildDetailRows(rows);
}

function updatePostDetail(s) {
  var rows = [
    ['stato',     s.postState || 'idle'],
    ['quando',    fmtTs(s.postTs)],
    ['app URL',   s.appUrl || '(non impostato)'],
    ['last sync', fmtTs(s.syncedAt)],
  ];
  el('postDetail').innerHTML = buildDetailRows(rows);
}

// ── Operation status renderer ─────────────────────────────────────────────────

function renderOp(dotId, labelId, tsId, state, kind, tsVal) {
  var dotCls = { idle:'dot dot-idle', fetching:'dot dot-working', sending:'dot dot-working', ok:'dot dot-ok', error:'dot dot-error' };
  var lbl    = { idle:'—', fetching:'In corso…', sending:'Invio…', ok: kind==='get'?'Riuscito':'Inviato', error:'Fallito' };
  el(dotId).className     = dotCls[state] || 'dot dot-idle';
  el(labelId).textContent = lbl[state]    || '—';
  el(tsId).textContent    = tsVal ? fmtAgo(tsVal) : '—';
}

// ── Events list renderer ──────────────────────────────────────────────────────

function renderEvents(events) {
  var label = el('evtCountLabel');
  var list  = el('evtList');

  if (!events.length) {
    label.textContent = 'nessun evento';
    list.innerHTML = '<div class="empty-hint">Nessun evento — clicca Sincronizza (apre Outlook se non aperta)</div>';
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

  // Connessione: Outlook
  var outlookOk = s.seenAt && (Date.now() - s.seenAt) < 30 * 60 * 1000;
  el('dotOutlook').className      = 'dot ' + (outlookOk ? 'dot-on' : 'dot-off');
  el('statusOutlook').textContent = outlookOk ? 'Connesso' : 'Non rilevato';
  el('statusOutlook').style.color = outlookOk ? '#6ee7b7' : '#64748b';
  el('seenAgo').textContent       = fmtAgo(s.seenAt);

  // Connessione: App
  var appOk = s.appSeenAt && (Date.now() - s.appSeenAt) < 90 * 1000;
  el('dotApp').className       = 'dot ' + (appOk ? 'dot-app' : 'dot-off');
  el('statusApp').textContent  = appOk ? 'Connessa' : 'Non trovata';
  el('statusApp').style.color  = appOk ? '#93c5fd' : '#64748b';
  el('appSeenAgo').textContent = fmtAgo(s.appSeenAt);

  // Operazioni: GET
  var getState = s.getState || 'idle';
  if (getState === 'fetching' && s.getTs && Date.now() - s.getTs > 30000) getState = 'error';
  renderOp('dotGet', 'getLabel', 'getTsEl', getState, 'get', s.getTs);

  // Operazioni: POST
  renderOp('dotPost', 'postLabel', 'postTsEl', s.postState || 'idle', 'post', s.postTs);

  _lastStatus = s;
  if (_getInfoOpen)  updateGetDetail(s);
  if (_postInfoOpen) updatePostDetail(s);

  renderEvents(_events);

  // Inputs (non aggiornare se l'utente sta editando)
  var inp = el('intervalInput');
  if (inp && document.activeElement !== inp) inp.value = s.interval || 1;
  var urlInp = el('appUrl');
  if (urlInp && document.activeElement !== urlInp && s.appUrl) urlInp.value = s.appUrl;

  // Aggiorna radio selector URL Outlook
  if (s.outlookUrl) setSelectedRadio(s.outlookUrl);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {

  chrome.runtime.sendMessage({ type: 'V2_GET_STATUS' }, function(s) { if (s) render(s); });

  var tick = setInterval(function() {
    chrome.runtime.sendMessage({ type: 'V2_GET_STATUS' }, function(s) { if (s) render(s); });
    chrome.alarms.get('v3_resync', function(alarm) {
      var c = el('nextSyncCountdown'); if (!c) return;
      if (alarm && alarm.scheduledTime) {
        var secs = Math.max(0, Math.ceil((alarm.scheduledTime - Date.now()) / 1000));
        c.textContent = 'prossimo sync: ' + (secs < 60 ? secs + 's' : Math.ceil(secs / 60) + 'min');
      } else { c.textContent = ''; }
    });
  }, 1000);
  window.addEventListener('unload', function() { clearInterval(tick); });

  // Sincronizza
  el('syncBtn').addEventListener('click', function() {
    el('syncBtn').disabled = true;
    el('syncBtn').textContent = 'Apertura Outlook…';
    chrome.runtime.sendMessage({ type: 'V2_RELOAD_OUTLOOK' }, function(res) {
      el('syncBtn').textContent = (res && res.found) ? 'Attendo eventi…' : 'Apertura Outlook…';
      setTimeout(function() { chrome.runtime.sendMessage({ type: 'V2_SYNC_NOW' }); }, 12000);
      setTimeout(function() {
        chrome.runtime.sendMessage({ type: 'V2_GET_STATUS' }, function(s) { if (s) render(s); });
        el('syncBtn').innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/></svg> Sincronizza';
        el('syncBtn').disabled = false;
      }, 14000);
    });
  });

  // GET info toggle
  el('getInfoBtn').addEventListener('click', function() {
    _getInfoOpen = !_getInfoOpen;
    el('getInfoBtn').classList.toggle('active', _getInfoOpen);
    el('getDetail').classList.toggle('visible', _getInfoOpen);
    if (_getInfoOpen) updateGetDetail(_lastStatus);
  });

  // POST info toggle
  el('postInfoBtn').addEventListener('click', function() {
    _postInfoOpen = !_postInfoOpen;
    el('postInfoBtn').classList.toggle('active', _postInfoOpen);
    el('postDetail').classList.toggle('visible', _postInfoOpen);
    if (_postInfoOpen) updatePostDetail(_lastStatus);
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
    chrome.runtime.sendMessage({ type: 'V2_SET_INTERVAL', minutes: min }, function() { showSaved('intervalSaved'); });
  }
  el('intervalInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') saveInterval(); });
  el('intervalInput').addEventListener('blur', saveInterval);

  // App URL
  var urlTimer = null;
  el('appUrl').addEventListener('input', function() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function() {
      chrome.runtime.sendMessage({ type: 'V2_SAVE_URL', url: el('appUrl').value.trim() }, function() { showSaved('urlSaved'); });
    }, 600);
  });

  // Outlook URL selector
  document.querySelectorAll('input[name=outlookUrl]').forEach(function(inp) {
    inp.addEventListener('change', function() {
      var chosen = inp.value;
      setSelectedRadio(chosen);
      chrome.runtime.sendMessage({ type: 'V3_SAVE_OUTLOOK_URL', url: chosen }, function() { showSaved('outlookUrlSaved'); });
    });
  });

  // Copia Log Debug
  el('debugBtn').addEventListener('click', function() {
    var s  = _lastStatus;
    var ts = function(ms) { return ms ? new Date(ms).toISOString() : 'n/a'; };

    var rawEvts = s.rawEvents || [];
    var lines = [
      '=== Calendar Bridge Debug Log ===',
      'generato:      ' + new Date().toISOString(),
      'versione:      v3.0',
      'outlook target:' + (s.outlookUrl || DEFAULT_OUTLOOK_URL),
      '',
      '[CONNESSIONE]',
      'Outlook:  ' + (s.seenAt ? 'Connesso' : 'Non rilevato') + '  seenAt=' + ts(s.seenAt),
      'App AI:   ' + (s.appSeenAt ? 'Connessa' : 'Non trovata') + '  seenAt=' + ts(s.appSeenAt),
      '',
      '[OPERAZIONI]',
      'GET Outlook: ' + (s.getState || 'idle') + '  ts=' + ts(s.getTs) + '  errore=' + (s.getError || '-'),
      'POST App:    ' + (s.postState || 'idle') + '  ts=' + ts(s.postTs),
      '',
      '[CONFIG]',
      'App URL:     ' + (s.appUrl || 'n/a'),
      'Auto-sync:   ' + (s.interval || 1) + ' min',
      'Outlook URL: ' + (s.outlookUrl || DEFAULT_OUTLOOK_URL),
      '',
      '[SCARICATI DA OUTLOOK] ' + rawEvts.length + '  (ultimo fetch: ' + ts(s.rawTs) + ')',
    ];

    rawEvts.sort(function(a,b){ return (a.start||'').localeCompare(b.start||''); });
    rawEvts.forEach(function(e, i) {
      lines.push('  [' + (i+1) + '] ' + e.subject + ' | start=' + (e.start||'?') + ' | end=' + (e.end||'?')
        + (e.isTeams ? ' | Teams' : '') + (e.isCancelled ? ' | CANCELLATO' : '') + ' | id=' + (e.id||'?'));
    });

    lines.push('', '[SINCRONIZZATI ALL\'APP] ' + _events.length + '  (finestra: -24h / +7gg)');
    _events.sort(function(a,b){ return (a.start||'').localeCompare(b.start||''); });
    _events.forEach(function(e, i) {
      lines.push('  [' + (i+1) + '] ' + e.subject + ' | start=' + (e.start||'?') + ' | end=' + (e.end||'?')
        + (e.isTeams ? ' | Teams' : '') + (e.isCancelled ? ' | CANCELLATO' : ''));
    });

    var actLog = s.log || [];
    lines.push('', '[ATTIVITA\' BACKGROUND] ultimi ' + actLog.length + ' eventi');
    if (actLog.length === 0) {
      lines.push('  (nessuna — extension appena installata/ricaricata)');
    } else {
      actLog.slice().reverse().forEach(function(entry, i) {
        lines.push('  [' + (i+1) + '] ' + new Date(entry.ts).toISOString() + '  ' + entry.event + '  ' + entry.detail);
      });
    }

    lines.push('', '=== fine log ===');
    var log = lines.join('\n');

    navigator.clipboard.writeText(log).then(function() {
      var btn = el('debugBtn'); var orig = btn.textContent;
      btn.textContent = 'Copiato ✓';
      setTimeout(function() { btn.textContent = orig; }, 1500);
    }).catch(function() {
      el('debugArea').value = log; el('debugArea').style.display = 'block'; el('debugArea').select();
    });
  });
});
