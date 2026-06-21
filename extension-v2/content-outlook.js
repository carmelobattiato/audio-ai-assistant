'use strict';
// Calendar Bridge v2.3 — content-outlook.js (MAIN world, document_start)
// Core mechanism identico a v1.1 (che funziona).
// Unica differenza: output via __CAL_V2_EVENTS__ invece di __CAL_BRIDGE__.

(function () {

  var V = '[CAL-V2]';
  var WORKER_BC = '__cal_bridge_v2_worker__';

  // ── Native refs ──────────────────────────────────────────────────────────────
  var _fetch  = window.fetch.bind(window);
  var _Worker = window.Worker;

  // ── State ────────────────────────────────────────────────────────────────────
  var capturedAuth       = null;
  var capturedSessionId  = null;
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

  // ── Auth capture ─────────────────────────────────────────────────────────────
  function captureCtx(init) {
    try {
      var h = (init && init.headers) || {};
      var auth = getHeader(h, 'authorization');
      if (auth && auth.indexOf('MSAuth1.0') !== -1) {
        capturedAuth = auth;
        var sess = getHeader(h, 'x-owa-sessionid');
        if (sess) capturedSessionId = sess;
        maybeDirect();
      }
    } catch (_) {}
  }

  // ── Direct call ───────────────────────────────────────────────────────────────
  var _directTimer = null;

  function maybeDirect() {
    if (directCallDone || !capturedAuth) return;
    clearTimeout(_directTimer);
    _directTimer = setTimeout(function () {
      if (!directCallDone && capturedAuth && !pageCallSeen) {
        directCallDone = true;
        doDirect();
      }
    }, 800);
  }

  function doDirect() {
    var tz = capturedTimezone || 'UTC';
    var now = new Date();
    var wl  = new Date(now); wl.setDate(wl.getDate() + 7);
    var rs  = fmtDate(now) + 'T00:00:00.000';
    var re  = fmtDate(wl)  + 'T23:59:59.999';

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

    var isConsumer = !capturedServiceUrl || capturedServiceUrl.indexOf('/published/') !== -1;
    var serviceUrl = (capturedServiceUrl || 'https://outlook.live.com/owa/service.svc')
      + '?action=GetCalendarView&app=Calendar&n=v2direct';

    var headers = {
      'content-type':       'application/json; charset=utf-8',
      'action':             'GetCalendarView',
      'x-owa-actionsource': 'GetCalendarView',
      'x-owa-hosted-ux':    'false',
      'x-req-source':       'Calendar',
    };
    if (!isConsumer && capturedAuth) {
      headers['authorization'] = capturedAuth;
      if (capturedSessionId) headers['x-owa-sessionid'] = capturedSessionId;
    }

    console.log(V, '📡 direct →', isConsumer ? 'consumer(cookies)' : 'corp(token)', '| tz:', tz);

    _fetch(serviceUrl, { method: 'POST', headers: headers, body: reqBody })
      .then(function (r) {
        if (!r.ok) {
          console.warn(V, '📡 HTTP', r.status);
          if (r.status === 400 || r.status === 401) capturedServiceUrl = null;
          directCallDone = false;
          window.postMessage({ type: '__CAL_V2_GET_ERROR__', ts: Date.now(), reason: 'HTTP ' + r.status }, '*');
          return null;
        }
        return r.json();
      })
      .then(function (json) { if (json) dispatch('direct', json); })
      .catch(function (e) {
        console.warn(V, '📡 fail:', e.message);
        directCallDone = false;
        window.postMessage({ type: '__CAL_V2_GET_ERROR__', ts: Date.now(), reason: e.message || 'fetch failed' }, '*');
      });
  }

  // ── Range extension ───────────────────────────────────────────────────────────
  function extendRange(init) {
    // x-owa-urlpostdata
    var headers = init && init.headers;
    var raw = headers ? getHeader(headers, 'x-owa-urlpostdata') : null;
    if (raw) {
      try {
        var decoded = JSON.parse(decodeURIComponent(raw));
        var b = decoded && decoded.Body;
        if (b && b.RangeStart) {
          var now = new Date(); var wl = new Date(now); wl.setDate(now.getDate() + 7);
          b.RangeEnd = fmtDate(wl) + 'T23:59:59.999';
          var newH = {};
          if (typeof headers.forEach === 'function') headers.forEach(function(v,k){newH[k]=v;});
          else Object.keys(headers).forEach(function(k){newH[k]=headers[k];});
          newH['x-owa-urlpostdata'] = encodeURIComponent(JSON.stringify(decoded));
          return Object.assign({}, init, { headers: newH });
        }
      } catch(_) {}
    }
    // body JSON
    if (init && init.body && typeof init.body === 'string') {
      try {
        var parsed = JSON.parse(init.body);
        var bn = (parsed && parsed.Body) ? parsed.Body : parsed;
        if (bn && bn.RangeStart) {
          var n2 = new Date(); var w2 = new Date(n2); w2.setDate(w2.getDate() + 7);
          bn.RangeStart = fmtDate(n2) + 'T00:00:00.000';
          bn.RangeEnd   = fmtDate(w2) + 'T23:59:59.999';
          return Object.assign({}, init, { body: JSON.stringify(parsed) });
        }
      } catch(_) {}
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
    // Graph
    var arr = Array.isArray(json) ? json : json.value;
    if (Array.isArray(arr) && arr.length > 0 && arr[0] && typeof arr[0].subject === 'string') {
      return { events: arr.map(mapGraph), fmt: 'Graph' };
    }
    // OWA
    var body = json.Body;
    if (body) {
      var items = body.Items || body.CalendarEvents;
      if (Array.isArray(items)) {
        return { events: items.map(mapOwa), fmt: 'OWA' };
      }
      if (body.ResponseCode === 'NoError' || body.Items !== undefined) {
        return { events: [], fmt: 'OWA' };
      }
    }
    return null;
  }

  function dispatch(source, json) {
    var r = tryExtract(json);
    if (!r || !r.events.length) return;
    console.log(V, '✅', r.events.length, 'eventi [' + r.fmt + '] —', source);
    window.postMessage({ type: '__CAL_V2_EVENTS__', events: r.events, ts: Date.now() }, '*');
  }

  // ── fetch override ────────────────────────────────────────────────────────────
  window.fetch = function (input, init) {
    captureCtx(init);

    var url = typeof input === 'string' ? input : (input && input.url) || '';

    if (!capturedServiceUrl && url.indexOf('service.svc') !== -1) {
      capturedServiceUrl = url.split('?')[0];
      console.log(V, '🔗 serviceUrl:', capturedServiceUrl);
    }

    if (url.indexOf('GetCalendarView') !== -1) {
      init = extendRange(init);
      pageCallSeen = true;
    }

    return _fetch(input, init).then(function (response) {
      try {
        var ct = response.headers.get('content-type') || '';
        if (ct.indexOf('application/json') !== -1) {
          response.clone().json().then(function (json) {
            if (url.indexOf('GetTimeZone') !== -1 && json && json.Body && json.Body.TimeZone) {
              capturedTimezone = json.Body.TimeZone.Id || capturedTimezone;
            }
            if (json && json.Body && json.Body.CurrentTimeZone) {
              capturedTimezone = json.Body.CurrentTimeZone;
              console.log(V, '🕐 tz:', capturedTimezone);
              if (directCallDone) { directCallDone = false; maybeDirect(); }
            }
            dispatch('fetch', json);
          }).catch(function () {});
        }
      } catch (_) {}
      return response;
    });
  };

  // ── XHR override ──────────────────────────────────────────────────────────────
  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var _url  = String(url || '');
    var _this = this;

    if (!capturedServiceUrl && _url.indexOf('service.svc') !== -1) {
      capturedServiceUrl = _url.split('?')[0];
    }

    var _setHeader = _this.setRequestHeader.bind(_this);
    _this.setRequestHeader = function (name, value) {
      if (name && name.toLowerCase() === 'authorization' && value && value.indexOf('MSAuth1.0') !== -1) {
        capturedAuth = value;
        maybeDirect();
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
    if (e.data && e.data.t === 'd') dispatch('worker', e.data.j);
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

  // ── DO_SYNC + RESYNC handlers ─────────────────────────────────────────────────
  window.addEventListener('message', function (e) {
    if (!e.data) return;
    if (e.data.type === '__CAL_V2_DO_SYNC__' || e.data.type === '__CAL_BRIDGE_RESYNC__') {
      console.log(V, '🔄 sync richiesto');
      directCallDone = false;
      pageCallSeen   = false;
      capturedServiceUrl = null;
      maybeDirect();
    }
  });

  console.log(V, '✅ v2.4 loaded');

})();
