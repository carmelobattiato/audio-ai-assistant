'use strict';
// Teams Bridge v1 — content-owa-calendar.js
// Iniettato nell'iframe OWA calendar (outlook.office.com) da Teams.
// Scrapa gli eventi del calendario dal DOM OWA e li invia via chrome.runtime.

(function() {
  // Solo nella vista calendario
  if (window.location.href.indexOf('/calendar') === -1 &&
      window.location.href.indexOf('workweek') === -1 &&
      window.location.href.indexOf('month') === -1 &&
      window.location.href.indexOf('day') === -1 &&
      document.title.toLowerCase().indexOf('calendar') === -1) {
    return;
  }

  var _lastSent   = 0;
  var _lastEvents = '';

  function safeSend(msg) {
    try { chrome.runtime.sendMessage(msg); } catch(e) {}
  }

  function scrapeAndSend() {
    var now = Date.now();
    if (now - _lastSent < 5000) return;

    var events = [];

    // ── Selettori OWA calendario ───────────────────────────────────────────────
    // OWA 2025 usa classi React hashate; ci affidiamo ad aria-label e data-tid
    var candidates = Array.from(document.querySelectorAll(
      '[data-testid="calendar-item"],' +
      '[data-testid="CalendarItem"],' +
      '[data-testid="appointmentItem"],' +
      '[data-tid="CalendarItem"],' +
      '[class*="calendarEvent"],[class*="CalendarEvent"],' +
      '[class*="appointmentItem"],[class*="AppointmentItem"],' +
      '[class*="eventItem"],[class*="EventItem"],' +
      '[class*="calevent"],[class*="calEvent"],' +
      // Fallback: bottoni con aria-label contenente orari
      '[role="button"][aria-label]'
    ));

    candidates.forEach(function(el) {
      var label = el.getAttribute('aria-label') || '';
      var title = el.getAttribute('title') || '';

      // Prova a estrarre il testo del titolo dal DOM
      var textEl = el.querySelector('[class*="subject"],[class*="Subject"],[class*="title"],[class*="Title"]');
      var subject = (textEl && textEl.textContent.trim()) ||
                    title.split(',')[0] ||
                    label.split(',')[0] ||
                    el.textContent.trim().split('\n')[0].trim();

      subject = subject.substring(0, 100).trim();
      if (!subject || subject.length < 2) return;

      // Evita duplicati
      if (events.some(function(e) { return e.subject === subject; })) return;

      // Cerca un eventuale join URL (link "Partecipa alla riunione di Teams")
      var joinLink = el.querySelector('a[href*="teams.microsoft.com/l/meetup"],a[href*="teams.cloud.microsoft/l/meetup"],a[href*="teams.live.com/l/meetup"]');
      var joinUrl  = joinLink ? joinLink.href : undefined;

      events.push({
        id:       subject,
        subject:  subject,
        start:    label,   // aria-label di OWA contiene orario testuale
        end:      '',
        joinUrl:  joinUrl,
        organizer: undefined,
      });
    });

    if (!events.length) {
      // Log diagnostico: logga le prime classi trovate nel DOM per debug
      var any = document.querySelector('[role="button"][aria-label],[role="gridcell"]');
      if (any) {
        var cls = String(any.className || '').substring(0, 80);
        safeSend({ type: 'OWA_CAL_DEBUG', msg: 'OWA iframe: nessun evento estratto — classe campione: ' + cls });
      }
      return;
    }

    var serialized = JSON.stringify(events);
    if (serialized === _lastEvents) return; // nessuna variazione

    _lastEvents = serialized;
    _lastSent   = now;

    safeSend({ type: 'OWA_CALENDAR_DATA', events: events });
  }

  // Polling ogni 3s
  setInterval(scrapeAndSend, 3000);

  // MutationObserver per rilevare render del calendario
  var _mo = new MutationObserver(function() { scrapeAndSend(); });
  function attachMO() {
    var root = document.getElementById('app_mount') ||
               document.getElementById('rootComponent') ||
               document.body;
    if (root) _mo.observe(root, { childList: true, subtree: true });
    else setTimeout(attachMO, 500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachMO);
  } else {
    attachMO();
  }
})();
