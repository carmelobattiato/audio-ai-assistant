'use strict';
// Calendar Bridge v2.11 — content-outlook.js (MAIN world, document_start)
// Fix 400 su direct call: include x-owa-canary (da cookie) + MSAuth1.0 anche per consumer

(function () {

  var V = '[CAL-V2]';
  var WORKER_BC = '__cal_bridge_v2_worker__';

  function csLog(msg) {
    console.log(V, msg);
    window.postMessage({ type: '__CAL_V2_LOG__', msg: msg }, '*');
  }

  // ── Native refs ──────────────────────────────────────────────────────────────
  var _fetch  = window.fetch.bind(window);
  var _Worker = window.Worker;

  // ── State ────────────────────────────────────────────────────────────────────
  var capturedAuth       = null;
  var capturedSessionId  = null;
  var capturedCanary     = null;   // x-owa-canary CSRF token — necessario per POST service.svc
  var capturedTimezone   = null;
  var capturedServiceUrl = null;
  var directCallDone     = false;
  var pageCallSeen       = false;

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

  // ── Leggi canary dal cookie (MAIN world, stessa origine) ─────────────────────
  function readCanaryFromCookie() {
    try {
      var m = document.cookie.match(/X-OWA-CANARY=([^;]+)/i);
      if (m && m[1]) return m[1];
    } catch(_) {}
    return null;
  }

  // ── Auth capture ─────────────────────────────────────────────────────────────
  function captureCtx(init) {
    try {
      var h = (init && init.headers) || {};
      var auth = getHeader(h, 'authorization');
      if (auth && auth.indexOf('MSAuth1.0') !== -1) {
        if (!capturedAuth) csLog('auth MSAuth1.0 catturata');
        capturedAuth = auth;
        var sess = getHeader(h, 'x-owa-sessionid');
        if (sess) capturedSessionId = sess;
      }
      var canary = getHeader(h, 'x-owa-canary');
      if (canary && !capturedCanary) {
        capturedCanary = canary;
        csLog('canary catturato da header richiesta');
      }
      // ri-tenta direct call se abbiamo appena ottenuto auth o canary
      maybeDirect();
    } catch (_) {}
  }

  // ── Direct call ───────────────────────────────────────────────────────────────
  var _directTimer = null;

  function maybeDirect() {
    if (directCallDone) return;
    // Per consumer: trigger appena capturedServiceUrl disponibile (auth = cookies, non header)
    // Per corporate: trigger dopo auth capture
    var isConsumer = window.location.hostname.indexOf('outlook.live.com') !== -1;
    if (!isConsumer && !capturedAuth) return;
    if (isConsumer && !capturedServiceUrl) return;
    clearTimeout(_directTimer);
    _directTimer = setTimeout(function () {
      if (!directCallDone && !pageCallSeen) {
        directCallDone = true;
        csLog('maybeDirect: lancio doDirect | consumer=' + isConsumer + ' | tz=' + (capturedTimezone || 'UTC'));
        doDirect();
      }
    }, 800);
  }

  function doDirect() {
    // Sync window: CAL_SYNC_PAST_HOURS=-24h to CAL_SYNC_FUTURE_DAYS=+7d (appConfig.ts)
    var tz = capturedTimezone || 'UTC';
    var now = new Date();
    var wl  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    var yd  = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    var rs  = fmtDate(yd) + 'T00:00:00.000';
    var re  = fmtDate(wl) + 'T23:59:59.999';

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

    // consumer = outlook.live.com → /owa/0/service.svc (non /published/ che è per calendari condivisi)
    // corporate = outlook.office.com → token auth via capturedServiceUrl
    // Entrambi richiedono x-owa-canary altrimenti → HTTP 400
    var isConsumer = window.location.hostname.indexOf('outlook.live.com') !== -1;
    var baseUrl = isConsumer
      ? 'https://outlook.live.com/owa/0/service.svc'
      : (capturedServiceUrl || 'https://outlook.office.com/owa/service.svc');
    var serviceUrl = baseUrl + '?action=GetCalendarView&app=Calendar&n=v2direct';

    // Canary: prova prima da richieste intercettate, poi dal cookie (MAIN world, stessa origine)
    var canary = capturedCanary || readCanaryFromCookie();
    if (!canary) csLog('doDirect: ATTENZIONE — canary non disponibile, POST potrebbe fallire con 400');
    else csLog('doDirect: canary=' + canary.slice(0, 8) + '…');

    var headers = {
      'content-type':       'application/json; charset=utf-8',
      'action':             'GetCalendarView',
      'x-owa-actionsource': 'GetCalendarView',
      'x-owa-hosted-ux':    'false',
      'x-req-source':       'Calendar',
    };
    // Includi auth e canary se disponibili (consumer outlook.live.com invia MSAuth1.0 come corporate)
    if (capturedAuth) {
      headers['authorization'] = capturedAuth;
      if (capturedSessionId) headers['x-owa-sessionid'] = capturedSessionId;
    }
    if (canary) headers['x-owa-canary'] = canary;

    console.log(V, '📡 direct →', isConsumer ? 'consumer' : 'corp', '| tz:', tz, '| canary:', canary ? 'sì' : 'NO');

    csLog('doDirect: POST → ' + serviceUrl.split('?')[0]);
    _fetch(serviceUrl, { method: 'POST', headers: headers, body: reqBody })
      .then(function (r) {
        csLog('doDirect: risposta HTTP ' + r.status);
        if (!r.ok) {
          csLog('doDirect: HTTP ' + r.status + ' → GET_ERROR | canary=' + (canary ? 'sì' : 'NO') + ' | auth=' + (capturedAuth ? 'sì' : 'NO'));
          directCallDone = false;
          window.postMessage({ type: '__CAL_V2_GET_ERROR__', ts: Date.now(), reason: 'HTTP ' + r.status + (canary ? '' : ' (no canary)') }, '*');
          return null;
        }
        return r.json();
      })
      .then(function (json) { if (json) dispatch('direct', json); })
      .catch(function (e) {
        csLog('doDirect: catch network error → ' + (e && e.message || 'unknown'));
        directCallDone = false;
      });
  }

  // ── Range extension ───────────────────────────────────────────────────────────
  function extendRange(init, fromUrl) {
    // x-owa-urlpostdata header (GET-via-POST: action è nel header, non nell'URL)
    var headers = init && init.headers;
    var raw = headers ? getHeader(headers, 'x-owa-urlpostdata') : null;
    if (raw) {
      try {
        var decoded = JSON.parse(decodeURIComponent(raw));
        var action = decoded && decoded.Action;
        var b = decoded && decoded.Body;
        if (b && b.RangeStart) {
          // Sync window: CAL_SYNC_PAST_HOURS=-24h to CAL_SYNC_FUTURE_DAYS=+7d (appConfig.ts)
          var now = new Date(); var wl = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); var yd = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          var oldStart = b.RangeStart;
          b.RangeStart = fmtDate(yd) + 'T00:00:00.000';
          b.RangeEnd = fmtDate(wl) + 'T23:59:59.999';
          csLog('extendRange [urlpostdata] action=' + (action || '?') + ' | ' + oldStart + ' → ' + b.RangeStart + '/' + b.RangeEnd);
          var newH = {};
          if (typeof headers.forEach === 'function') headers.forEach(function(v,k){newH[k]=v;});
          else Object.keys(headers).forEach(function(k){newH[k]=headers[k];});
          newH['x-owa-urlpostdata'] = encodeURIComponent(JSON.stringify(decoded));
          return Object.assign({}, init, { headers: newH });
        } else if (action) {
          csLog('extendRange [urlpostdata] action=' + action + ' | nessun RangeStart (non GetCalendarView?)');
        }
      } catch(e) { csLog('extendRange [urlpostdata] parse error: ' + e.message); }
    }
    // body JSON
    if (init && init.body && typeof init.body === 'string') {
      try {
        var parsed = JSON.parse(init.body);
        var bn = (parsed && parsed.Body) ? parsed.Body : parsed;
        var btype = (parsed && parsed.__type) || (bn && bn.__type) || '?';
        if (bn && bn.RangeStart) {
          var n2 = new Date(); var w2 = new Date(n2); w2.setDate(w2.getDate() + 7); var y2 = new Date(n2); y2.setDate(n2.getDate() - 1);
          var oldStart2 = bn.RangeStart;
          bn.RangeStart = fmtDate(y2) + 'T00:00:00.000';
          bn.RangeEnd   = fmtDate(w2) + 'T23:59:59.999';
          csLog('extendRange [body] type=' + btype + ' | ' + oldStart2 + ' → ' + bn.RangeStart + '/' + bn.RangeEnd);
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
      id:              (ev.ItemId && ev.ItemId.Id) || ev.UID || String(Math.random()),
      subject:         ev.Subject || '(senza titolo)',
      start:           ev.Start || '',
      end:             ev.End   || '',
      location:        loc,
      organizer:       (ev.Organizer && ev.Organizer.Mailbox && ev.Organizer.Mailbox.Name) || '',
      attendees:       [].concat(ev.RequiredAttendees||[], ev.OptionalAttendees||[]).map(function(a){
        return { name:(a.Mailbox&&a.Mailbox.Name)||'', email:(a.Mailbox&&a.Mailbox.EmailAddress)||'', type:'required' };
      }),
      isAllDay:        ev.IsAllDayEvent || false,
      isMeeting:       ev.IsMeeting || false,
      isCancelled:     ev.IsCancelled || false,
      isTeams:         isTeams,
      onlineMeetingUrl: isTeams ? ((bodyText.match(TEAMS_RE)||[])[0]||'msteams:') : null,
      body:            typeof bodyText === 'string' ? bodyText.slice(0,500) : '',
    };
  }

  function mapGraph(ev) {
    var bt = ev.bodyPreview || '';
    return {
      id:              ev.id || String(Math.random()),
      subject:         ev.subject || '',
      start:           (ev.start && ev.start.dateTime) || '',
      end:             (ev.end   && ev.end.dateTime)   || '',
      location:        (ev.location && ev.location.displayName) || '',
      organizer:       (ev.organizer && ev.organizer.emailAddress && ev.organizer.emailAddress.name) || '',
      attendees:       (ev.attendees||[]).map(function(a){
        return { name:(a.emailAddress&&a.emailAddress.name)||'', email:(a.emailAddress&&a.emailAddress.address)||'', type:a.type==='optional'?'optional':'required' };
      }),
      isAllDay:        ev.isAllDay || false,
      isMeeting:       true,
      isCancelled:     ev.isCancelled || false,
      isTeams:         !!(ev.onlineMeeting && ev.onlineMeeting.joinUrl),
      onlineMeetingUrl:(ev.onlineMeeting && ev.onlineMeeting.joinUrl) || null,
      body:            bt.slice(0,500),
    };
  }

  function tryExtract(json) {
    if (!json || typeof json !== 'object') return null;
    // Graph REST
    var arr = Array.isArray(json) ? json : json.value;
    if (Array.isArray(arr) && arr.length > 0 && arr[0] && typeof arr[0].subject === 'string') {
      return { events: arr.map(mapGraph), fmt: 'Graph' };
    }
    // OWA
    var body = json.Body;
    if (body) {
      var btype = body.__type || '?';
      var items = body.Items || body.CalendarEvents || body.CalendarItems || body.Events;
      if (Array.isArray(items)) {
        csLog('tryExtract OWA: ' + items.length + ' items | type=' + btype);
        return { events: items.map(mapOwa), fmt: 'OWA' };
      }
      if (body.ResponseCode === 'NoError' || body.Items !== undefined) {
        csLog('tryExtract OWA 0 items | type=' + btype + ' | keys=' + Object.keys(body).slice(0, 8).join(','));
        return { events: [], fmt: 'OWA' };
      }
      // Unrecognized OWA body — log structure to diagnose
      csLog('tryExtract OWA body unrecognized | type=' + btype + ' | keys=' + Object.keys(body).slice(0, 10).join(','));
    }
    // GraphQL / Apollo
    if (json.data) {
      var data = json.data;
      var keys = Object.keys(data);
      csLog('tryExtract: GraphQL data keys=' + keys.join(','));
      // Cerca array di eventi in ogni campo
      for (var i = 0; i < keys.length; i++) {
        var v = data[keys[i]];
        if (Array.isArray(v) && v.length > 0 && v[0] && (v[0].subject || v[0].Subject || v[0].start || v[0].Start)) {
          csLog('tryExtract GraphQL: ' + v.length + ' items in data.' + keys[i]);
          var fmt = (v[0].subject !== undefined) ? 'Graph' : 'OWA';
          return { events: v.map(fmt === 'Graph' ? mapGraph : mapOwa), fmt: 'GQL-' + keys[i] };
        }
      }
    }
    return null;
  }

  function dispatch(source, json) {
    var r = tryExtract(json);
    if (!r) {
      csLog('dispatch [' + source + ']: tryExtract null (formato non riconosciuto)');
      return;
    }
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

    // Log ogni 20 fetch per confermare override attivo
    if (_fetchCallCount === 1) csLog('fetch#1 intercettato — override attivo');
    if (_fetchCallCount === 10) csLog('fetch#10 — ' + _fetchCallCount + ' fetch totali fino ad ora');
    if (_fetchCallCount % 50 === 0) csLog('fetch#' + _fetchCallCount + ' — override ancora attivo');

    var isServiceSvc = url.indexOf('service.svc') !== -1;
    var hasCalView   = url.indexOf('GetCalendarView') !== -1;

    if (!capturedServiceUrl && isServiceSvc) {
      capturedServiceUrl = url.split('?')[0];
      csLog('serviceUrl catturato: ' + capturedServiceUrl + ' → tento maybeDirect');
      maybeDirect(); // consumer: non arriva auth header → trigger qui appena serviceUrl noto
    }

    if (isServiceSvc) {
      var method = (init && init.method) || 'GET';
      var fullUrl = url.slice(0, 200);
      csLog('service.svc ' + method + ' | ' + fullUrl);
      // Log body __type per POST
      if (init && init.body && typeof init.body === 'string') {
        try {
          var reqBody = JSON.parse(init.body);
          var reqType = (reqBody.__type) || (reqBody.Body && reqBody.Body.__type) || (reqBody.Action) || '?';
          csLog('service.svc body __type/Action=' + reqType);
        } catch(e) { csLog('service.svc body non-JSON | len=' + init.body.length); }
      }
      // Log urlpostdata action
      var hdrs = init && init.headers;
      var upd = hdrs ? getHeader(hdrs, 'x-owa-urlpostdata') : null;
      if (upd) {
        try {
          var updDecoded = JSON.parse(decodeURIComponent(upd));
          csLog('service.svc urlpostdata Action=' + (updDecoded.Action || '?') + ' | Body.__type=' + (updDecoded.Body && updDecoded.Body.__type || '?'));
        } catch(e) { csLog('service.svc urlpostdata parse error'); }
      }
      // Tenta extendRange su TUTTE le service.svc — l'azione può essere nel body/header, non nell'URL
      var urlLabel = hasCalView ? 'URL=GetCalendarView' : fullUrl.slice(-60);
      var extended = extendRange(init, urlLabel);
      if (extended !== init) {
        csLog('service.svc extendRange applicato! pageCallSeen=true | ' + urlLabel);
        pageCallSeen = true;
        init = extended;
      } else if (hasCalView) {
        csLog('GetCalendarView in URL ma extendRange non trovato RangeStart — body non parsabile?');
      }
    }

    return _fetch(input, init).then(function (response) {
      try {
        var ct = response.headers.get('content-type') || '';
        if (ct.indexOf('application/json') !== -1) {
          if (url.indexOf('service.svc') !== -1) {
            csLog('risposta JSON service.svc ricevuta — HTTP ' + response.status + ' | url=' + url.split('?')[0].split('/').pop());
          }
          response.clone().json().then(function (json) {
            if (url.indexOf('GetTimeZone') !== -1 && json && json.Body && json.Body.TimeZone) {
              capturedTimezone = json.Body.TimeZone.Id || capturedTimezone;
              csLog('timezone catturata da GetTimeZone: ' + capturedTimezone);
            }
            if (json && json.Body && json.Body.CurrentTimeZone) {
              capturedTimezone = json.Body.CurrentTimeZone;
              csLog('timezone aggiornata: ' + capturedTimezone);
              if (directCallDone) { directCallDone = false; maybeDirect(); }
            }
            dispatch('fetch', json);
          }).catch(function (e) {
            if (url.indexOf('service.svc') !== -1) csLog('JSON parse error su service.svc: ' + (e && e.message || 'unknown'));
          });
        }
      } catch (_) {}
      return response;
    }).catch(function(e) {
      if (url.indexOf('service.svc') !== -1) csLog('fetch NETWORK ERROR su ' + url.split('?')[0] + ': ' + (e && e.message || 'unknown'));
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
      csLog('XHR: serviceUrl catturato via XHR: ' + capturedServiceUrl);
    }

    if (_url.indexOf('GetCalendarView') !== -1) {
      csLog('XHR: GetCalendarView intercettato via XHR');
    }

    var _setHeader = _this.setRequestHeader.bind(_this);
    _this.setRequestHeader = function (name, value) {
      if (name && name.toLowerCase() === 'authorization' && value && value.indexOf('MSAuth1.0') !== -1) {
        csLog('XHR: auth MSAuth1.0 catturata via XHR');
        capturedAuth = value;
        maybeDirect();
      }
      return _setHeader(name, value);
    };

    _this.addEventListener('load', function () {
      if (_this.status < 200 || _this.status >= 300) return;
      var ct = _this.getResponseHeader('content-type') || '';
      if (ct.indexOf('application/json') === -1) return;
      if (_url.indexOf('service.svc') !== -1) csLog('XHR: risposta JSON service.svc HTTP ' + _this.status);
      try { dispatch('xhr', JSON.parse(_this.responseText)); } catch (_) {}
    });

    return _xhrOpen.apply(_this, arguments);
  };

  csLog('XHR override installato');

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
    if (e.data && e.data.t === 'd') {
      csLog('Worker broadcast ricevuto → dispatch');
      dispatch('worker', e.data.j);
    }
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
  csLog('Worker override installato');

  // ── DO_SYNC + RESYNC handlers ─────────────────────────────────────────────────
  window.addEventListener('message', function (e) {
    if (!e.data) return;
    if (e.data.type === '__CAL_V2_DO_SYNC__' || e.data.type === '__CAL_BRIDGE_RESYNC__') {
      var isConsumer = window.location.hostname.indexOf('outlook.live.com') !== -1;
      csLog('DO_SYNC ricevuto | consumer=' + isConsumer + ' | fetchCount=' + _fetchCallCount + ' | pageCallSeen=' + pageCallSeen);
      directCallDone = false;
      pageCallSeen   = false;
      // consumer: /owa/0/service.svc è noto a priori, non serve ricatturarlo dal traffico
      if (isConsumer && !capturedServiceUrl) {
        capturedServiceUrl = 'https://outlook.live.com/owa/0/service.svc';
        csLog('DO_SYNC: serviceUrl impostato manualmente per consumer');
      }
      maybeDirect();
    }
  });

  csLog('v2.10 loaded — fetch/XHR/Worker patched | hostname=' + window.location.hostname);
  console.log(V, '✅ v2.10 loaded');

})();
