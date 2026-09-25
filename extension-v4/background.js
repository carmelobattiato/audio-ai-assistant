'use strict';
// Audio AI Assistance Plugin — background.js

var DEFAULT_INTERVAL_MIN = 1;
var MAX_LOG_ENTRIES = 100;
var ALARM = 'v4_resync';

// Una sync lasciata in 'fetching' oltre questa soglia viene letta come errore:
// il service worker MV3 può essere sospeso prima che la risposta arrivi.
var SYNC_STALE_MS = 45 * 1000;

// Default Outlook target — selezionabile dal popup
var DEFAULT_OUTLOOK_URL = 'https://outlook.cloud.microsoft/calendar/view/workweek';
var ALT_OUTLOOK_URL     = 'https://outlook.live.com/calendar/';

var K = {
  events:       'v4_events',
  rawEvents:    'v4_rawEvents',
  rawTs:        'v4_rawTs',
  seenAt:       'v4_seenAt',
  count:        'v4_count',
  interval:     'v4_interval',
  getState:     'v4_getState',
  getTs:        'v4_getTs',
  getError:     'v4_getError',
  log:          'v4_log',
  outlookUrl:   'v4_outlookUrl',   // URL Outlook target scelto dall'utente
  debugMode:    'v4_debugMode',    // toggle bottone RAW Calendar debug
  connectedUrl: 'v4_connectedUrl', // origin della tab Outlook che ha risposto
  lastTriggerAt:'v4_lastTriggerAt', // per accorgersi dei trigger rimasti senza risposta
  auth:         'v4_auth',          // header Authorization Outlook in cache
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function storeGet(keys, cb) {
  chrome.storage.local.get(Array.isArray(keys) ? keys : [keys], cb);
}

// Le scritture sono read-modify-write su storage: senza serializzarle, due log
// ravvicinati si sovrascrivono a vicenda e le voci spariscono dal pannello.
var _logChain = Promise.resolve();

function appendLog(event, detail) {
  var entry = { ts: Date.now(), event: event, detail: detail || '' };
  _logChain = _logChain.then(function() {
    return new Promise(function(resolve) {
      storeGet([K.log], function(r) {
        var log = r[K.log] || [];
        log.push(entry);
        if (log.length > MAX_LOG_ENTRIES) log = log.slice(-MAX_LOG_ENTRIES);
        chrome.storage.local.set({ [K.log]: log }, resolve);
      });
    });
  });
  return _logChain;
}

function isOutlookTab(url) {
  return url && (
    url.indexOf('outlook.cloud.microsoft') !== -1 ||
    url.indexOf('outlook.live.com')        !== -1 ||
    url.indexOf('outlook.office.com')      !== -1
  );
}

function isLiveConsumerTab(url) {
  return url && url.indexOf('outlook.live.com') !== -1;
}

// ── URL target helpers ────────────────────────────────────────────────────────

function getOutlookUrl(cb) {
  storeGet([K.outlookUrl], function(r) { cb(r[K.outlookUrl] || DEFAULT_OUTLOOK_URL); });
}

function getCloudAltUrl() {
  return 'https://outlook.cloud.microsoft/calendar/view/month';
}

function getLiveNextMonthUrl() {
  var d = new Date(); d.setMonth(d.getMonth() + 1);
  var y = d.getFullYear(); var m = String(d.getMonth() + 1).padStart(2, '0');
  return 'https://outlook.live.com/calendar/0/view/month/' + y + '-' + m + '-01';
}

function getLiveCurrentMonthUrl() {
  var d = new Date();
  var y = d.getFullYear(); var m = String(d.getMonth() + 1).padStart(2, '0');
  return 'https://outlook.live.com/calendar/0/view/month/' + y + '-' + m + '-01';
}

// ── Reload / open Outlook tab ─────────────────────────────────────────────────
// Naviga la tab dell'utente: invocato solo dal comando manuale nel popup.

function reloadOutlookTab(cb) {
  getOutlookUrl(function(targetUrl) {
    appendLog('OUTLOOK_SEARCH', 'cerco tab Outlook (target=' + targetUrl + ')');
    chrome.tabs.query({}, function(tabs) {
      var found = false;
      for (var i = 0; i < tabs.length; i++) {
        if (!isOutlookTab(tabs[i].url)) continue;
        found = true;
        var tabId = tabs[i].id;
        var tabUrl = tabs[i].url;
        appendLog('OUTLOOK_FOUND', tabUrl);

        if (isLiveConsumerTab(tabUrl)) {
          chrome.tabs.update(tabId, { url: getLiveNextMonthUrl() });
          appendLog('RELOAD', 'live.com mese+1 per cache miss');
          setTimeout(function() { chrome.tabs.update(tabId, { url: getLiveCurrentMonthUrl() }); }, 6000);
        } else {
          chrome.tabs.update(tabId, { url: getCloudAltUrl() });
          appendLog('RELOAD', 'cloud.microsoft -> month -> ' + targetUrl);
          setTimeout(function() { chrome.tabs.update(tabId, { url: targetUrl }); }, 4000);
        }
        break;
      }
      if (!found) {
        chrome.tabs.create({ url: targetUrl });
        appendLog('OUTLOOK_NOT_FOUND', 'nessuna tab -> aperta ' + targetUrl);
      }
      if (cb) cb(found);
    });
  });
}

// ── Bridge verso l'app ────────────────────────────────────────────────────────
// Stesso meccanismo di v3 ma con chiavi proprie: inietta localStorage nelle tab
// dell'app e lancia uno StorageEvent sintetico, perché una scrittura fatta da
// un altro contesto non genera l'evento da sola.

var APP_PATTERNS = ['localhost', '127.0.0.1'];
var BRIDGE = {
  events:   'aai-v4-bridge',
  ts:       'aai-v4-bridge-ts',
  state:    'aai-v4-bridge-state',
  extTs:    'aai-v4-bridge-ext-ts',
  nextSync: 'aai-v4-bridge-next-sync',
};

function isAppTab(url) {
  return APP_PATTERNS.some(function(p) { return url.indexOf(p) !== -1; });
}

function writeToAppTabs(patch) {
  chrome.tabs.query({}, function(tabs) {
    var appTabs = tabs.filter(function(t) { return t.id && t.url && isAppTab(t.url); });
    if (!appTabs.length) {
      appendLog('APP_NOT_FOUND', 'nessuna tab app (localhost/127.0.0.1) aperta');
      return;
    }
    appTabs.forEach(function(tab) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function(p) {
          Object.keys(p).forEach(function(k) {
            var v = typeof p[k] === 'string' ? p[k] : JSON.stringify(p[k]);
            localStorage.setItem(k, v);
            window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: v }));
          });
          return Object.keys(p).length;
        },
        args: [patch],
      })
        .then(function() { appendLog('APP_PUSH_OK', tab.url); })
        .catch(function(e) { appendLog('APP_PUSH_FAIL', tab.url + ' -> ' + ((e && e.message) || 'errore')); });
    });
  });
}

