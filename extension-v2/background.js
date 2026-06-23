'use strict';
// Calendar Bridge v2 — background.js

var DEFAULT_INTERVAL_MIN = 1;
var APP_PATTERNS = ['localhost', '127.0.0.1'];

var K = {
  events:    'v2_events',
  rawEvents: 'v2_rawEvents',
  rawTs:     'v2_rawTs',
  seenAt:    'v2_seenAt',
  count:     'v2_count',
  appSeenAt: 'v2_appSeenAt',
  syncedAt:  'v2_syncedAt',
  appUrl:    'v2_appUrl',
  interval:  'v2_interval',
  getState:  'v2_getState',
  getTs:     'v2_getTs',
  getError:  'v2_getError',
  postState: 'v2_postState',
  postTs:    'v2_postTs',
  log:       'v2_log',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function storeGet(keys, cb) {
  chrome.storage.local.get(Array.isArray(keys) ? keys : [keys], cb);
}

function appendLog(event, detail) {
  storeGet([K.log], function(r) {
    var log = r[K.log] || [];
    log.push({ ts: Date.now(), event: event, detail: detail || '' });
    if (log.length > 30) log = log.slice(-30);
    chrome.storage.local.set({ [K.log]: log });
  });
}

function isAppTab(url, customUrl) {
  if (customUrl && url.startsWith(customUrl)) return true;
  return APP_PATTERNS.some(function(p) { return url.indexOf(p) !== -1; });
}

function isOutlookTab(url) {
  return url && (url.indexOf('outlook.live.com') !== -1 || url.indexOf('outlook.office.com') !== -1);
}

// ── Reload Outlook tab ────────────────────────────────────────────────────────

function getNextMonthUrl() {
  var d = new Date();
  d.setMonth(d.getMonth() + 1);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  return 'https://outlook.live.com/calendar/0/view/month/' + y + '-' + m + '-01';
}

function getCurrentMonthUrl() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  return 'https://outlook.live.com/calendar/0/view/month/' + y + '-' + m + '-01';
}

function reloadOutlookTab(cb) {
  chrome.tabs.query({}, function(tabs) {
    var found = false;
    for (var i = 0; i < tabs.length; i++) {
      if (isOutlookTab(tabs[i].url)) {
        found = true;
        // Naviga al mese successivo per forzare cache miss Apollo/SSR
        // poi torna al mese corrente dopo 6s (che ha i nuovi eventi già in cache locale)
        var tabId = tabs[i].id;
        chrome.tabs.update(tabId, { url: getNextMonthUrl() });
        appendLog('RELOAD_OUTLOOK', 'navigo a mese+1 per cache miss → poi torno a mese corrente');
        setTimeout(function() {
          chrome.tabs.update(tabId, { url: getCurrentMonthUrl() });
        }, 6000);
        break;
      }
    }
    if (!found) {
      chrome.tabs.create({ url: getCurrentMonthUrl() });
      appendLog('RELOAD_OUTLOOK', 'nessuna tab → aperta outlook.live.com/calendar mese corrente');
    }
    if (cb) cb(found);
  });
}

// ── Push to app tabs ──────────────────────────────────────────────────────────

