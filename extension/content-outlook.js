/**
 * Audio AI Assistant — Calendar Bridge  v5
 * Content script (world: MAIN)
 *
 * Strategy: capture the MSAuth token + timezone from intercepted main-thread
 * OWA requests, then call GetCalendarView directly using the same credentials.
 * Worker injection kept as secondary fallback.
 */
(function () {
  'use strict';

  var PREFIX = '[CAL-BRIDGE]';
  var TEAMS_RE = /https:\/\/teams\.microsoft\.com\/l\/[^\s<>"']+/;
  var WORKER_BC = '__cal_bridge_worker_v1__';

  console.log(PREFIX, '✅ v5 loaded');

  // ── Auth / timezone context captured from main-thread requests ────────────────
  var capturedAuth      = null;
  var capturedSessionId = null;
  var capturedTimezone  = null;   // e.g. "W. Europe Standard Time"
  var directCallDone    = false;

  function getHeaderValue(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    // plain object
    var lc = name.toLowerCase();
    for (var k in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, k) && k.toLowerCase() === lc) return headers[k];
    }
    return null;
  }

  function captureRequestContext(init) {
    try {
      var headers = (init && init.headers) || {};
      var auth = getHeaderValue(headers, 'authorization');
      if (auth && auth.indexOf('MSAuth1.0') !== -1) {
        capturedAuth = auth;
        var sess = getHeaderValue(headers, 'x-owa-sessionid');
        if (sess) capturedSessionId = sess;
        console.log(PREFIX, '🔑 Auth token captured');
        maybeTriggerDirectCall();
      }
    } catch (_) {}
  }

  // ── Direct GetCalendarView call ───────────────────────────────────────────────

  function pad2(n) { return String(n).padStart(2, '0'); }

  var _directCallTimer = null;

  function maybeTriggerDirectCall() {
    if (directCallDone || !capturedAuth) return;
    // Delay 800ms to let GetTimeZone response arrive before the call
    clearTimeout(_directCallTimer);
    _directCallTimer = setTimeout(function () {
      if (!directCallDone && capturedAuth) {
        directCallDone = true;
        doDirectGetCalendarView();
      }
    }, 800);
  }

  function doDirectGetCalendarView() {
    // Use captured OWA timezone or fall back to UTC
    var tz = capturedTimezone || 'UTC';

    // Range: Mon–Sun of current week (±7 days from today to always include the workweek)
    var now = new Date();
    var dayOfWeek = now.getDay(); // 0=Sun
    var monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    function fmtDate(d) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    var rangeStart = fmtDate(monday) + 'T00:00:00.000';
    var rangeEnd   = fmtDate(sunday) + 'T23:59:59.999';

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
        RangeStart: rangeStart,
        RangeEnd:   rangeEnd,
      },
    });

    var fetchHeaders = {
      'content-type':       'application/json; charset=utf-8',
      'authorization':      capturedAuth,
      'action':             'GetCalendarView',
      'x-owa-actionsource': 'GetCalendarView',
      'x-owa-hosted-ux':    'false',
      'x-req-source':       'Calendar',
    };
    if (capturedSessionId) fetchHeaders['x-owa-sessionid'] = capturedSessionId;

    console.log(PREFIX, '📡 Direct GetCalendarView — tz:', tz, '| range:', rangeStart);

    _fetch('/owa/service.svc?action=GetCalendarView&app=Calendar&n=cal_bridge_direct', {
      method:  'POST',
      headers: fetchHeaders,
      body:    reqBody,
    })
    .then(function (r) { return r.json(); })
    .then(function (json) {
      console.log(PREFIX, '📡 Response keys:', Object.keys(json).join(', '));
      dispatch('direct-GetCalendarView', json);
    })
    .catch(function (e) {
      console.warn(PREFIX, '📡 Direct call failed:', e.message);
      directCallDone = false; // allow retry next auth capture
    });
  }

  // ── Mapping ───────────────────────────────────────────────────────────────────

  function mapGraph(ev) {
    return {
      id:      ev.id || String(Math.random()),
      subject: ev.subject || '',
      start:   (ev.start && ev.start.dateTime) || (typeof ev.start === 'string' ? ev.start : '') || '',
      end:     (ev.end   && ev.end.dateTime)   || (typeof ev.end   === 'string' ? ev.end   : '') || '',
      location: (ev.location && ev.location.displayName) || '',
      body:     ev.bodyPreview || (ev.body && ev.body.content) || '',
      organizer: (ev.organizer && ev.organizer.emailAddress && ev.organizer.emailAddress.name) || '',
      attendees: (ev.attendees || []).map(function (a) {
        return {
          name:  (a.emailAddress && a.emailAddress.name)    || '',
          email: (a.emailAddress && a.emailAddress.address) || '',
          type:  a.type === 'optional' ? 'optional' : 'required',
        };
      }),
      onlineMeetingUrl: (ev.onlineMeeting && ev.onlineMeeting.joinUrl)
        || ((ev.bodyPreview || '').match(TEAMS_RE) || [])[0] || null,
      isCanceled:  ev.isCancelled || false,
      isRecurring: !!ev.recurrence,
      responseStatus: (ev.responseStatus && ev.responseStatus.response) || 'none',
    };
  }

  function mapOwa(ev) {
    var bodyText = ev.TextBody || ev.Preview || ev.Body || '';
    return {
      id:      (ev.ItemId && ev.ItemId.Id) || String(Math.random()),
      subject: ev.Subject || '',
      start:   ev.Start || '',
      end:     ev.End   || '',
      location: (ev.Location && ev.Location.DisplayName) || (typeof ev.Location === 'string' ? ev.Location : '') || '',
      body:     bodyText,
      organizer: (ev.Organizer && ev.Organizer.Mailbox && ev.Organizer.Mailbox.Name) || '',
      attendees: [].concat(ev.RequiredAttendees || [], ev.OptionalAttendees || []).map(function (a) {
        return {
          name:  (a.Mailbox && a.Mailbox.Name)         || '',
          email: (a.Mailbox && a.Mailbox.EmailAddress) || '',
          type:  'required',
        };
      }),
      onlineMeetingUrl: ev.OnlineMeetingUrl || (bodyText.match(TEAMS_RE) || [])[0] || null,
      isCanceled:  ev.IsCancelled || false,
      isRecurring: ev.IsRecurring || ev.CalendarItemType === 'RecurringMaster' || ev.CalendarItemType === 'Occurrence',
      responseStatus: ev.ResponseType || ev.MyResponseType || 'none',
    };
  }

  function tryExtract(json) {
    if (!json || typeof json !== 'object') return null;

    // Graph: root array or { value: [{subject, start}] }
    var arr = Array.isArray(json) ? json : json.value;
    if (Array.isArray(arr) && arr.length > 0) {
      var f = arr[0];
      if (f && typeof f.subject === 'string' && f.start !== undefined) {
        return { events: arr.map(mapGraph), fmt: 'Graph' };
      }
    }

    // OWA: { Body: { Items|CalendarEvents: [{Subject, Start}] } }
    var body = json.Body;
    if (body && (body.ResponseCode === 'NoError' || body.ResponseClass === 'Success' || body.Items !== undefined || body.CalendarEvents !== undefined)) {
      var owaArr = body.Items || body.CalendarEvents || [];
      if (owaArr.length === 0) {
        // Valid empty response (no events in range)
        return { events: [], fmt: 'OWA' };
      }
      var fo = owaArr[0];
      if (fo && typeof fo.Subject === 'string' && fo.Start !== undefined) {
        return { events: owaArr.map(mapOwa), fmt: 'OWA' };
      }
      console.log(PREFIX, '  ⚠ OWA array unknown shape — first keys:', Object.keys(fo || {}).slice(0, 8).join(', '));
    }

    return null;
  }

  function dispatch(source, json) {
    var r = tryExtract(json);
    if (!r) return;
    console.log(PREFIX, '✔ CALENDAR [' + r.fmt + '] ' + r.events.length + ' events — ' + source);
    window.postMessage({ type: '__CAL_BRIDGE__', appointments: r.events }, window.location.origin);
  }

  // ── Main-thread fetch intercept ───────────────────────────────────────────────
  var _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    // Capture auth token from outgoing requests
    captureRequestContext(init);

    return _fetch(input, init).then(function (response) {
      try {
        var ct = response.headers.get('content-type') || '';
        if (ct.indexOf('application/json') !== -1) {
          var url = typeof input === 'string' ? input : (input && input.url) || '';
          response.clone().json().then(function (json) {
            // Capture timezone from GetTimeZone response
            if (url.indexOf('GetTimeZone') !== -1 && json && json.CurrentTimeZone) {
              capturedTimezone = json.CurrentTimeZone;
              console.log(PREFIX, '🕐 Timezone captured:', capturedTimezone);
              // Retry the direct call with correct timezone if it was already done with UTC
              if (directCallDone) {
                directCallDone = false;
                maybeTriggerDirectCall();
              }
            }
            dispatch('fetch:' + url.split('?')[0].split('/').slice(-1)[0], json);
          }).catch(function () {});
        }
      } catch (_) {}
      return response;
    });
  };

  // ── Main-thread XHR intercept ─────────────────────────────────────────────────
  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var _url = String(url || '');
    var self = this;

    // Capture auth from XHR request headers
    var _setReqHeader = this.setRequestHeader.bind(this);
    this.setRequestHeader = function (name, value) {
      if (name && name.toLowerCase() === 'authorization' && value && value.indexOf('MSAuth1.0') !== -1) {
        capturedAuth = value;
        maybeTriggerDirectCall();
      }
      return _setReqHeader(name, value);
    };

    this.addEventListener('load', function () {
      if (this.status < 200 || this.status >= 300) return;
      var ct = this.getResponseHeader('content-type') || '';
      if (ct.indexOf('application/json') === -1) return;
      try {
        var json = JSON.parse(this.responseText);
        if (_url.indexOf('GetTimeZone') !== -1 && json && json.CurrentTimeZone) {
          capturedTimezone = json.CurrentTimeZone;
          console.log(PREFIX, '🕐 Timezone (XHR):', capturedTimezone);
        }
        dispatch('xhr:' + _url.split('?')[0].split('/').slice(-1)[0], json);
      } catch (_) {}
    });
    return _xhrOpen.apply(this, arguments);
  };

  // ── Worker injection (secondary fallback) ─────────────────────────────────────
  var INJECT_CODE = '(function(BC){'
    + 'if(typeof self.fetch!=="function")return;'
    + 'var _f=self.fetch.bind(self);'
    + 'var _bc=new BroadcastChannel(BC);'
    + 'self.fetch=async function(i,o){'
    + 'var r=await _f(i,o);'
    + 'try{'
    + 'var ct=r.headers.get("content-type")||"";'
    + 'if(ct.indexOf("application/json")!==-1){'
    + 'r.clone().json().then(function(j){_bc.postMessage({t:"d",j:j});}).catch(function(){});'
    + '}'
    + '}catch(e){}'
    + 'return r;'
    + '};'
    + '})(' + JSON.stringify(WORKER_BC) + ');';

  var workerBc = new BroadcastChannel(WORKER_BC);
  workerBc.onmessage = function (e) {
    if (e.data && e.data.t === 'd') dispatch('[worker]', e.data.j);
  };

  var _Worker = window.Worker;
  window.Worker = function PatchedWorker(url, options) {
    console.log(PREFIX, '[Worker new]', typeof url === 'string' ? url.slice(0, 80) : '(non-string)');
    if (typeof url === 'string') {
      try {
        var abs = url.indexOf('blob:') === 0 ? url : (new URL(url, window.location.href)).href;
        var src = INJECT_CODE + '\nimportScripts(' + JSON.stringify(abs) + ');';
        var blob = new Blob([src], { type: 'text/javascript' });
        var blobUrl = URL.createObjectURL(blob);
        var w = new _Worker(blobUrl, options);
        setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 15000);
        console.log(PREFIX, '[Worker injected]', url.split('/').pop().slice(0, 50));
        return w;
      } catch (e) {
        console.warn(PREFIX, '[Worker injection FAILED]', e.message);
      }
    }
    return new _Worker(url, options);
  };
  window.Worker.prototype = _Worker.prototype;

  console.log(PREFIX, '✅ all patches applied');

})();