// Ogni push porta con sé il battito e il prossimo risveglio dell'alarm: così
// l'app sa se il plugin è vivo e quando aspettarsi il prossimo aggiornamento.
function pushToApp(state, events, dataTs) {
  chrome.alarms.get(ALARM, function(alarm) {
    var patch = {};
    patch[BRIDGE.state]  = state;
    patch[BRIDGE.extTs]  = String(Date.now());
    patch[BRIDGE.nextSync] = String(alarm && alarm.scheduledTime ? alarm.scheduledTime : 0);
    if (events) {
      patch[BRIDGE.events] = events;
      patch[BRIDGE.ts] = String(dataTs || Date.now());
    }
    writeToAppTabs(patch);
  });
}

// Una tab dell'app aperta a metà ciclo non ha ancora ricevuto nulla: a ogni
// sync le si rimanda anche la cache, così si popola senza attendere il turno.
function pushCachedToApp(state) {
  storeGet([K.events, K.seenAt], function(r) {
    var events = r[K.events] || [];
    pushToApp(state, events.length ? events : null, r[K.seenAt]);
  });
}

// ── Fetch dal service worker ──────────────────────────────────────────────────
// Percorso principale: il browser congela le tab in background, e una tab
// congelata non esegue nulla — né il content script né i suoi timer. Il service
// worker invece viene risvegliato dall'alarm, quindi con il token in cache può
// scaricare il calendario senza dipendere dallo stato della tab.