function pushToApp(events) {
  storeGet([K.appUrl], function(r) {
    var customUrl = r[K.appUrl] || null;
    chrome.tabs.query({}, function(tabs) {
      var now = Date.now();
      var appTabs = tabs.filter(function(tab) {
        return tab.id && tab.url && isAppTab(tab.url, customUrl);
      });
      if (appTabs.length === 0) return;

      chrome.storage.local.set({ [K.postState]: 'sending', [K.postTs]: now });

      var remaining = appTabs.length;
      var success   = 0;
      var firstSuccessUrl = null;

      function done(ok, tabUrl) {
        if (ok) {
          success++;
          if (!firstSuccessUrl && tabUrl) firstSuccessUrl = tabUrl;
        }
        remaining--;
        if (remaining === 0) {
          var finalTs = Date.now();
          if (success > 0) {
            appendLog('PUSH_OK', 'POST app riuscito — ' + success + '/' + appTabs.length + ' tab | url=' + (firstSuccessUrl || '?'));
            var update = {
              [K.appSeenAt]: now,
              [K.syncedAt]:  now,
              [K.postState]: 'ok',
              [K.postTs]:    finalTs,
            };
            // auto-sync appUrl to real tab origin so label stays accurate
            if (firstSuccessUrl) {
              try {
                var origin = new URL(firstSuccessUrl).origin + '/';
                if (origin !== customUrl) update[K.appUrl] = origin;
              } catch(e) {}
            }
            chrome.storage.local.set(update);
          } else {
            appendLog('PUSH_FAIL', 'POST app fallito — nessuna tab app raggiungibile | appUrl=' + (customUrl || 'n/a'));
            chrome.storage.local.set({ [K.postState]: 'error', [K.postTs]: finalTs });
          }
        }
      }

      appTabs.forEach(function(tab) {
        var tabUrl = tab.url;
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function(data, ts) {
            localStorage.setItem('cal-bridge-v2', JSON.stringify(data));
            localStorage.setItem('cal-bridge-v2-ts', String(ts));
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'cal-bridge-v2',
              newValue: JSON.stringify(data),
            }));
          },
          args: [events, now],
        }).then(function() { done(true, tabUrl); }).catch(function() { done(false, null); });
      });
    });
  });
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {

  // Nuovi eventi da content-outlook.js
  if (msg.type === 'CAL_V2_EVENTS' && Array.isArray(msg.events)) {
    appendLog('CAL_V2_EVENTS', 'ricevuti ' + msg.events.length + ' eventi raw da Outlook');
    var now = msg.ts || Date.now();
    storeGet([K.events, K.rawEvents], function(r) {
      var existing = r[K.events] || [];

      // merge raw events (all from Outlook) by id, purge >2 days old
      var rawExisting = r[K.rawEvents] || [];
      var rawCutoff = now - 2 * 24 * 60 * 60 * 1000;
      var rawById = {};
      rawExisting.forEach(function(e) { if (e.id) rawById[e.id] = e; });
      msg.events.forEach(function(e) { if (e.id) rawById[e.id] = e; });
      var rawMerged = Object.values(rawById).filter(function(e) {
        if (!e.end) return true;
        return new Date(e.end).getTime() > rawCutoff;
      });

      // filter for app: only -1d to +7d window
      var winStart = now - 1 * 24 * 60 * 60 * 1000;
      var winEnd   = now + 7 * 24 * 60 * 60 * 1000;
      var byId = {};
      existing.forEach(function(e) { if (e.id) byId[e.id] = e; });
      rawMerged.forEach(function(e) {
        if (!e.id) return;
        var s = e.start ? new Date(e.start).getTime() : 0;
        var en = e.end   ? new Date(e.end).getTime()   : s;
        if (en >= winStart && s <= winEnd) byId[e.id] = e;
      });
      var merged = Object.values(byId).filter(function(e) {
        if (!e.end) return true;
        return new Date(e.end).getTime() >= winStart;
      });

      var update = {
        [K.events]:    merged,
        [K.rawEvents]: rawMerged,
        [K.rawTs]:     now,
        [K.seenAt]:    now,
        [K.count]:     merged.length,
      };
      if (msg.events.length > 0) {
        update[K.getState] = 'ok';
        update[K.getTs]    = now;
        update[K.getError] = '';
      }
      appendLog('EVENTS_STORED', 'raw=' + rawMerged.length + ' → app=' + merged.length + ' (finestra -1d/+7d)');
      chrome.storage.local.set(update);
      if (merged.length > 0) pushToApp(merged);
    });
    sendResponse({ ok: true });
    return;
  }

  // Direct call innocuous auth failure — reset fetching state without showing error
  if (msg.type === 'CAL_V2_GET_IDLE') {
    appendLog('GET_IDLE', 'direct call saltata (consumer cookie-auth)');
    chrome.storage.local.set({
      [K.getState]: 'idle',
      [K.getError]: '',
    });
    sendResponse({ ok: true });
    return;
  }

  // Errore GET da content-outlook.js
  if (msg.type === 'CAL_V2_GET_ERROR') {
    appendLog('GET_ERROR', msg.reason || 'errore sconosciuto');
    chrome.storage.local.set({
      [K.getState]: 'error',
      [K.getTs]:    msg.ts || Date.now(),
      [K.getError]: msg.reason || 'errore sconosciuto',
    });
    sendResponse({ ok: true });
    return;
  }

  // Log da content-outlook.js (via content-bridge.js)
  if (msg.type === 'CAL_V2_LOG') {
    appendLog('CS', msg.msg || '');
    sendResponse({ ok: true });
    return;
  }

  // Arricchimento Teams URL
  if (msg.type === 'CAL_V2_ENRICH' && msg.id) {
    storeGet([K.events], function(r) {
      var events = r[K.events] || [];
      var updated = false;
      events = events.map(function(e) {
        if (e.id === msg.id && msg.onlineMeetingUrl) {
          updated = true;
          return Object.assign({}, e, { onlineMeetingUrl: msg.onlineMeetingUrl });
        }
        return e;
      });
      if (updated) {
        chrome.storage.local.set({ [K.events]: events });
        pushToApp(events);
      }
    });
    sendResponse({ ok: true });
    return;
  }

  // Status per popup
  if (msg.type === 'V2_GET_STATUS') {
    storeGet(Object.values(K), function(r) {
      sendResponse({
        seenAt:    r[K.seenAt]    || null,
        count:     r[K.count]     || 0,
        appSeenAt: r[K.appSeenAt] || null,
        syncedAt:  r[K.syncedAt]  || null,
        appUrl:    r[K.appUrl]    || '',
        interval:  r[K.interval]  || DEFAULT_INTERVAL_MIN,
        events:    r[K.events]    || [],
        rawEvents: r[K.rawEvents] || [],
        rawTs:     r[K.rawTs]     || null,
        getState:  r[K.getState]  || 'idle',
        getTs:     r[K.getTs]     || null,
        getError:  r[K.getError]  || '',
        postState: r[K.postState] || 'idle',
        postTs:    r[K.postTs]    || null,
        log:       r[K.log]       || [],
      });
    });
    return true;
  }

  // Sync now: triggers active GetCalendarView call via content script
  if (msg.type === 'V2_SYNC_NOW') {
    appendLog('SYNC_NOW', 'V2_SYNC_NOW richiesto dal popup');
    var syncTs = Date.now();
    chrome.storage.local.set({ [K.getState]: 'fetching', [K.getTs]: syncTs });
    chrome.tabs.query({}, function(tabs) {
      for (var i = 0; i < tabs.length; i++) {
        if (isOutlookTab(tabs[i].url)) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[i].id },
            func: function() {
              window.postMessage({ type: '__CAL_V2_DO_SYNC__' }, '*');
            },
          }).catch(function() {
            chrome.storage.local.set({ [K.getState]: 'error', [K.getTs]: Date.now() });
          });
          break;
        }
      }
    });
    // Re-broadcast cache immediately
    storeGet([K.events], function(r) {
      var events = r[K.events] || [];
      if (events.length > 0) pushToApp(events);
      sendResponse({ ok: true, count: events.length });
    });
    return true;
  }

  // Salva App URL
  if (msg.type === 'V2_SAVE_URL') {
    chrome.storage.local.set({ [K.appUrl]: msg.url || '' });
    sendResponse({ ok: true });
    return;
  }

  // Cambia intervallo sync
  if (msg.type === 'V2_SET_INTERVAL') {
    var min = Math.max(1, Number(msg.minutes) || DEFAULT_INTERVAL_MIN);
    chrome.storage.local.set({ [K.interval]: min });
    chrome.alarms.create('v2_resync', { periodInMinutes: min });
    sendResponse({ ok: true, minutes: min });
    return;
  }

  // Ricarica tab Outlook
  if (msg.type === 'V2_RELOAD_OUTLOOK') {
    reloadOutlookTab(function(found) {
      sendResponse({ ok: true, found: found });
    });
    return true;
  }
});

