// content-teams.js — Teams Bridge v1
// MAIN world: teams.microsoft.com · teams.cloud.microsoft (enterprise)
//             teams.live.com (consumer)
//
// Strategia token:
//   graphToken  = token da richieste a graph.microsoft.com → usato per /me/chats
//   teamsToken  = token da richieste a Teams API interne   → usato per chiamate stessa-origine
//
// /communications/calls NON viene usato: richiede Calls.Read a livello di app,
// mai disponibile da token UI (sia enterprise che consumer → 401/403).
//
// Partecipanti: response-intercept sulle API interne Teams + fallback DOM.
// Chat:         /me/chats via graphToken (se disponibile) + response-intercept.

(function() {
  'use strict';

  var V          = '[teams-bridge v1]';
  var POLL_MS    = 30000;
  var GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

  var host        = window.location.hostname;
  var IS_CONSUMER = host.indexOf('teams.live.com') !== -1;
  var VARIANT     = IS_CONSUMER ? 'consumer' : 'enterprise';

  // Due bucket separati
  var graphToken            = null;   // solo per graph.microsoft.com
  var graphChatBlocked      = false;  // true dopo 403 su /me/chats
  var graphCalendarBlocked  = false;  // true dopo 403 su /me/calendarView
  var graphIsServiceAccount = false;  // true se /me ritorna un service account: blocco permanente
  var teamsToken            = null;   // per API interne Teams
  var pollTimer             = null;
  var isSharingScreen = false;

  // Dati estratti passivamente (response-intercept)
  var passiveParticipants = [];
  var passiveChat         = null;
  var passiveCallId       = null;
  var passiveCalendar     = [];

  // ── Logging ───────────────────────────────────────────────────────────────────

  function log(msg) {
    var full = V + ' [' + VARIANT + '] ' + msg;
    console.log(full);
    window.postMessage({ type: '__TEAMS_V1_LOG__', msg: full }, '*');
  }

  // ── Fetch override ────────────────────────────────────────────────────────────

  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url  = (typeof input === 'string') ? input : (input && input.url) || '';
    var args = arguments;

    if (init && init.headers) {
      var auth = extractBearer(init.headers);
      if (auth) updateToken(auth, url);
    }

    var promise = origFetch.apply(this, args);

    // Intercetta response body per API Teams interne (tutti i variant)
    if (isTeamsInternalUrl(url)) {
      promise = promise.then(function(response) {
        var clone = response.clone();
        clone.json().then(function(data) {
          handleTeamsResponse(url, data);
        }).catch(function() {});
        return response;
      });
    }

    return promise;
  };

  // XHR — intercetta header Auth E response body
  var origOpen      = XMLHttpRequest.prototype.open;
  var origSend      = XMLHttpRequest.prototype.send;
  var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._teamsUrl = url || '';
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (name && name.toLowerCase() === 'authorization' && value && value.startsWith('Bearer ')) {
      updateToken(value, this._teamsUrl || '');
    }
    return origSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    var url = this._teamsUrl || '';
    if (isTeamsInternalUrl(url)) {
      this.addEventListener('load', function() {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
          try {
            var data = JSON.parse(xhr.responseText);
            handleTeamsResponse(url, data);
          } catch(e) {}
        }
      });
    }
    return origSend.apply(this, arguments);
  };

  // ── Token management ──────────────────────────────────────────────────────────

  function extractBearer(headers) {
    if (!headers) return null;
    if (typeof headers.get === 'function') {
      var v = headers.get('authorization') || headers.get('Authorization');
      return (v && v.startsWith('Bearer ')) ? v : null;
    }
    if (typeof headers === 'object') {
      var k = Object.keys(headers).find(function(h) { return h.toLowerCase() === 'authorization'; });
      if (k && headers[k] && headers[k].startsWith('Bearer ')) return headers[k];
    }
    return null;
  }

  function updateToken(auth, url) {
    if (!url || !auth) return;

    // Token Graph: solo da richieste VERSO graph.microsoft.com
    if (url.indexOf('graph.microsoft.com') !== -1) {
      if (auth !== graphToken) {
        graphToken = auth;
        // Non resettare i flag se è già confermato un service account
        if (!graphIsServiceAccount) {
          graphChatBlocked     = false;
          graphCalendarBlocked = false;
          _graphDiagDone       = false;
          log('graphToken catturato — può usare /me/chats e /me/calendarView');
          if (!pollTimer) {
            startPolling();
          } else {
            doPollGraph();
          }
        }
      }
      return;
    }

    // Token Teams interni (non usati per Graph, ma catturati per logging)
    var teamsOrigins = [
      'api.teams.microsoft.com', 'teams.microsoft.com', 'teams.live.com',
      'teams.cloud.microsoft', 'chatsvcagg.teams.microsoft.com',
      'presence.teams.microsoft.com', 'asyncgw.teams.microsoft.com',
    ];
    var relevant = teamsOrigins.some(function(d) { return url.indexOf(d) !== -1; });
    if (relevant && auth !== teamsToken) {
      teamsToken = auth;
      log('teamsToken catturato (API interna) — ' + url.replace(/\?.*/, '').substring(0, 70));
      // Avvia polling anche con solo teamsToken (useremo DOM + response-intercept)
      if (!pollTimer) startPolling();
    }
  }

  // ── Response interception (tutti i variant) ───────────────────────────────────

  function isTeamsInternalUrl(url) {
    if (!url) return false;
    // URL assoluti
    if (url.indexOf('teams.cloud.microsoft/api/')     !== -1 ||
        url.indexOf('teams.microsoft.com/api/')       !== -1 ||
        url.indexOf('teams.live.com/api/')            !== -1 ||
        url.indexOf('chatsvcagg.teams.microsoft.com') !== -1 ||
        url.indexOf('api.teams.microsoft.com')        !== -1) return true;
    // URL relativi (XHR su stessa origine)
    return url.startsWith('/api/') ||
           url.startsWith('/v1/')  ||
           url.startsWith('/v2/');
  }

  function handleTeamsResponse(url, data) {
    if (!data) return;
    var shortUrl = url.replace(/\?.*/, '').replace(/^https?:\/\/[^/]+/, '').substring(0, 60);
    // Log ogni URL intercettato (aiuta a scoprire le API interne Teams)
    log('intercept: ' + shortUrl);

    // Partecipanti / Roster
    if (/\/(participants|roster|members|attendees|callers)/i.test(url) ||
        url.indexOf('/calls/') !== -1) {
      var parts = extractParticipants(data);
      if (parts && parts.length) {
        log('intercettati ' + parts.length + ' partecipanti da ' + shortUrl);
        passiveParticipants = parts;
        schedulePush();
      }
    }

    // Chat / Messaggi
    if (/\/(messages|chats|conversations|threads)/i.test(url)) {
      var msgs = extractChatMessages(data);
      if (msgs && msgs.length) {
        var chatId = extractChatId(url) || 'teams-chat';
        log('intercettati ' + msgs.length + ' messaggi da ' + shortUrl);
        passiveChat = { chatId: chatId, messages: msgs };
        schedulePush();
      }
    }

    // Calendario / eventi
    if (/\/(calendar|events|meetings|schedule|calendarView)/i.test(url)) {
      var evts = extractCalendarEvents(data);
      if (evts && evts.length) {
        log('intercettate ' + evts.length + ' riunioni da ' + shortUrl);
        passiveCalendar = evts;
        schedulePush();
      }
    }

    // Call ID
    var cid = extractCallId(url, data);
    if (cid && cid !== passiveCallId) {
      passiveCallId = cid;
      log('callId intercettato: ' + String(cid).substring(0, 50));
      schedulePush();
    }
  }

  var pushScheduled = false;
  function schedulePush() {
    if (pushScheduled) return;
    pushScheduled = true;
    setTimeout(function() {
      pushScheduled = false;
      pushCurrentState();
    }, 200);
  }

  // ── Extractors ────────────────────────────────────────────────────────────────

  function extractParticipants(obj) {
    if (!obj) return null;
    var candidates = null;
    if (Array.isArray(obj)) candidates = obj;
    else {
      var keys = ['participants', 'roster', 'members', 'attendees', 'callers', 'value', 'users'];
      for (var i = 0; i < keys.length; i++) {
        if (obj[keys[i]] && Array.isArray(obj[keys[i]])) { candidates = obj[keys[i]]; break; }
      }
    }
    if (!candidates) return null;
    var res = candidates.map(mapToParticipant).filter(Boolean);
    return res.length ? res : null;
  }

  function mapToParticipant(p) {
    if (!p || typeof p !== 'object') return null;
    var name = p.displayName || p.name || p.userDisplayName || p.givenName ||
               (p.user && p.user.displayName) ||
               (p.info && p.info.displayName) ||
               (p.identity && (p.identity.displayName || (p.identity.user && p.identity.user.displayName)));
    if (!name || typeof name !== 'string' || name.trim().length < 1) return null;
    return {
      id:          String(p.id || p.userId || p.objectId || name),
      displayName: name.trim(),
      isInLobby:   !!(p.isInLobby || p.inLobby),
      isMuted:     !!(p.isMuted || p.muted),
    };
  }

  function extractChatMessages(obj) {
    if (!obj) return null;
    var arr = Array.isArray(obj) ? obj
            : (obj.messages && Array.isArray(obj.messages)) ? obj.messages
            : (obj.value    && Array.isArray(obj.value))    ? obj.value
            : null;
    if (!arr || !arr.length) return null;
    return arr.slice(-20).map(function(m) {
      if (!m || typeof m !== 'object') return null;
      var body = m.content || (m.body && (m.body.content || m.body)) || m.text || m.message || '';
      if (typeof body === 'object') body = body.content || body.text || '';
      body = String(body).replace(/<[^>]+>/g, '').trim();
      var from = m.from || m.sender || m.author || '';
      if (typeof from === 'object') from = from.displayName || from.name || (from.user && from.user.displayName) || '';
      if (!body && !from) return null;
      return {
        id:              String(m.id || m.messageId || ''),
        from:            String(from || 'Unknown'),
        body:            body,
        createdDateTime: m.createdDateTime || m.timestamp || m.sentTime || '',
      };
    }).filter(Boolean);
  }

  function extractCallId(url, data) {
    // Prima prova a estrarre dall'URL
    var m = url.match(/\/calls?\/([a-zA-Z0-9%._:-]{8,})/);
    if (m) return decodeURIComponent(m[1]).substring(0, 80);
    // Poi dal body
    if (data && typeof data === 'object') {
      return data.callId || data.threadId || (data.call && data.call.id) || null;
    }
    return null;
  }

  function extractCalendarEvents(obj) {
    if (!obj) return null;
    var arr = Array.isArray(obj)                              ? obj
            : (obj.events   && Array.isArray(obj.events))    ? obj.events
            : (obj.meetings && Array.isArray(obj.meetings))  ? obj.meetings
            : (obj.value    && Array.isArray(obj.value))     ? obj.value
            : null;
    if (!arr || !arr.length) return null;
    var now = Date.now();
    return arr.map(function(e) {
      if (!e || typeof e !== 'object') return null;
      var subject = e.subject || e.title || e.name || '';
      if (!subject) return null;
      var startRaw = (e.start && (e.start.dateTime || e.start)) || e.startTime || '';
      var endRaw   = (e.end   && (e.end.dateTime   || e.end))   || e.endTime   || '';
      // skip se finito da più di 1 ora
      if (endRaw && (now - new Date(endRaw).getTime()) > 3600000) return null;
      var joinUrl  = (e.onlineMeeting && e.onlineMeeting.joinUrl) || e.joinUrl || e.onlineMeetingUrl || '';
      var org = e.organizer;
      var organizer = (org && (
        (org.emailAddress && org.emailAddress.name) || org.displayName || org.name
      )) || '';
      return {
        id:        String(e.id || subject),
        subject:   String(subject),
        start:     String(startRaw),
        end:       String(endRaw),
        joinUrl:   joinUrl  || undefined,
        organizer: organizer || undefined,
      };
    }).filter(Boolean).slice(0, 10);
  }

  function extractChatId(url) {
    var m = url.match(/\/chats?\/([a-zA-Z0-9%@:._-]{10,})/);
    return m ? decodeURIComponent(m[1]).substring(0, 80) : null;
  }

  // ── DOM scraping (fallback universale) ────────────────────────────────────────

  function getParticipantsDOM() {
    var selectors = [
      '[data-tid="participant-item"]', '[data-tid="roster-participant"]',
      '[class*="participantItem"]',    '[class*="ParticipantItem"]',
    ];
    var nodes = [];
    for (var i = 0; i < selectors.length; i++) {
      var f = document.querySelectorAll(selectors[i]);
      if (f.length) { nodes = Array.from(f); break; }
    }
    var res = nodes.map(function(n) {
      var nameEl = n.querySelector('[data-tid="participant-name"],[class*="participantName"],[class*="ParticipantName"]');
      var name   = nameEl ? nameEl.textContent.trim() : n.textContent.trim().split('\n')[0].trim();
      if (!name || name.length > 80) return null;
      return { id: name, displayName: name,
        isInLobby: n.textContent.toLowerCase().indexOf('lobby') !== -1,
        isMuted:   !!n.querySelector('[data-tid="mic-off"],[class*="micOff"]') };
    }).filter(Boolean);
    if (nodes.length > 0) log('DOM partecipanti: ' + res.length);
    return res;
  }

  // ── Graph: solo /me/chats (funziona con graphToken delegato) ─────────────────

  function tryGraphChat() {
    if (!graphToken || graphChatBlocked) return Promise.resolve(null);
    return origFetch(GRAPH_BASE + '/me/chats?$filter=chatType eq \'meeting\'&$top=5&$orderby=lastUpdatedDateTime desc&$select=id,chatType', {
      headers: { 'Authorization': graphToken, 'Accept': 'application/json' },
    }).then(function(r) {
      if (!r.ok) {
        return r.text().then(function(b) {
          log('/me/chats HTTP ' + r.status + ' — ' + b.substring(0, 120));
          if (r.status === 401) { graphToken = null; graphChatBlocked = false; }
          if (r.status === 403) { graphChatBlocked = true; }
          return null;
        });
      }
      return r.json();
    }).then(function(data) {
      if (!data) return null;
      var chats = (data && data.value) || [];
      log('/me/chats meeting: ' + chats.length);
      if (!chats.length) return null;
      return origFetch(GRAPH_BASE + '/chats/' + chats[0].id + '/messages?$top=20&$orderby=createdDateTime desc', {
        headers: { 'Authorization': graphToken, 'Accept': 'application/json' },
      }).then(function(r2) { return r2.ok ? r2.json() : null; })
        .then(function(msgData) {
          var msgs = (msgData && msgData.value) || [];
          log('messaggi chat Graph: ' + msgs.length);
          return msgs.length ? {
            chatId: chats[0].id,
            messages: msgs.map(function(m) {
              var from = m.from && m.from.user;
              return { id: m.id || '', from: (from && from.displayName) || 'Unknown',
                body: m.body && m.body.content ? m.body.content.replace(/<[^>]+>/g, '') : '',
                createdDateTime: m.createdDateTime || '' };
            }).reverse(),
          } : null;
        });
    }).catch(function(e) { log('Graph chat error: ' + e.message); return null; });
  }

  // ── Graph: /me/calendarView (oggi) ───────────────────────────────────────────

  function tryGraphCalendar() {
    if (!graphToken || graphCalendarBlocked) return Promise.resolve(null);
    var d     = new Date();
    var start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    // 7 giorni avanti — cattura anche riunioni future questa settimana
    var end   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).toISOString();
    var url   = GRAPH_BASE + '/me/calendarView'
              + '?startDateTime=' + encodeURIComponent(start)
              + '&endDateTime='   + encodeURIComponent(end)
              + '&$select=id,subject,start,end,organizer,onlineMeeting'
              + '&$orderby=start%2FdateTime&$top=20';
    return origFetch(url, {
      headers: { 'Authorization': graphToken, 'Accept': 'application/json' },
    }).then(function(r) {
      if (!r.ok) {
        return r.text().then(function(b) {
          log('/me/calendarView HTTP ' + r.status + ' — ' + b.substring(0, 120));
          if (r.status === 401) { graphToken = null; }
          if (r.status === 403) { graphCalendarBlocked = true; }
          return null;
        });
      }
      return r.json();
    }).then(function(data) {
      if (!data) return null;
      var total = (data.value || []).length;
      var evts  = extractCalendarEvents(data);
      log('/me/calendarView: ' + total + ' eventi raw → ' + (evts ? evts.length : 0) + ' validi (7gg)');
      return evts && evts.length ? evts : null;
    }).catch(function(e) { log('Graph calendar error: ' + e.message); return null; });
  }

  // ── Screen share ──────────────────────────────────────────────────────────────

  function detectScreenShare() {
    var url = window.location.href;
    var s = url.indexOf('screen-sharing') !== -1 || url.indexOf('screensharing') !== -1 ||
            !!document.querySelector('[data-tid="presenting-indicator"],[class*="presentingIndicator"]');
    if (s !== isSharingScreen) { isSharingScreen = s; log('screen share: ' + s); }
    return isSharingScreen;
  }

  // ── Call ID da URL ────────────────────────────────────────────────────────────

  function callIdFromUrl() {
    var m = window.location.href.match(/[/#]call[s]?\/([a-zA-Z0-9%._:-]{8,})/);
    return m ? decodeURIComponent(m[1]).substring(0, 80) : null;
  }

  function isMeetingUrl(url) {
    return url.indexOf('/meeting/')      !== -1 || url.indexOf('/_#/callscreen') !== -1 ||
           url.indexOf('/meetings/')     !== -1 || url.indexOf('/#/call/')       !== -1 ||
           url.indexOf('/v2/#/call')     !== -1 || url.indexOf('/meet/')         !== -1;
  }

  // ── Push stato corrente ───────────────────────────────────────────────────────

  function pushCurrentState(chatOverride) {
    detectScreenShare();
    var urlCallId  = callIdFromUrl();
    var callId     = passiveCallId || urlCallId;
    var parts      = passiveParticipants.length ? passiveParticipants : getParticipantsDOM();

    window.postMessage({
      type:            '__TEAMS_V1_DATA__',
      ts:              Date.now(),
      callId:          callId,
      meetingUrl:      window.location.href,
      participants:    parts,
      chat:            chatOverride !== undefined ? chatOverride : (passiveChat || null),
      isSharingScreen:  isSharingScreen,
      variant:          VARIANT,
      upcomingMeetings: passiveCalendar,
    }, '*');
  }

  // ── Polling (push periodico + Graph chat se disponibile) ─────────────────────

  function startPolling() {
    if (pollTimer) return;
    log('polling avviato — graphToken=' + (graphToken ? 'sì' : 'no') + ' teamsToken=' + (teamsToken ? 'sì' : 'no'));
    doPoll();
    pollTimer = setInterval(doPoll, POLL_MS);
  }

  var _graphDiagDone = false;
  function doPollGraph() {
    // Diagnosi una tantum: identifica il token
    if (!_graphDiagDone) {
      _graphDiagDone = true;
      origFetch(GRAPH_BASE + '/me?$select=displayName,userPrincipalName', {
        headers: { 'Authorization': graphToken, 'Accept': 'application/json' },
      }).then(function(r) {
        if (!r.ok) return r.text().then(function(b) { log('graphToken /me HTTP ' + r.status); });
        return r.json().then(function(d) {
          var name = d.displayName || d.userPrincipalName || '?';
          log('graphToken OK — utente: ' + name);
          // Service account (es. "Office") → non usare per dati utente
          var isServiceAccount = !d.userPrincipalName || d.userPrincipalName.indexOf('@') === -1 ||
                                 name === 'Office' || name === 'Microsoft';
          if (isServiceAccount) {
            log('graphToken è service account — Graph API disabilitata permanentemente');
            graphIsServiceAccount = true;
            graphChatBlocked      = true;
            graphCalendarBlocked  = true;
          } else {
            // Token utente reale: prova chat e calendario
            tryGraphChat().then(function(chat) {
              if (chat) { passiveChat = chat; pushCurrentState(); }
            });
            tryGraphCalendar().then(function(evts) {
              if (evts) { passiveCalendar = evts; pushCurrentState(); }
            });
          }
        });
      }).catch(function(e) { log('graphToken /me error: ' + e.message); });
      return; // primo giro: aspetta diagnosi prima di chiamare Graph
    }
    tryGraphChat().then(function(chat) {
      if (chat) { passiveChat = chat; pushCurrentState(); }
    });
    tryGraphCalendar().then(function(evts) {
      if (evts) { passiveCalendar = evts; pushCurrentState(); }
    });
  }

  function doPoll() {
    pushCurrentState();
    if (graphToken) doPollGraph();
    scrapeCalendarDOM();
  }

  // ── DOM calendar scraper ─────────────────────────────────────────────────────
  // Teams esegue le API calendario in Web Workers (non intercettabili da content
  // script). L'unica fonte affidabile è il DOM renderizzato.

  var _lastCalendarScrape = 0;
  var _calendarDomBlocked = false;

  function scrapeCalendarDOM() {
    if (_calendarDomBlocked) return;
    var now = Date.now();
    if (now - _lastCalendarScrape < 5000) return; // max ogni 5s
    _lastCalendarScrape = now;

    // Cerca il contenitore del calendario Teams (molte versioni del DOM)
    var calContainer = document.querySelector(
      '[data-testid="calendar-surface"],' +
      '[data-tid="calendar-main"],' +
      '[class*="calendarView"],[class*="CalendarView"],' +
      '[class*="calendarSurface"],[class*="CalendarSurface"],' +
      '[aria-label*="Calendar"],[aria-label*="Calendario"]'
    );

    // Selettori per i singoli eventi
    var eventSelectors = [
      '[data-testid*="calendar-event"]',
      '[data-testid*="calendarEvent"]',
      '[data-tid*="calendar-event"]',
      '[data-tid*="calendarEvent"]',
      '[class*="CalendarEventItem"],[class*="calendarEventItem"]',
      '[class*="CalendarEvent_"],[class*="calendarEvent_"]',
      '[class*="eventItem"],[class*="EventItem"]',
      // Fallback: celle di griglia con aria-label che contengono "AM/PM" o orari
      'div[role="button"][aria-label*=":"]',
    ];

    var found = [];
    for (var si = 0; si < eventSelectors.length; si++) {
      var nodes = (calContainer || document).querySelectorAll(eventSelectors[si]);
      if (nodes.length) {
        Array.from(nodes).forEach(function(n) {
          var label = n.getAttribute('aria-label') || '';
          var title = n.textContent.trim().split('\n')[0].trim().substring(0, 80);
          if (!title || title.length < 2) return;
          // evita duplicati per stesso titolo
          if (found.some(function(e) { return e.subject === title; })) return;
          found.push({
            id:        title,
            subject:   title,
            start:     label || '',
            end:       '',
            joinUrl:   undefined,
            organizer: undefined,
          });
        });
        if (found.length) break; // usa il primo selettore che funziona
      }
    }

    // Log diagnostico per trovare i selettori giusti (solo se il calendario è visibile)
    var calViewActive = !!document.querySelector(
      '[data-testid*="calendar"],[data-tid*="calendar"],' +
      '[class*="calendarView"],[class*="CalendarView"],' +
      '[class*="calendarSurface"]'
    );
    if (calViewActive && !found.length) {
      // Prova a loggare le classi degli elementi più probabili per debug
      var grid = document.querySelector('[role="grid"],[role="gridcell"]');
      if (grid) {
        var cls = grid.className ? String(grid.className).substring(0, 80) : '(no class)';
        log('calendar DOM: griglia trovata → ' + cls + ' — nessun evento estratto, aggiungere selettore');
      }
    }

    if (found.length) {
      log('calendar DOM: ' + found.length + ' eventi estratti');
      passiveCalendar = found;
      schedulePush();
    }
  }

  // ── URL watch ─────────────────────────────────────────────────────────────────

  var lastHref = '';
  setInterval(function() {
    var h = window.location.href;
    if (h !== lastHref) {
      lastHref = h;
      log('URL: ' + h.substring(0, 100));
      // Reset partecipanti quando si esce dalla call
      if (!isMeetingUrl(h)) {
        passiveParticipants = [];
        passiveCallId       = null;
      }
      pushCurrentState();
      // Quando cambia vista, aspetta 2s che il DOM carichi, poi scrapa calendario
      setTimeout(scrapeCalendarDOM, 2000);
    }
  }, 1000);

  // MutationObserver: scrapa quando il DOM cambia (Teams SPA aggiorna il contenuto)
  (function() {
    var mo = new MutationObserver(function() { scrapeCalendarDOM(); });
    function attachObserver() {
      var root = document.querySelector('#app-mount,#teams-app-root,#app,body');
      if (root) {
        mo.observe(root, { childList: true, subtree: true });
      } else {
        setTimeout(attachObserver, 500);
      }
    }
    attachObserver();
  })();

  log('init su ' + host);
})();