function pad2(n) { return String(n).padStart(2, '0'); }

function calendarRange() {
  var now = new Date();
  var back = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  var fwd  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  var fmt = function(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };
  return { start: fmt(back) + 'T00:00:00', end: fmt(fwd) + 'T23:59:59' };
}

// Gli orari UTC arrivano senza suffisso: senza 'Z' verrebbero letti come locali.
function restDt(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  var dt = obj.DateTime || obj.dateTime || '';
  if (!dt) return '';
  var tz = obj.TimeZone || obj.timeZone || '';
  if (tz === 'UTC' && dt.indexOf('Z') === -1 && dt.indexOf('+') === -1) dt += 'Z';
  return dt;
}

function mapRestEvent(ev) {
  var joinUrl = ev.OnlineMeetingUrl || (ev.OnlineMeeting && ev.OnlineMeeting.JoinUrl) || '';
  var attendees = [].concat(ev.Attendees || []).map(function(a) {
    return {
      name:  (a.EmailAddress && a.EmailAddress.Name) || '',
      email: (a.EmailAddress && a.EmailAddress.Address) || '',
      type:  a.Type === 'Optional' ? 'optional' : 'required',
    };
  });
  var start = restDt(ev.Start);
  return {
    id: ev.Id || ((ev.Subject || '') + '|' + start),
    subject: ev.Subject || '(senza titolo)',
    start: start,
    end: restDt(ev.End),
    location: (ev.Location && ev.Location.DisplayName) || '',
    body: ev.BodyPreview || (ev.Body && ev.Body.Content) || '',
    organizer: (ev.Organizer && ev.Organizer.EmailAddress && ev.Organizer.EmailAddress.Name) || '',
    attendees: attendees,
    isAllDay: !!ev.IsAllDay,
    isCanceled: !!ev.IsCancelled,
    isTeams: !!joinUrl,
    onlineMeetingUrl: joinUrl,
    responseStatus: (ev.ResponseStatus && ev.ResponseStatus.Response) || 'none',
    isRecurring: ev.Type === 'SeriesMaster' || ev.Type === 'Occurrence' || ev.Type === 'Exception',
  };
}

function syncFromBackground(cb) {
  storeGet([K.auth], function(r) {
    var auth = r[K.auth];
    if (!auth || !auth.header) { cb(false, 'nessun token in cache'); return; }

    var origin = auth.origin || 'https://outlook.cloud.microsoft';
    var range = calendarRange();
    // Niente $select: basta un campo non selezionabile sulla cassetta e l'intera
    // richiesta fallisce con 400.
    var url = origin + '/api/v2.0/me/CalendarView'
      + '?startDateTime=' + range.start + '&endDateTime=' + range.end + '&$top=200';

    fetch(url, {
      method: 'GET',
      headers: { authorization: auth.header, accept: 'application/json' },
      credentials: 'omit',
    })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(json) {
        var list = (json && json.value) || [];
        if (!list.length) { cb(false, 'risposta senza eventi'); return; }
        appendLog('BG_SYNC_OK', list.length + ' eventi via service worker');
        storeEvents(list.map(mapRestEvent), origin);
        cb(true);
      })
      .catch(function(e) {
        cb(false, (e && e.message) || 'errore di rete');
      });
  });
}