// ── Alarm ─────────────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name !== 'v2_resync') return;
  appendLog('ALARM', 'auto-sync scattato');

  // always push cached events to app
  storeGet([K.events], function(r) {
    var events = r[K.events] || [];
    if (events.length > 0) pushToApp(events);
  });

  chrome.tabs.query({}, function(tabs) {
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      if (!isOutlookTab(tab.url)) continue;

      var isConsumer = tab.url && tab.url.indexOf('outlook.live.com') !== -1;
      if (isConsumer) {
        if (!tab.active) {
          appendLog('ALARM_RELOAD', 'tab consumer non attiva → ricarico per intercettare fetch');
          chrome.tabs.reload(tab.id);
        } else {
          appendLog('ALARM_SKIP', 'tab consumer attiva → non ricarico (utente presente)');
        }
      } else {
        // corporate: direct call works, use DO_SYNC
        chrome.storage.local.set({ [K.getState]: 'fetching', [K.getTs]: Date.now() });
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function() { window.postMessage({ type: '__CAL_V2_DO_SYNC__' }, '*'); },
        }).catch(function() {
          chrome.storage.local.set({ [K.getState]: 'error', [K.getTs]: Date.now() });
        });
      }
      break;
    }
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────
function initAlarm() {
  storeGet([K.interval], function(r) {
    chrome.alarms.create('v2_resync', { periodInMinutes: r[K.interval] || DEFAULT_INTERVAL_MIN });
  });
}

chrome.runtime.onInstalled.addListener(function() {
  initAlarm();
  setTimeout(function() { reloadOutlookTab(null); }, 1000);
});

initAlarm();
