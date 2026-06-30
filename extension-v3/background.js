'use strict';
// Calendar Bridge v3 — background.js

var DEFAULT_INTERVAL_MIN = 1;
var APP_PATTERNS = ['localhost', '127.0.0.1'];

// Default Outlook target — selezionabile dal popup
var DEFAULT_OUTLOOK_URL = 'https://outlook.cloud.microsoft/calendar/view/workweek';
var ALT_OUTLOOK_URL     = 'https://outlook.live.com/calendar/';

var K = {
  events:     'v3_events',
  rawEvents:  'v3_rawEvents',
  rawTs:      'v3_rawTs',
  seenAt:     'v3_seenAt',
  count:      'v3_count',
  appSeenAt:  'v3_appSeenAt',
  syncedAt:   'v3_syncedAt',
  appUrl:     'v3_appUrl',
  interval:   'v3_interval',
  getState:   'v3_getState',
  getTs:      'v3_getTs',
  getError:   'v3_getError',
  postState:  'v3_postState',
  postTs:     'v3_postTs',
  log:        'v3_log',
  outlookUrl: 'v3_outlookUrl',  // URL Outlook target scelto dall'utente
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

// Per cloud.microsoft: naviga a month per cache miss, poi torna a workweek
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

function reloadOutlookTab(cb) {
  getOutlookUrl(function(targetUrl) {
    chrome.tabs.query({}, function(tabs) {
      var found = false;
      for (var i = 0; i < tabs.length; i++) {
        if (!isOutlookTab(tabs[i].url)) continue;
        found = true;
        var tabId = tabs[i].id;
        var tabUrl = tabs[i].url;

        if (isLiveConsumerTab(tabUrl)) {
          // live.com: naviga mese+1 per cache miss, poi torna al corrente
          chrome.tabs.update(tabId, { url: getLiveNextMonthUrl() });
          appendLog('RELOAD', 'live.com mese+1 per cache miss');
          setTimeout(function() { chrome.tabs.update(tabId, { url: getLiveCurrentMonthUrl() }); }, 6000);
        } else {
          // cloud.microsoft / office.com: naviga a month per cache miss, poi torna alla vista configurata
          chrome.tabs.update(tabId, { url: getCloudAltUrl() });
          appendLog('RELOAD', 'cloud.microsoft -> month -> ' + targetUrl);
          setTimeout(function() { chrome.tabs.update(tabId, { url: targetUrl }); }, 4000);
        }
        break;
      }
      if (!found) {
        chrome.tabs.create({ url: targetUrl });
        appendLog('RELOAD', 'nessuna tab -> aperta ' + targetUrl);
      }
      if (cb) cb(found);
    });
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
      var remaining = appTabs.length; var success = 0; var firstSuccessUrl = null;

      function done(ok, tabUrl) {
        if (ok) { success++; if (!firstSuccessUrl && tabUrl) firstSuccessUrl = tabUrl; }
        if (--remaining === 0) {
          var finalTs = Date.now();
          if (success > 0) {
            appendLog('PUSH_OK', success + '/' + appTabs.length + ' tab');
            var upd = { [K.appSeenAt]: now, [K.syncedAt]: now, [K.postState]: 'ok', [K.postTs]: finalTs };
            if (firstSuccessUrl) {
              try { var o = new URL(firstSuccessUrl).origin + '/'; if (o !== customUrl) upd[K.appUrl] = o; } catch(e) {}
            }
            chrome.storage.local.set(upd);
          } else {
            appendLog('PUSH_FAIL', 'nessuna tab app raggiungibile');
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
            localStorage.setItem('cal-bridge-v2-outlook-state', 'ok');
            localStorage.setItem('cal-bridge-v2-ext-ts', String(ts));
            window.dispatchEvent(new StorageEvent('storage', { key: 'cal-bridge-v2', newValue: JSON.stringify(data) }));
          },
          args: [events, now],
        }).then(function() { done(true, tabUrl); }).catch(function() { done(false, null); });
      });
    });
  });
}

// ── Push Outlook state to app tabs ───────────────────────────────────────────