// ── Sync diretta ──────────────────────────────────────────────────────────────
// Non naviga mai la tab: inietta gli script (necessario per le tab già aperte
// prima che l'estensione venisse caricata) e invia il trigger. La risposta
// arriva più tardi come messaggio AAI_V4_EVENTS indipendente, che risveglia il
// service worker — non va attesa qui.

function triggerSync(reason, cb) {
  appendLog('SYNC', reason);
  // Prima si prova senza toccare la tab; il percorso via content script resta
  // come fallback per quando il token non c'è ancora o è scaduto.
  syncFromBackground(function(ok, why) {
    if (ok) { if (cb) cb(true); return; }
    appendLog('BG_SYNC_SKIP', why + ' — passo al content script');
    triggerSyncViaTab(cb);
  });
}

function triggerSyncViaTab(cb) {
  chrome.tabs.query({}, function(tabs) {
    var tab = null;
    for (var i = 0; i < tabs.length; i++) {
      if (isOutlookTab(tabs[i].url)) { tab = tabs[i]; break; }
    }
    if (!tab) {
      appendLog('OUTLOOK_NOT_FOUND', 'nessuna tab Outlook aperta');
      chrome.storage.local.set({
        [K.getState]: 'error',
        [K.getTs]: Date.now(),
        [K.getError]: 'Nessuna tab Outlook aperta',
      });
      pushCachedToApp('error');
      if (cb) cb(false);
      return;
    }

    appendLog('OUTLOOK_FOUND', tab.url);

    // Un trigger può non produrre nulla: se la tab Outlook è congelata dal
    // browser il content script non gira e nessuno se ne accorgerebbe.
    // Il ciclo successivo verifica che il precedente abbia prodotto eventi.
    storeGet([K.lastTriggerAt, K.seenAt], function(prev) {
      var last = prev[K.lastTriggerAt] || 0;
      var seen = prev[K.seenAt] || 0;
      if (last && seen < last) {
        var agoS = Math.round((Date.now() - last) / 1000);
        var why = 'nessun evento dopo il trigger di ' + agoS + 's fa — '
          + 'la tab Outlook potrebbe essere sospesa dal browser';
        appendLog('SYNC_NO_RESPONSE', why);
        chrome.storage.local.set({ [K.getError]: why });
        pushToApp('error');
      }
      chrome.storage.local.set({ [K.lastTriggerAt]: Date.now() });
    });

    chrome.storage.local.set({ [K.getState]: 'fetching', [K.getTs]: Date.now(), [K.getError]: '' });
    pushCachedToApp('fetching');

    var inject = function(file, world) {
      return chrome.scripting.executeScript({
        target: { tabId: tab.id }, files: [file], world: world,
      }).catch(function() {});
    };

    Promise.all([inject('content-bridge.js', 'ISOLATED'), inject('content-outlook.js', 'MAIN')])
      .then(function() {
        return chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function() { window.postMessage({ type: '__AAI_V4_DO_SYNC__' }, '*'); },
          world: 'MAIN',
        });
      })
      .then(function() { if (cb) cb(true); })
      .catch(function(e) {
        appendLog('SYNC_FAIL', (e && e.message) || 'trigger fallito');
        chrome.storage.local.set({
          [K.getState]: 'error',
          [K.getTs]: Date.now(),
          [K.getError]: (e && e.message) || 'Trigger fallito',
        });
        if (cb) cb(false);
      });
  });
}

// ── Merge e persistenza eventi ────────────────────────────────────────────────
// Unico punto di ingresso: ci arrivano sia gli eventi raccolti dal content
// script sia quelli scaricati direttamente dal service worker.

