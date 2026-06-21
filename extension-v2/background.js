'use strict';
// Calendar Bridge v2 — background.js

var DEFAULT_INTERVAL_MIN = 1;
var APP_PATTERNS = ['localhost', '127.0.0.1'];

var K = {
  events:    'v2_events',
  seenAt:    'v2_seenAt',
  count:     'v2_count',
  appSeenAt: 'v2_appSeenAt',
  syncedAt:  'v2_syncedAt',
  appUrl:    'v2_appUrl',
  interval:  'v2_interval',
  getState:  'v2_getState',
  getTs:     'v2_getTs',
  postState: 'v2_postState',
  postTs:    'v2_postTs',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function storeGet(keys, cb) {
  chrome.storage.local.get(Array.isArray(keys) ? keys : [keys], cb);
}

function isAppTab(url, customUrl) {
  if (customUrl && url.startsWith(customUrl)) return true;
  return APP_PATTERNS.some(function(p) { return url.indexOf(p) !== -1; });
}

function isOutlookTab(url) {
  return url && (url.indexOf('outlook.live.com') !== -1 || url.indexOf('outlook.office.com') !== -1);
}

// ── Reload Outlook tab ────────────────────────────────────────────────────────

function reloadOutlookTab(cb) {
  chrome.tabs.query({}, function(tabs) {
    var found = false;
    for (var i = 0; i < tabs.length; i++) {
      if (isOutlookTab(tabs[i].url)) {
        chrome.tabs.reload(tabs[i].id);
        found = true;
        break;
      }
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

      function done(ok) {
        if (ok) success++;
        remaining--;
        if (remaining === 0) {
          var finalTs = Date.now();
          if (success > 0) {
            chrome.storage.local.set({
              [K.appSeenAt]: now,
              [K.syncedAt]:  now,
              [K.postState]: 'ok',
              [K.postTs]:    finalTs,
            });
          } else {
            chrome.storage.local.set({ [K.postState]: 'error', [K.postTs]: finalTs });
          }
        }
      }

      appTabs.forEach(function(tab) {
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
        }).then(function() { done(true); }).catch(function() { done(false); });
      });
    });
  });
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {

  // Nuovi eventi da content-outlook.js
  if (msg.type === 'CAL_V2_EVENTS' && Array.isArray(msg.events)) {
    var now = msg.ts || Date.now();
    var update = {
      [K.events]: msg.events,
      [K.seenAt]: now,
      [K.count]:  msg.events.length,
    };
    if (msg.events.length > 0) {
      update[K.getState] = 'ok';
      update[K.getTs]    = now;
    }
    chrome.storage.local.set(update);
    if (msg.events.length > 0) pushToApp(msg.events);
    sendResponse({ ok: true });
    return;
  }

  // Errore GET da content-outlook.js
  if (msg.type === 'CAL_V2_GET_ERROR') {
    chrome.storage.local.set({ [K.getState]: 'error', [K.getTs]: msg.ts || Date.now() });
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
        getState:  r[K.getState]  || 'idle',
        getTs:     r[K.getTs]     || null,
        postState: r[K.postState] || 'idle',
        postTs:    r[K.postTs]    || null,
      });
    });
    return true;
  }

  // Sync now: triggers active GetCalendarView call via content script
  if (msg.type === 'V2_SYNC_NOW') {
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
    reloadOutlookTab(function() { sendResponse({ ok: true }); });
    return true;
  }
});

// ── Alarm ─────────────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name !== 'v2_resync') return;
  var alarmTs = Date.now();
  chrome.storage.local.set({ [K.getState]: 'fetching', [K.getTs]: alarmTs });
  chrome.tabs.query({}, function(tabs) {
    for (var i = 0; i < tabs.length; i++) {
      if (isOutlookTab(tabs[i].url)) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[i].id },
          func: function() { window.postMessage({ type: '__CAL_V2_DO_SYNC__' }, '*'); },
        }).catch(function() {
          chrome.storage.local.set({ [K.getState]: 'error', [K.getTs]: Date.now() });
        });
        break;
      }
    }
  });
  storeGet([K.events], function(r) {
    var events = r[K.events] || [];
    if (events.length > 0) pushToApp(events);
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
