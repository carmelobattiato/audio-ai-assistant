'use strict';

const DEFAULT_APP_PATTERNS = ['localhost:3000', 'localhost:5173', 'localhost:8090', '127.0.0.1:8090', '127.0.0.1:3000', '127.0.0.1:5173'];

const K = {
  calendarData:      'calendarData',
  outlookSeenAt:     'outlookSeenAt',
  outlookCount:      'outlookCount',
  appSeenAt:         'appSeenAt',
  syncedAt:          'syncedAt',
  syncedCount:       'syncedCount',
  appUrl:            'appUrl',
};

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {

  if (msg.type === 'CALENDAR_SYNC' && Array.isArray(msg.appointments)) {
    const now = Date.now();
    // Always update outlookSeenAt (keeps "Connesso" status alive).
    // Only overwrite stored data + count when we have events — prevents
    // empty service.svc responses from wiping a valid result.
    const updates = { [K.outlookSeenAt]: now };
    if (msg.appointments.length > 0) {
      updates[K.calendarData] = msg.appointments;
      updates[K.outlookCount] = msg.appointments.length;
    }
    chrome.storage.local.set(updates);
    if (msg.appointments.length > 0) broadcastToAppTabs(msg.appointments);
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'GET_STATUS') {
    chrome.storage.local.get(Object.values(K), function (r) {
      sendResponse({
        outlookSeenAt:  r[K.outlookSeenAt]  || null,
        outlookCount:   r[K.outlookCount]   || 0,
        appSeenAt:      r[K.appSeenAt]      || null,
        syncedAt:       r[K.syncedAt]       || null,
        syncedCount:    r[K.syncedCount]    || 0,
        appUrl:         r[K.appUrl]         || '',
      });
    });
    return true;
  }

  if (msg.type === 'SYNC_NOW') {
    chrome.storage.local.get([K.calendarData], function (r) {
      const appts = r[K.calendarData] || [];
      broadcastToAppTabs(appts).then(function (found) {
        sendResponse({ ok: true, count: appts.length, appFound: found });
      });
    });
    return true;
  }

  if (msg.type === 'SAVE_APP_URL') {
    chrome.storage.local.set({ [K.appUrl]: msg.url || null });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'RELOAD_OUTLOOK') {
    chrome.tabs.query({}, function (tabs) {
      for (const t of tabs) {
        if (t.url && (t.url.includes('outlook.live.com') || t.url.includes('outlook.office.com'))) {
          chrome.tabs.reload(t.id);
          break;
        }
      }
    });
    sendResponse({ ok: true });
    return;
  }
});

// ── Broadcast to app tabs ─────────────────────────────────────────────────────
async function broadcastToAppTabs(appointments) {
  const r = await chromeStorageGet([K.appUrl]);
  const customUrl = r[K.appUrl] || null;
  const tabs = await chrome.tabs.query({});
  let found = false;

  for (const tab of tabs) {
    if (!tab.id || !tab.url || !isAppTab(tab.url, customUrl)) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function (data) {
          const bc = new BroadcastChannel('calendar-sync-v1');
          bc.postMessage({ type: 'appointments', appointments: data });
          bc.close();
        },
        args: [appointments],
      });
      found = true;
    } catch (_) {}
  }

  if (found) {
    const now = Date.now();
    chrome.storage.local.set({
      [K.appSeenAt]:   now,
      [K.syncedAt]:    now,
      [K.syncedCount]: appointments.length,
    });
  }
  return found;
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
async function sendHeartbeat() {
  const r = await chromeStorageGet([K.appUrl]);
  const customUrl = r[K.appUrl] || null;
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (!tab.id || !tab.url || !isAppTab(tab.url, customUrl)) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function () {
          const bc = new BroadcastChannel('calendar-sync-v1');
          bc.postMessage({ type: 'extension-heartbeat' });
          bc.close();
        },
      });
      chrome.storage.local.set({ [K.appSeenAt]: Date.now() });
    } catch (_) {}
  }
}

// ── Re-broadcast cached data every 15 min ────────────────────────────────────
async function periodicResync() {
  const r = await chromeStorageGet([K.calendarData]);
  const appts = r[K.calendarData] || [];
  if (appts.length > 0) broadcastToAppTabs(appts);
  sendHeartbeat();
}

// ── Alarms ────────────────────────────────────────────────────────────────────
chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });   // every 30s
chrome.alarms.create('resync',    { periodInMinutes: 15 });     // every 15 min

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === 'heartbeat') sendHeartbeat();
  if (alarm.name === 'resync')    periodicResync();
});

chrome.runtime.onInstalled.addListener(function () {
  sendHeartbeat();
  // Ensure alarms exist after extension update
  chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
  chrome.alarms.create('resync',    { periodInMinutes: 15 });
});
chrome.runtime.onStartup.addListener(sendHeartbeat);

// ── Helpers ───────────────────────────────────────────────────────────────────
function chromeStorageGet(keys) {
  return new Promise(function (resolve) {
    chrome.storage.local.get(keys, resolve);
  });
}

function isAppTab(url, customUrl) {
  if (customUrl) {
    try {
      const host = new URL(customUrl).host;
      if (url.includes(host)) return true;
    } catch (_) {}
  }
  return DEFAULT_APP_PATTERNS.some(function (p) { return url.includes(p); });
}
