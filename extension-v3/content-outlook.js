'use strict';
// Calendar Bridge v3.0 — content-outlook.js (MAIN world, document_start)
// Supporta: outlook.cloud.microsoft (default) e outlook.live.com (legacy)

(function () {

  var V = '[CAL-V3]';
  var WORKER_BC = '__cal_bridge_v3_worker__';

  function csLog(msg) {
    console.log(V, msg);
    window.postMessage({ type: '__CAL_V2_LOG__', msg: msg }, '*');
  }

  // ── Native refs ──────────────────────────────────────────────────────────────
  var _fetch  = window.fetch.bind(window);
  var _Worker = window.Worker;

  // ── State ────────────────────────────────────────────────────────────────────
  var capturedAuth          = null;
  var capturedSessionId     = null;
  var capturedCanary        = null;
  var capturedTimezone      = null;
  var capturedServiceUrl    = null;
  var capturedAnchorMailbox = null;
  var capturedTenantId      = null;
  var directCallDone        = false;
  var pageCallSeen          = false;

  // ── Utils ────────────────────────────────────────────────────────────────────
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }

  function getHeader(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    var lc = name.toLowerCase();
    for (var k in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, k) && k.toLowerCase() === lc) return headers[k];
    }
    return null;
  }

  // ── Hostname helpers ─────────────────────────────────────────────────────────
  var _host = window.location.hostname;

  function isLiveConsumer()   { return _host.indexOf('outlook.live.com') !== -1; }
  function isCloudMicrosoft() { return _host.indexOf('outlook.cloud.microsoft') !== -1; }

  function guessServiceUrl() {
    if (isLiveConsumer())    return 'https://outlook.live.com/owa/0/service.svc';
    if (isCloudMicrosoft())  return 'https://outlook.cloud.microsoft/owa/service.svc';
    return 'https://outlook.office.com/owa/service.svc';
  }

  // ── Leggi canary dal cookie o dal DOM ────────────────────────────────────────
  function readCanaryFromCookie() {
    try {
      var m = document.cookie.match(/X-OWA-CANARY=([^;]+)/i);
      if (m && m[1]) return m[1];
    } catch(_) {}
    return null;
  }

  function readCanaryFromDom() {
    try {
      if (window.OWA && window.OWA.canary) return window.OWA.canary;
    } catch(_) {}
    try {
      if (window.__owa_canary__) return window.__owa_canary__;
    } catch(_) {}
    try {
      var meta = document.querySelector('meta[name="canary"],meta[name="X-OWA-CANARY"]');
      if (meta && meta.content) return meta.content;
    } catch(_) {}
    try {
      if (window.__RequestVerificationToken) return window.__RequestVerificationToken;
    } catch(_) {}
    return null;
  }

  function isOwaBearer(auth) {
    try {
      var parts = auth.replace(/^Bearer\s+/i, '').split('.');
      if (parts.length < 2) return false;
      var pad = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (pad.length % 4) pad += '=';
      var payload = JSON.parse(atob(pad));
      var aud = (payload.aud || '');
      return aud.indexOf('outlook.office.com') !== -1 || aud.indexOf('outlook.live.com') !== -1;
    } catch(_) { return true; }
  }

  // ── Auth capture ─────────────────────────────────────────────────────────────
  function captureCtx(init) {
    try {
      var h = (init && init.headers) || {};
      var auth = getHeader(h, 'authorization');
      if (auth) {
        if (auth.indexOf('MSAuth1.0') !== -1) {
          if (!capturedAuth) csLog('auth MSAuth1.0 catturata');
          capturedAuth = auth;
        } else if (auth.indexOf('Bearer ') !== -1) {
          if (!isOwaBearer(auth)) {
            // skip: token per servizio diverso da OWA (es. Teams Presence, Graph)
          } else {
            if (!capturedAuth) csLog('auth Bearer OWA catturata');
            capturedAuth = auth;
          }
        }
        if (capturedAuth) {
          var sess = getHeader(h, 'x-owa-sessionid');
          if (sess) capturedSessionId = sess;
          var anch = getHeader(h, 'x-anchormailbox');
          if (anch) capturedAnchorMailbox = anch;
          var tid = getHeader(h, 'x-tenantid');
          if (tid) capturedTenantId = tid;
        }
      }
      var canary = getHeader(h, 'x-owa-canary');
      if (canary && !capturedCanary) {
        capturedCanary = canary;
        csLog('canary catturato da header richiesta');
      }
      maybeDirect();
    } catch (_) {}
  }

  // ── Direct call ───────────────────────────────────────────────────────────────
  var _directTimer = null;

  function maybeDirect() {
    if (directCallDone) return;
    if (_directTimer) return; // timer già impostato — non resettare ad ogni fetch
    var consumer = isLiveConsumer();
    var cloudMs  = isCloudMicrosoft();
    // live.com: auth via cookie, basta serviceUrl
    // cloud.microsoft: REST API — serve solo Bearer (no serviceUrl, no canary)
    // office.com: usa MSAuth1.0, serve capturedAuth
    if (consumer && !capturedServiceUrl) { csLog('maybeDirect: in attesa serviceUrl (live.com)'); return; }
    if (cloudMs  && !capturedAuth)        { csLog('maybeDirect: in attesa auth Bearer (cloud.microsoft)'); return; }
    if (!consumer && !cloudMs && !capturedAuth) { csLog('maybeDirect: in attesa auth (office.com)'); return; }
    csLog('maybeDirect: avvio timer 800ms | auth=' + (capturedAuth ? 'si' : 'no') + ' serviceUrl=' + (capturedServiceUrl ? 'si' : 'no'));
    _directTimer = setTimeout(function () {
      _directTimer = null;
      if (!directCallDone && !pageCallSeen) {
        directCallDone = true;
        csLog('maybeDirect: lancio doDirect | host=' + _host + ' | tz=' + (capturedTimezone || 'UTC'));
        doDirect();
      } else {
        csLog('maybeDirect: timer saltato | done=' + directCallDone + ' pageSeen=' + pageCallSeen);
      }
    }, 800);
  }

  function doDirect() {
    var tz  = capturedTimezone || 'UTC';
    var now = new Date();
    var wl  = new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000);
    var yd  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000); // -7gg (era -24h)
    var rs  = fmtDate(yd) + 'T00:00:00.000';
    var re  = fmtDate(wl) + 'T23:59:59.999';

    // cloud.microsoft: usa Outlook REST API v2.0 con Bearer (niente canary)
    if (isCloudMicrosoft() && capturedAuth) {
      // camelCase params, no ms, no $select (evita 400 su campi non selezionabili)
      var rsClean = rs.replace('.000', '');
      var reClean = re.replace('.999', '');
      var apiUrl = 'https://outlook.cloud.microsoft/api/v2.0/me/CalendarView'
        + '?startDateTime=' + rsClean + '&endDateTime=' + reClean
        + '&$top=200';
      csLog('doDirect: REST /api/v2.0/me/CalendarView | range=' + rs.slice(0,10) + '/' + re.slice(0,10));
      _fetch(apiUrl, {
        method: 'GET',
        headers: { 'authorization': capturedAuth, 'accept': 'application/json' },
        credentials: 'include',
      })
      .then(function(r) {
        csLog('doDirect REST: HTTP ' + r.status + (r.ok ? '' : ' ERRORE'));
        if (!r.ok) {
          window.postMessage({ type: '__CAL_V2_GET_ERROR__', ts: Date.now(), reason: 'REST HTTP ' + r.status }, '*');
          directCallDone = false;
          return null;
        }
        return r.json();
      })
      .then(function(json) {
        if (!json) return;
        csLog('doDirect REST: risposta ok, keys=' + Object.keys(json).slice(0,5).join(','));
        dispatch('direct', json);
      })
      .catch(function(e) {
        csLog('doDirect REST: network error -> ' + (e && e.message || 'unknown'));
        directCallDone = false;
      });
      return;
    }

    // live.com / office.com: fallback service.svc
    var reqBody = JSON.stringify({
      __type: 'GetCalendarViewJsonRequest:#Exchange',
      Header: {
        __type: 'JsonRequestHeaders:#Exchange',
        RequestServerVersion: 'V2018_01_08',
        TimeZoneContext: {
          __type: 'TimeZoneContext:#Exchange',
          TimeZoneDefinition: { __type: 'TimeZoneDefinitionType:#Exchange', Id: tz },
        },
      },
      Body: {
        __type: 'GetCalendarViewRequest:#Exchange',
        CalendarId: {
          __type: 'TargetFolderId:#Exchange',
          BaseFolderId: { __type: 'DistinguishedFolderId:#Exchange', Id: 'calendar' },
        },
        RangeStart: rs,
        RangeEnd:   re,
      },
    });

    var baseUrl    = capturedServiceUrl || guessServiceUrl();
    var serviceUrl = baseUrl + '?action=GetCalendarView&app=Calendar&n=v3direct';

    var canary = capturedCanary || readCanaryFromCookie() || readCanaryFromDom();
    if (!canary) csLog('doDirect: ATTENZIONE — canary non disponibile, POST potrebbe fallire con 401');
    else csLog('doDirect: canary=' + canary.slice(0, 8) + '...');

    var headers = {
      'content-type':       'application/json; charset=utf-8',
      'action':             'GetCalendarView',
      'x-owa-actionsource': 'GetCalendarView',
      'x-owa-hosted-ux':    'false',
      'x-req-source':       'Calendar',
    };
    if (capturedAuth) {
      headers['authorization'] = capturedAuth;
      if (capturedSessionId)     headers['x-owa-sessionid']   = capturedSessionId;
      if (capturedAnchorMailbox) headers['x-anchormailbox']   = capturedAnchorMailbox;
      if (capturedTenantId)      headers['x-tenantid']        = capturedTenantId;
    }
    if (canary) headers['x-owa-canary'] = canary;

    console.log(V, 'direct ->', _host, '| tz:', tz, '| canary:', canary ? 'si' : 'NO');
    csLog('doDirect: POST -> ' + serviceUrl.split('?')[0]);

    _fetch(serviceUrl, { method: 'POST', headers: headers, body: reqBody, credentials: 'include', mode: 'cors' })
      .then(function (r) {
        csLog('doDirect: risposta HTTP ' + r.status);
        if (!r.ok) {
          csLog('doDirect: HTTP ' + r.status + ' -> GET_ERROR | canary=' + (canary ? 'si' : 'NO') + ' | auth=' + (capturedAuth ? 'si' : 'NO'));
          directCallDone = false;
          window.postMessage({ type: '__CAL_V2_GET_ERROR__', ts: Date.now(), reason: 'HTTP ' + r.status + (canary ? '' : ' (no canary)') }, '*');
          return null;
        }
        return r.json();
      })
      .then(function (json) {
        if (!json) return;
        // Diagnostica struttura risposta OWA
        try {
          var topKeys = Object.keys(json).join(',');
          var body = json.Body;
          var bodyKeys = body ? Object.keys(body).join(',') : 'n/a';
          var bodyType = body ? (body.__type || '?') : '?';
          csLog('doDirect JSON: topKeys=[' + topKeys + '] bodyKeys=[' + bodyKeys + '] bodyType=' + bodyType);
          if (body && body.ResponseMessages && body.ResponseMessages.Items) {
            var item0 = body.ResponseMessages.Items[0] || {};
            csLog('doDirect ResponseMessages.Items[0] keys=[' + Object.keys(item0).join(',') + '] ResponseCode=' + item0.ResponseCode);
          }
        } catch(de) { csLog('doDirect diag error: ' + de.message); }
        dispatch('direct', json);
      })
      .catch(function (e) {
        csLog('doDirect: catch network error -> ' + (e && e.message || 'unknown'));
        directCallDone = false;
      });
  }

  // ── Range extension ───────────────────────────────────────────────────────────
  function extendRange(init) {
    var headers = init && init.headers;
    var raw = headers ? getHeader(headers, 'x-owa-urlpostdata') : null;
    if (raw) {
      try {
        var decoded = JSON.parse(decodeURIComponent(raw));
        var action  = decoded && decoded.Action;
        var b       = decoded && decoded.Body;
        if (b && b.RangeStart) {
          // Sync window: CAL_SYNC_PAST_HOURS=-24h to CAL_SYNC_FUTURE_DAYS=+7d (appConfig.ts)
          var now = new Date();
          var wl  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          var yd  = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          var old = b.RangeStart;
          b.RangeStart = fmtDate(yd) + 'T00:00:00.000';
          b.RangeEnd   = fmtDate(wl) + 'T23:59:59.999';
          csLog('extendRange [urlpostdata] action=' + (action || '?') + ' | ' + old + ' -> ' + b.RangeStart + '/' + b.RangeEnd);
          var newH = {};
          if (typeof headers.forEach === 'function') headers.forEach(function(v,k){newH[k]=v;});
          else Object.keys(headers).forEach(function(k){newH[k]=headers[k];});
          newH['x-owa-urlpostdata'] = encodeURIComponent(JSON.stringify(decoded));
          return Object.assign({}, init, { headers: newH });
        } else if (action) {
          csLog('extendRange [urlpostdata] action=' + action + ' | nessun RangeStart');
        }
      } catch(e) { csLog('extendRange [urlpostdata] parse error: ' + e.message); }
    }
    if (init && init.body && typeof init.body === 'string') {
      try {
        var parsed = JSON.parse(init.body);
        var bn     = (parsed && parsed.Body) ? parsed.Body : parsed;
        if (bn && bn.RangeStart) {
          var n2   = new Date();
          var w2   = new Date(n2.getTime() + 7 * 24 * 60 * 60 * 1000);
          var y2   = new Date(n2.getTime() - 24 * 60 * 60 * 1000);
          var old2 = bn.RangeStart;
          bn.RangeStart = fmtDate(y2) + 'T00:00:00.000';
          bn.RangeEnd   = fmtDate(w2) + 'T23:59:59.999';
          csLog('extendRange [body] | ' + old2 + ' -> ' + bn.RangeStart + '/' + bn.RangeEnd);
          return Object.assign({}, init, { body: JSON.stringify(parsed) });
        }
      } catch(e) { csLog('extendRange [body] parse error: ' + e.message); }
    }
    return init;
  }

  // ── Event mapping ─────────────────────────────────────────────────────────────
  var TEAMS_RE = /https:\/\/teams\.microsoft\.com\/l\/[^\s<>"']+/;

  function mapOwa(ev) {
    var bodyText = ev.Preview || ev.TextBody || ev.Body || '';
    var loc = (ev.Location && ev.Location.DisplayName) || (typeof ev.Location === 'string' ? ev.Location : '') || '';
    var isTeams = loc === 'Microsoft Teams Meeting' || (ev.Location && ev.Location.Id === 'Microsoft Teams Meeting');
    return {
      id:               (ev.ItemId && ev.ItemId.Id) || ev.UID || String(Math.random()),
      subject:          ev.Subject || '(senza titolo)',
      start:            ev.Start || '',
      end:              ev.End   || '',
      location:         loc,
      organizer:        (ev.Organizer && ev.Organizer.Mailbox && ev.Organizer.Mailbox.Name) || '',
      attendees:        [].concat(ev.RequiredAttendees||[], ev.OptionalAttendees||[]).map(function(a){
        return { name:(a.Mailbox&&a.Mailbox.Name)||'', email:(a.Mailbox&&a.Mailbox.EmailAddress)||'', type:'required' };
      }),
      isAllDay:         ev.IsAllDayEvent || false,
      isMeeting:        ev.IsMeeting || false,
      isCancelled:      ev.IsCancelled || false,
      isTeams:          isTeams,
      onlineMeetingUrl: isTeams ? ((bodyText.match(TEAMS_RE)||[])[0]||'msteams:') : null,
      body:             typeof bodyText === 'string' ? bodyText.slice(0,500) : '',
    };
  }

  function mapGraph(ev) {
    var bt = ev.bodyPreview || '';
    return {
      id:               ev.id || String(Math.random()),
      subject:          ev.subject || '',
      start:            (ev.start && ev.start.dateTime) || '',
      end:              (ev.end   && ev.end.dateTime)   || '',
      location:         (ev.location && ev.location.displayName) || '',
      organizer:        (ev.organizer && ev.organizer.emailAddress && ev.organizer.emailAddress.name) || '',
      attendees:        (ev.attendees||[]).map(function(a){
        return { name:(a.emailAddress&&a.emailAddress.name)||'', email:(a.emailAddress&&a.emailAddress.address)||'', type:a.type==='optional'?'optional':'required' };
      }),
      isAllDay:         ev.isAllDay || false,
      isMeeting:        true,
      isCancelled:      ev.isCancelled || false,
      isTeams:          !!(ev.onlineMeeting && ev.onlineMeeting.joinUrl),
      onlineMeetingUrl: (ev.onlineMeeting && ev.onlineMeeting.joinUrl) || null,
      body:             bt.slice(0,500),
    };
  }

  // Aggiunge 'Z' se TimeZone è UTC e manca il suffisso — evita che JS interpreti come ora locale
  function restDt(obj, fallback) {
    if (!obj) return fallback || '';
    var dt = obj.DateTime || obj.dateTime || '';
    if (!dt) return fallback || '';
    var tz = obj.TimeZone || obj.timeZone || '';
    if (tz === 'UTC' && dt.indexOf('Z') === -1 && dt.indexOf('+') === -1) dt += 'Z';
    return dt;
  }

  // Mappa risposta Outlook REST v2.0 (PascalCase) o Graph (camelCase)
  function mapRest(ev) {
    var startDt = restDt(ev.Start || ev.start, ev.Start || ev.start || '');
    var endDt   = restDt(ev.End   || ev.end,   ev.End   || ev.end   || '');
    var loc     = (ev.Location && ev.Location.DisplayName) || (ev.location && ev.location.displayName)
                || (typeof ev.Location === 'string' ? ev.Location : '') || (typeof ev.location === 'string' ? ev.location : '') || '';
    var isTeams = !!(ev.OnlineMeetingUrl || ev.onlineMeetingUrl || (ev.onlineMeeting && ev.onlineMeeting.joinUrl));
    var joinUrl = ev.OnlineMeetingUrl || ev.onlineMeetingUrl || (ev.onlineMeeting && ev.onlineMeeting.joinUrl) || null;
    return {
      id:               ev.Id || ev.id || String(Math.random()),
      subject:          ev.Subject || ev.subject || '(senza titolo)',
      start:            startDt,
      end:              endDt,
      location:         loc,
      organizer:        (ev.Organizer && ev.Organizer.EmailAddress && ev.Organizer.EmailAddress.Name)
                     || (ev.organizer && ev.organizer.emailAddress && ev.organizer.emailAddress.name) || '',
      attendees:        [].concat(ev.RequiredAttendees || ev.attendees || [], ev.OptionalAttendees || []).map(function(a) {
        return {
          name:  (a.EmailAddress && a.EmailAddress.Name)    || (a.emailAddress && a.emailAddress.name)    || '',
          email: (a.EmailAddress && a.EmailAddress.Address) || (a.emailAddress && a.emailAddress.address) || '',
          type:  'required'
        };
      }),
      isAllDay:         ev.IsAllDay  || ev.isAllDay  || false,
      isMeeting:        ev.IsMeeting !== undefined ? ev.IsMeeting : (ev.isMeeting !== undefined ? ev.isMeeting : true),
      isCancelled:      ev.IsCancelled || ev.isCancelled || false,
      isTeams:          isTeams,
      onlineMeetingUrl: joinUrl,
      body:             ev.BodyPreview || ev.bodyPreview || (ev.body && ev.body.content) || '',
    };
  }

  function tryExtract(json) {
    if (!json || typeof json !== 'object') return null;
    var arr = Array.isArray(json) ? json : json.value;
    if (Array.isArray(arr) && arr.length > 0 && arr[0]) {
      var s0 = arr[0];
      // Outlook REST v2.0 (PascalCase Subject) o Graph (camelCase subject)
      if (typeof s0.Subject === 'string' || typeof s0.subject === 'string') {
        csLog('tryExtract REST/Graph: ' + arr.length + ' eventi');
        return { events: arr.map(mapRest), fmt: 'REST' };
      }
    }
    // value array vuoto ma presente = 0 eventi validi
    if (Array.isArray(arr) && arr.length === 0 && json.value !== undefined) {
      csLog('tryExtract REST/Graph: 0 eventi (array vuoto)');
      return { events: [], fmt: 'REST' };
    }
    var body = json.Body;
    if (body) {
      var btype = body.__type || '?';

      // OWA standard: Body.ResponseMessages.Items[].CalendarView
      if (body.ResponseMessages && body.ResponseMessages.Items && Array.isArray(body.ResponseMessages.Items)) {
        var msgs = body.ResponseMessages.Items;
        var allEvs = [];
        var hasNoError = false;
        for (var mi = 0; mi < msgs.length; mi++) {
          var msg = msgs[mi];
          if (msg.ResponseCode === 'NoError') hasNoError = true;
          var cv = msg.CalendarView || msg.Items || msg.CalendarEvents;
          if (Array.isArray(cv)) allEvs = allEvs.concat(cv);
        }
        csLog('tryExtract OWA ResponseMessages: ' + allEvs.length + ' eventi | type=' + btype);
        return { events: allEvs.map(mapOwa), fmt: 'OWA' };
      }

      var items = body.Items || body.CalendarEvents || body.CalendarItems || body.Events;
      if (Array.isArray(items)) {
        csLog('tryExtract OWA: ' + items.length + ' items | type=' + btype);
        return { events: items.map(mapOwa), fmt: 'OWA' };
      }
      if (body.ResponseCode === 'NoError' || body.Items !== undefined) {
        csLog('tryExtract OWA 0 items | type=' + btype);
        return { events: [], fmt: 'OWA' };
      }
      csLog('tryExtract OWA unrecognized | keys=' + Object.keys(body).slice(0, 10).join(','));
    }
    if (json.data) {
      var data = json.data;
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var v = data[keys[i]];
        if (Array.isArray(v) && v.length > 0 && v[0] && (v[0].subject || v[0].Subject || v[0].start || v[0].Start)) {
          var fmt = (v[0].subject !== undefined) ? 'Graph' : 'OWA';
          return { events: v.map(fmt === 'Graph' ? mapGraph : mapOwa), fmt: 'GQL-' + keys[i] };
        }
      }
    }
    return null;
  }

  function dispatch(source, json) {
    var r = tryExtract(json);
    if (!r) { csLog('dispatch [' + source + ']: formato non riconosciuto'); return; }
    csLog('dispatch [' + source + ']: ' + r.events.length + ' eventi [' + r.fmt + ']');
    if (!r.events.length) return;
    window.postMessage({ type: '__CAL_V2_EVENTS__', events: r.events, ts: Date.now() }, '*');
  }

  // ── fetch override ────────────────────────────────────────────────────────────
  var _fetchCallCount = 0;
  window.fetch = function (input, init) {
    captureCtx(init);
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    _fetchCallCount++;
    if (_fetchCallCount === 1)              csLog('fetch#1 intercettato — override attivo');
    if (_fetchCallCount === 10)             csLog('fetch#10 — ' + _fetchCallCount + ' totali');
    if (_fetchCallCount % 50 === 0)        csLog('fetch#' + _fetchCallCount + ' — override attivo');

    var isServiceSvc = url.indexOf('service.svc') !== -1;
    var hasCalView   = url.indexOf('GetCalendarView') !== -1;

    // Ignora /published/ (calendario condiviso pubblico, non mailbox utente)
    if (isServiceSvc && url.indexOf('/published/') === -1) {
      if (!capturedServiceUrl || capturedServiceUrl.indexOf('/published/') !== -1) {
        capturedServiceUrl = url.split('?')[0];
        csLog('serviceUrl catturato: ' + capturedServiceUrl);
        maybeDirect();
      }
    }

    if (isServiceSvc) {
      csLog('service.svc ' + ((init && init.method) || 'GET') + ' | ' + url.slice(0, 200));
      var urlLabel = hasCalView ? 'URL=GetCalendarView' : url.slice(-60);
      var extended = extendRange(init);
      if (extended !== init) {
        csLog('extendRange applicato! pageCallSeen=true');
        pageCallSeen = true;
        init = extended;
      }
    }

    return _fetch(input, init).then(function (response) {
      try {
        // Cattura canary da response headers (OWA lo restituisce nelle risposte service.svc)
        var respCanary = response.headers.get('X-OWA-CANARY') || response.headers.get('x-owa-canary');
        if (respCanary && !capturedCanary) {
          capturedCanary = respCanary;
          csLog('canary catturato da response header');
        }
        var ct = response.headers.get('content-type') || '';
        if (ct.indexOf('application/json') !== -1) {
          response.clone().json().then(function (json) {
            if (url.indexOf('GetTimeZone') !== -1 && json && json.Body && json.Body.TimeZone) {
              capturedTimezone = json.Body.TimeZone.Id || capturedTimezone;
              csLog('timezone catturata: ' + capturedTimezone);
            }
            if (json && json.Body && json.Body.CurrentTimeZone) {
              capturedTimezone = json.Body.CurrentTimeZone;
              if (directCallDone) { directCallDone = false; maybeDirect(); }
            }
            dispatch('fetch', json);
          }).catch(function () {});
        }
      } catch (_) {}
      return response;
    }).catch(function(e) {
      if (isServiceSvc) csLog('NETWORK ERROR su ' + url.split('?')[0] + ': ' + (e && e.message || 'unknown'));
      throw e;
    });
  };

  // ── XHR override ──────────────────────────────────────────────────────────────
  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var _url  = String(url || '');
    var _this = this;

    if (!capturedServiceUrl && _url.indexOf('service.svc') !== -1) {
      capturedServiceUrl = _url.split('?')[0];
      csLog('XHR: serviceUrl catturato: ' + capturedServiceUrl);
    }

    var _setHeader = _this.setRequestHeader.bind(_this);
    _this.setRequestHeader = function (name, value) {
      if (name && name.toLowerCase() === 'authorization' && value && value.indexOf('MSAuth1.0') !== -1) {
        csLog('XHR: auth MSAuth1.0 catturata');
        capturedAuth = value;
        maybeDirect();
      }
      if (name && name.toLowerCase() === 'x-owa-canary' && value && !capturedCanary) {
        capturedCanary = value;
        csLog('XHR: canary catturato');
      }
      return _setHeader(name, value);
    };

    _this.addEventListener('load', function () {
      if (_this.status < 200 || _this.status >= 300) return;
      var ct = _this.getResponseHeader('content-type') || '';
      if (ct.indexOf('application/json') === -1) return;
      try { dispatch('xhr', JSON.parse(_this.responseText)); } catch (_) {}
    });

    return _xhrOpen.apply(_this, arguments);
  };

  // ── Worker injection ──────────────────────────────────────────────────────────
  var INJECT = '(function(BC){'
    + 'if(typeof self.fetch!=="function")return;'
    + 'var _f=self.fetch.bind(self);var _bc=new BroadcastChannel(BC);'
    + 'self.fetch=async function(i,o){var r=await _f(i,o);'
    + 'try{var ct=r.headers.get("content-type")||"";'
    + 'if(ct.indexOf("application/json")!==-1)r.clone().json().then(function(j){_bc.postMessage({t:"d",j:j});}).catch(function(){});'
    + '}catch(e){}return r;};'
    + '})(' + JSON.stringify(WORKER_BC) + ');';

  var workerBc = new BroadcastChannel(WORKER_BC);
  workerBc.onmessage = function (e) {
    if (e.data && e.data.t === 'd') { dispatch('worker', e.data.j); }
  };

  window.Worker = function PatchedWorker(url, options) {
    if (typeof url === 'string') {
      try {
        var abs  = url.indexOf('blob:') === 0 ? url : (new URL(url, window.location.href)).href;
        var src  = INJECT + '\nimportScripts(' + JSON.stringify(abs) + ');';
        var blob = new Blob([src], { type: 'text/javascript' });
        var burl = URL.createObjectURL(blob);
        var w    = new _Worker(burl, options);
        setTimeout(function () { URL.revokeObjectURL(burl); }, 15000);
        return w;
      } catch (e) { console.warn(V, 'worker inject fail:', e.message); }
    }
    return new _Worker(url, options);
  };
  window.Worker.prototype = _Worker.prototype;

  // ── DO_SYNC handler ───────────────────────────────────────────────────────────
  window.addEventListener('message', function (e) {
    if (!e.data) return;
    if (e.data.type === '__CAL_V2_DO_SYNC__' || e.data.type === '__CAL_BRIDGE_RESYNC__') {
      csLog('DO_SYNC ricevuto | host=' + _host + ' | fetchCount=' + _fetchCallCount);
      directCallDone = false;
      pageCallSeen   = false;
      if (isLiveConsumer() && !capturedServiceUrl) {
        capturedServiceUrl = 'https://outlook.live.com/owa/0/service.svc';
        csLog('DO_SYNC: serviceUrl live.com impostato');
      }
      if (isCloudMicrosoft() && (!capturedServiceUrl || capturedServiceUrl.indexOf('/published/') !== -1)) {
        capturedServiceUrl = 'https://outlook.cloud.microsoft/owa/service.svc';
        csLog('DO_SYNC: serviceUrl cloud.microsoft impostato');
      }
      maybeDirect();
    }
  });

  csLog('v3.0 loaded | host=' + _host);
  console.log(V, 'v3.0 loaded | host=' + _host);

})();