function storeEvents(incoming, origin, now) {
  now = now || Date.now();
  storeGet([K.events, K.rawEvents], function(r) {
    var existing    = r[K.events]    || [];
    var rawExisting = r[K.rawEvents] || [];
    var WEEK_MS     = 7 * 24 * 60 * 60 * 1000;
    var rawCutoff   = now - WEEK_MS;
    var rawById     = {};
    rawExisting.forEach(function(e) { if (e.id) rawById[e.id] = e; });
    incoming.forEach(function(e) {
      if (!e.id) return;
      var prev = rawById[e.id];
      rawById[e.id] = e;
      // preserve attendees from previously cached event when new event has none
      if (prev && prev.attendees && prev.attendees.length > 0
          && (!e.attendees || e.attendees.length === 0)) {
        rawById[e.id] = Object.assign({}, e, { attendees: prev.attendees });
      }
    });
    var rawMerged = Object.values(rawById).filter(function(e) {
      return !e.end || new Date(e.end).getTime() > rawCutoff;
    });

    // Finestra di sync: scorsa settimana + prossima settimana
    var winStart = now - WEEK_MS;
    var winEnd   = now + WEEK_MS;
    var byId = {};
    existing.forEach(function(e) { if (e.id) byId[e.id] = e; });
    rawMerged.forEach(function(e) {
      if (!e.id) return;
      var st = e.start ? new Date(e.start).getTime() : 0;
      var en = e.end   ? new Date(e.end).getTime()   : st;
      if (en >= winStart && st <= winEnd) byId[e.id] = e;
    });
    var merged = Object.values(byId).filter(function(e) {
      return !e.end || new Date(e.end).getTime() >= winStart;
    });

    var update = {
      [K.events]:    merged,
      [K.rawEvents]: rawMerged,
      [K.rawTs]:     now,
      [K.seenAt]:    now,
      [K.count]:     merged.length,
    };
    if (origin) update[K.connectedUrl] = origin;
    if (incoming.length > 0) {
      update[K.getState] = 'ok';
      update[K.getTs] = now;
      update[K.getError] = '';
    }
    appendLog('EVENTS_STORED', 'raw=' + rawMerged.length + ' finestra=' + merged.length + ' (-7g/+7g)');
    chrome.storage.local.set(update);
    pushToApp('ok', merged);
  });
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {

  if (msg.type === 'AAI_V4_EVENTS' && Array.isArray(msg.events)) {
    appendLog('AAI_V4_EVENTS', msg.events.length + ' eventi raw');
    var eventsOrigin = '';
    try { if (_sender && _sender.tab && _sender.tab.url) eventsOrigin = new URL(_sender.tab.url).origin; } catch (e) {}
    storeEvents(msg.events, eventsOrigin, msg.ts || Date.now());
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'AAI_V4_AUTH' && msg.header) {
    // Il token vive nel localStorage della pagina: caching qui permette al
    // service worker di sincronizzare anche quando la tab è congelata.
    storeGet([K.auth], function(r) {
      var prev = r[K.auth];
      if (!prev || prev.header !== msg.header) {
        appendLog('AUTH_CACHED', 'token Outlook aggiornato (' + (msg.origin || '?') + ')');
      }
      chrome.storage.local.set({
        [K.auth]: { header: msg.header, origin: msg.origin || '', ts: Date.now() },
      });
    });
    sendResponse({ ok: true });
    return;
  }


  if (msg.type === 'AAI_V4_GET_IDLE') {
    appendLog('GET_IDLE', 'direct call saltata');
    chrome.storage.local.set({ [K.getState]: 'idle', [K.getError]: '' });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'AAI_V4_GET_ERROR') {
    appendLog('GET_ERROR', msg.reason || 'errore sconosciuto');
    chrome.storage.local.set({
      [K.getState]: 'error',
      [K.getTs]: msg.ts || Date.now(),
      [K.getError]: msg.reason || 'errore',
    });
    pushToApp('error');
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'AAI_V4_LOG') {
    appendLog('CS', msg.msg || '');
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'AAI_V4_ENRICH' && msg.id) {
    storeGet([K.events], function(r) {
      var events = (r[K.events] || []).map(function(e) {
        if (e.id === msg.id && msg.onlineMeetingUrl) {
          return Object.assign({}, e, { onlineMeetingUrl: msg.onlineMeetingUrl });
        }
        return e;
      });
      chrome.storage.local.set({ [K.events]: events });
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'AAI_V4_GET_STATUS') {
    storeGet(Object.values(K), function(r) {
      var state = r[K.getState] || 'idle';
      var ts    = r[K.getTs]    || null;
      var error = r[K.getError] || '';
      // Il service worker può essere sospeso mentre lo stato è 'fetching':
      // senza questo controllo il popup resterebbe su "sync in corso" per sempre.
      if (state === 'fetching' && ts && Date.now() - ts > SYNC_STALE_MS) {
        state = 'error';
        error = 'Nessuna risposta da Outlook';
      }
      sendResponse({
        seenAt:       r[K.seenAt]       || null,
        count:        r[K.count]        || 0,
        interval:     r[K.interval]     || DEFAULT_INTERVAL_MIN,
        events:       r[K.events]       || [],
        rawEvents:    r[K.rawEvents]    || [],
        rawTs:        r[K.rawTs]        || null,
        getState:     state,
        getTs:        ts,
        getError:     error,
        log:          r[K.log]          || [],
        outlookUrl:   r[K.outlookUrl]   || DEFAULT_OUTLOOK_URL,
        connectedUrl: r[K.connectedUrl] || '',
        debugMode:    !!r[K.debugMode],
      });
    });
    return true;
  }

  if (msg.type === 'AAI_V4_SYNC_NOW') {
    // Si conferma la presa in carico subito. Tenere aperto il canale per tutta
    // la catena inject+trigger lo esponeva alla sospensione del service worker:
    // la risposta andava persa e il chiamante restava in timeout. L'esito reale
    // arriva comunque dallo stato pubblicato sul bridge.
    triggerSync(msg.reason || 'manuale');
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'AAI_V4_SET_INTERVAL') {
    var min = Math.max(1, Number(msg.minutes) || DEFAULT_INTERVAL_MIN);
    chrome.storage.local.set({ [K.interval]: min });
    chrome.alarms.create(ALARM, { periodInMinutes: min });
    sendResponse({ ok: true, minutes: min });
    return;
  }

  if (msg.type === 'AAI_V4_RELOAD_OUTLOOK') {
    reloadOutlookTab(function(found) { sendResponse({ ok: true, found: found }); });
    return true;
  }

  if (msg.type === 'AAI_V4_SAVE_OUTLOOK_URL') {
    var newUrl = msg.url === ALT_OUTLOOK_URL ? ALT_OUTLOOK_URL : DEFAULT_OUTLOOK_URL;
    chrome.storage.local.set({ [K.outlookUrl]: newUrl });
    appendLog('OUTLOOK_URL_CHANGED', newUrl);
    sendResponse({ ok: true, url: newUrl });
    return;
  }

  if (msg.type === 'AAI_V4_SET_DEBUG_MODE') {
    chrome.storage.local.set({ [K.debugMode]: !!msg.show });
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(function(tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'AAI_V4_DEBUG_MODE', show: !!msg.show }, function() {
          void chrome.runtime.lastError;
        });
      });
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'AAI_V4_CLEAR_LOG') {
    chrome.storage.local.set({ [K.log]: [] }, function() { sendResponse({ ok: true }); });
    return true;
  }
});

// ── Alarm ─────────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name !== ALARM) return;
  triggerSync('auto-sync');
});

// Senza questo una tab dell'app appena aperta resterebbe vuota fino al prossimo
// ciclo: le si manda subito la cache.
chrome.tabs.onUpdated.addListener(function(_tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;
  if (!tab || !tab.url || !isAppTab(tab.url)) return;
  storeGet([K.getState], function(r) {
    pushCachedToApp(r[K.getState] || 'idle');
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────

function initAlarm() {
  storeGet([K.interval], function(r) {
    chrome.alarms.create(ALARM, { periodInMinutes: r[K.interval] || DEFAULT_INTERVAL_MIN });
  });
}

chrome.runtime.onInstalled.addListener(function() {
  initAlarm();
  setTimeout(function() { triggerSync('primo avvio'); }, 1000);
});

initAlarm();
