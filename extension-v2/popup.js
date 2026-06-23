'use strict';

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

// ── Detail panel ──────────────────────────────────────────────────────────────

function fmtTs(ts) {
  if (!ts) return '—';
  var d = new Date(ts);
  return d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    + ' — ' + fmtAgo(ts);
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
    ['stato',     s.getState || 'idle'],
    ['quando',    fmtTs(s.getTs)],
    ['errore',    s.getError || (s.getState === 'ok' ? '—' : '—')],
    ['URL',       s.seenAt ? 'outlook.live.com/owa/service.svc' : '—'],
    ['timeout',   s.getState === 'fetching' && s.getTs && Date.now() - s.getTs > 30000 ? 'sì (>30s)' : 'no'],
  ];
  if (s.getError) rows[2][1] = s.getError;
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

  // Connection: Outlook
  var outlookOk = s.seenAt && (Date.now() - s.seenAt) < 30 * 60 * 1000;
  el('dotOutlook').className      = 'dot ' + (outlookOk ? 'dot-on' : 'dot-off');
  el('statusOutlook').textContent = outlookOk ? 'Connesso' : 'Non rilevato';
  el('statusOutlook').style.color = outlookOk ? '#6ee7b7' : '#64748b';
  el('seenAgo').textContent       = fmtAgo(s.seenAt);

  // Connection: App
  var appOk = s.appSeenAt && (Date.now() - s.appSeenAt) < 90 * 1000;
  el('dotApp').className      = 'dot ' + (appOk ? 'dot-app' : 'dot-off');
  el('statusApp').textContent = appOk ? 'Connessa' : 'Non trovata';
  el('statusApp').style.color = appOk ? '#93c5fd' : '#64748b';
  el('appSeenAgo').textContent = fmtAgo(s.appSeenAt);

  // Operations: GET — timeout guard: fetching > 30s → show as error
  var getState = s.getState || 'idle';
  if (getState === 'fetching' && s.getTs && Date.now() - s.getTs > 30000) getState = 'error';
  renderOp('dotGet', 'getLabel', 'getTsEl', getState, 'get', s.getTs);

  // Operations: POST
  renderOp('dotPost', 'postLabel', 'postTsEl', s.postState || 'idle', 'post', s.postTs);

  // Operation details (update if open)
  _lastStatus = s;
  if (_getInfoOpen)  updateGetDetail(s);
  if (_postInfoOpen) updatePostDetail(s);

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
    chrome.alarms.get('v2_resync', function(alarm) {
      var el2 = el('nextSyncCountdown');
      if (!el2) return;
      if (alarm && alarm.scheduledTime) {
        var secs = Math.max(0, Math.ceil((alarm.scheduledTime - Date.now()) / 1000));
        el2.textContent = 'prossimo sync: ' + (secs < 60 ? secs + 's' : Math.ceil(secs / 60) + 'min');
      } else {
        el2.textContent = '';
      }
    });
  }, 1000);
  window.addEventListener('unload', function() { clearInterval(tick); });

  // Sincronizza: apre/ricarica Outlook, attende 8s che faccia GetCalendarView, poi push
  el('syncBtn').addEventListener('click', function() {
    el('syncBtn').disabled = true;
    el('syncBtn').textContent = 'Apertura Outlook…';
    chrome.runtime.sendMessage({ type: 'V2_RELOAD_OUTLOOK' }, function(res) {
      el('syncBtn').textContent = (res && res.found) ? 'Attendo eventi…' : 'Apertura Outlook…';
      setTimeout(function() {
        chrome.runtime.sendMessage({ type: 'V2_SYNC_NOW' });
      }, 12000);
      setTimeout(function() {
        chrome.runtime.sendMessage({ type: 'V2_GET_STATUS' }, function(s) {
          if (s) render(s);
        });
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

  // Copia Log Debug
  el('debugBtn').addEventListener('click', function() {
    var s  = _lastStatus;
    var ts = function(ms) { return ms ? new Date(ms).toISOString() : 'n/a'; };
    var pad = function(v, w) { return String(v).padEnd(w); };

    var rawEvts = s.rawEvents || [];
    var lines = [
      '=== Calendar Bridge Debug Log ===',
      'generato:   ' + new Date().toISOString(),
      'versione:   v2.10',
      '',
      '[CONNESSIONE]',
      pad('Outlook Live:', 14) + (s.seenAt ? 'Connesso' : 'Non rilevato') + '  seenAt=' + ts(s.seenAt),
      pad('App AI:', 14)       + (s.appSeenAt ? 'Connessa' : 'Non trovata') + '  seenAt=' + ts(s.appSeenAt),
      '',
      '[OPERAZIONI]',
      pad('GET Outlook:', 14) + (s.getState || 'idle') + '  ts=' + ts(s.getTs) + '  errore=' + (s.getError || '-'),
      pad('POST App:', 14)    + (s.postState || 'idle') + '  ts=' + ts(s.postTs),
      '',
      '[CONFIG]',
      pad('App URL:', 14)    + (s.appUrl || 'n/a'),
      pad('Auto-sync:', 14)  + (s.interval || 1) + ' min',
      '',
      '[SCARICATI DA OUTLOOK] ' + rawEvts.length + '  (ultimo fetch: ' + ts(s.rawTs) + ')',
    ];

    rawEvts.sort(function(a,b){ return (a.start||'').localeCompare(b.start||''); });
    rawEvts.forEach(function(e, i) {
      lines.push(
        '  [' + (i + 1) + '] ' + e.subject +
        ' | start=' + (e.start || '?') +
        ' | end=' + (e.end || '?') +
        (e.isTeams ? ' | Teams' : '') +
        (e.isCancelled ? ' | CANCELLATO' : '') +
        ' | id=' + (e.id || '?')
      );
    });

    lines.push('', '[SINCRONIZZATI ALL\'APP] ' + _events.length + '  (finestra: -1gg / +7gg)');
    _events.sort(function(a,b){ return (a.start||'').localeCompare(b.start||''); });
    _events.forEach(function(e, i) {
      lines.push(
        '  [' + (i + 1) + '] ' + e.subject +
        ' | start=' + (e.start || '?') +
        ' | end=' + (e.end || '?') +
        (e.isTeams ? ' | Teams' : '') +
        (e.isCancelled ? ' | CANCELLATO' : '')
      );
    });

    var actLog = s.log || [];
    lines.push('', '[ATTIVITÀ BACKGROUND] ultimi ' + actLog.length + ' eventi');
    if (actLog.length === 0) {
      lines.push('  (nessuna attività registrata — extension appena installata/ricaricata)');
    } else {
      actLog.slice().reverse().forEach(function(entry, i) {
        lines.push('  [' + (i + 1) + '] ' + new Date(entry.ts).toISOString() + '  ' + entry.event + '  ' + entry.detail);
      });
    }

    lines.push('', '=== fine log ===');
    var log = lines.join('\n');

    navigator.clipboard.writeText(log).then(function() {
      var btn = el('debugBtn');
      var orig = btn.textContent;
      btn.textContent = 'Copiato ✓';
      setTimeout(function() { btn.textContent = orig; }, 1500);
    }).catch(function() {
      el('debugArea').value = log;
      el('debugArea').style.display = 'block';
      el('debugArea').select();
    });
  });
});