function pushOutlookStateToApp(state) {
  storeGet([K.appUrl], function(r) {
    var customUrl = r[K.appUrl] || null;
    chrome.tabs.query({}, function(tabs) {
      var now = Date.now();
      tabs.filter(function(t) { return t.id && t.url && isAppTab(t.url, customUrl); })
        .forEach(function(tab) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: function(s, ts) {
              localStorage.setItem('cal-bridge-v2-outlook-state', s);
              localStorage.setItem('cal-bridge-v2-ext-ts', String(ts));
              window.dispatchEvent(new StorageEvent('storage', { key: 'cal-bridge-v2-outlook-state', newValue: s }));
            },
            args: [state, now],
          }).catch(function() {});
        });
    });
  });
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {

  if (msg.type === 'CAL_V2_EVENTS' && Array.isArray(msg.events)) {
    appendLog('CAL_V2_EVENTS', msg.events.length + ' eventi raw');
    var now = msg.ts || Date.now();
    storeGet([K.events, K.rawEvents], function(r) {
      var existing   = r[K.events]    || [];
      var rawExisting = r[K.rawEvents] || [];
      var rawCutoff  = now - 2 * 24 * 60 * 60 * 1000;
      var rawById    = {};
      rawExisting.forEach(function(e) { if (e.id) rawById[e.id] = e; });
      msg.events.forEach(function(e)  { if (e.id) rawById[e.id] = e; });
      var rawMerged = Object.values(rawById).filter(function(e) {
        return !e.end || new Date(e.end).getTime() > rawCutoff;
      });

      // Sync window: CAL_SYNC_PAST_HOURS=-24h to CAL_SYNC_FUTURE_DAYS=+7d (appConfig.ts)
      var winStart = now - 24 * 60 * 60 * 1000;
      var winEnd   = now + 7  * 24 * 60 * 60 * 1000;
      var byId = {};
      existing.forEach(function(e) { if (e.id) byId[e.id] = e; });
      rawMerged.forEach(function(e) {
        if (!e.id) return;
        var s = e.start ? new Date(e.start).getTime() : 0;
        var n = e.end   ? new Date(e.end).getTime()   : s;
        if (n >= winStart && s <= winEnd) byId[e.id] = e;
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
      if (msg.events.length > 0) { update[K.getState] = 'ok'; update[K.getTs] = now; update[K.getError] = ''; }
      appendLog('EVENTS_STORED', 'raw=' + rawMerged.length + ' app=' + merged.length + ' (finestra -24h/+7d)');
      chrome.storage.local.set(update);
      if (merged.length > 0) pushToApp(merged);
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'CAL_V2_GET_IDLE') {
    appendLog('GET_IDLE', 'direct call saltata');
    chrome.storage.local.set({ [K.getState]: 'idle', [K.getError]: '' });
    pushOutlookStateToApp('idle');
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'CAL_V2_GET_ERROR') {
    appendLog('GET_ERROR', msg.reason || 'errore sconosciuto');
    chrome.storage.local.set({ [K.getState]: 'error', [K.getTs]: msg.ts || Date.now(), [K.getError]: msg.reason || 'errore' });
    pushOutlookStateToApp('error');
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'CAL_V2_LOG') {
    appendLog('CS', msg.msg || '');
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'CAL_V2_ENRICH' && msg.id) {
    storeGet([K.events], function(r) {
      var events = (r[K.events] || []).map(function(e) {
        if (e.id === msg.id && msg.onlineMeetingUrl) return Object.assign({}, e, { onlineMeetingUrl: msg.onlineMeetingUrl });
        return e;
      });
      chrome.storage.local.set({ [K.events]: events });
      pushToApp(events);
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'V2_GET_STATUS') {
    storeGet(Object.values(K), function(r) {
      sendResponse({
        seenAt:     r[K.seenAt]    || null,
        count:      r[K.count]     || 0,
        appSeenAt:  r[K.appSeenAt] || null,
        syncedAt:   r[K.syncedAt]  || null,
        appUrl:     r[K.appUrl]    || '',
        interval:   r[K.interval]  || DEFAULT_INTERVAL_MIN,
        events:     r[K.events]    || [],
        rawEvents:  r[K.rawEvents] || [],
        rawTs:      r[K.rawTs]     || null,
        getState:   r[K.getState]  || 'idle',
        getTs:      r[K.getTs]     || null,
        getError:   r[K.getError]  || '',
        postState:  r[K.postState] || 'idle',
        postTs:     r[K.postTs]    || null,
        log:        r[K.log]       || [],
        outlookUrl: r[K.outlookUrl] || DEFAULT_OUTLOOK_URL,
      });
    });
    return true;
  }

  if (msg.type === 'V2_SYNC_NOW') {
    appendLog('SYNC_NOW', 'dal popup');
    var syncTs = Date.now();
    chrome.storage.local.set({ [K.getState]: 'fetching', [K.getTs]: syncTs });
    pushOutlookStateToApp('fetching');
    chrome.tabs.query({}, function(tabs) {
      var hasOutlook = false;
      for (var i = 0; i < tabs.length; i++) {
        if (!isOutlookTab(tabs[i].url)) continue;
        hasOutlook = true;
        chrome.scripting.executeScript({
          target: { tabId: tabs[i].id },
          func: function() { window.postMessage({ type: '__CAL_V2_DO_SYNC__' }, '*'); },
        }).catch(function() {
          chrome.storage.local.set({ [K.getState]: 'error', [K.getTs]: Date.now() });
          pushOutlookStateToApp('error');
        });
        break;
      }
      if (!hasOutlook) {
        chrome.storage.local.set({ [K.getState]: 'error', [K.getTs]: Date.now() });
        pushOutlookStateToApp('error');
      }
    });
    storeGet([K.events], function(r) {
      var events = r[K.events] || [];
      if (events.length > 0) pushToApp(events);
      sendResponse({ ok: true, count: events.length });
    });
    return true;
  }

  if (msg.type === 'V2_SAVE_URL') {
    chrome.storage.local.set({ [K.appUrl]: msg.url || '' });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'V2_SET_INTERVAL') {
    var min = Math.max(1, Number(msg.minutes) || DEFAULT_INTERVAL_MIN);
    chrome.storage.local.set({ [K.interval]: min });
    chrome.alarms.create('v3_resync', { periodInMinutes: min });
    sendResponse({ ok: true, minutes: min });
    return;
  }

  if (msg.type === 'V2_RELOAD_OUTLOOK') {
    reloadOutlookTab(function(found) { sendResponse({ ok: true, found: found }); });
    return true;
  }

  // Cambia URL Outlook target
  if (msg.type === 'V3_SAVE_OUTLOOK_URL') {
    var newUrl = msg.url === ALT_OUTLOOK_URL ? ALT_OUTLOOK_URL : DEFAULT_OUTLOOK_URL;
    chrome.storage.local.set({ [K.outlookUrl]: newUrl });
    appendLog('OUTLOOK_URL_CHANGED', newUrl);
    sendResponse({ ok: true, url: newUrl });
    return;
  }
});

// ── Alarm ─────────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name !== 'v3_resync') return;
  appendLog('ALARM', 'auto-sync');

  storeGet([K.events], function(r) {
    var events = r[K.events] || [];
    if (events.length > 0) pushToApp(events);
  });

  chrome.tabs.query({}, function(tabs) {
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      if (!isOutlookTab(tab.url)) continue;
      if (isLiveConsumerTab(tab.url)) {
        if (!tab.active) {
          appendLog('ALARM_RELOAD', 'live.com non attiva -> ricarico');
          chrome.tabs.reload(tab.id);
        } else {
          appendLog('ALARM_SKIP', 'live.com attiva -> skip');
        }
      } else {
        // cloud.microsoft / office.com: DO_SYNC diretto
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
    chrome.alarms.create('v3_resync', { periodInMinutes: r[K.interval] || DEFAULT_INTERVAL_MIN });
  });
}

chrome.runtime.onInstalled.addListener(function() {
  initAlarm();
  setTimeout(function() { reloadOutlookTab(null); }, 1000);
});

initAlarm();
