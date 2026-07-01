#!/usr/bin/env python3
"""
test_api.py — Testa le chiamate Outlook Calendar API intercettando il token dal browser.

Tutte le fetch vengono eseguite DENTRO la pagina Outlook (page.evaluate),
quindi niente CORS, stessa sessione, stessi cookie.

Setup:
    pip install playwright
    playwright install chromium

Uso:
    python test_api.py
"""

import asyncio
import base64
import json
import re
from datetime import datetime, timedelta, timezone

from playwright.async_api import async_playwright

# ── Stato globale intercettato ─────────────────────────────────────────────────
captured: dict = {
    "auth": None,
    "canary": None,
    "anchor_mailbox": None,
    "service_url": None,
    "user_email": None,
}

YELLOW = "\033[93m"
GREEN  = "\033[92m"
RED    = "\033[91m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"


def decode_jwt_payload(token: str) -> dict:
    try:
        part = token.replace("Bearer ", "").split(".")[1]
        part += "=" * (4 - len(part) % 4)
        return json.loads(base64.b64decode(part))
    except Exception:
        return {}


def on_request(request):
    headers = request.headers
    auth = headers.get("authorization", "")

    if auth.startswith("Bearer "):
        payload = decode_jwt_payload(auth)
        aud = payload.get("aud", "")
        upn = payload.get("upn", "") or payload.get("unique_name", "")
        if "outlook.office.com" in aud or "outlook.live.com" in aud:
            if not captured["auth"]:
                print(f"{GREEN}[+] OWA Bearer catturato{RESET} | aud={aud} | upn={upn}")
            captured["auth"] = auth
            if upn and not captured["user_email"]:
                captured["user_email"] = upn

    canary = headers.get("x-owa-canary", "")
    if canary and not captured["canary"]:
        print(f"{GREEN}[+] X-OWA-CANARY catturato{RESET}: {canary[:20]}…")
        captured["canary"] = canary

    anchor = headers.get("x-anchormailbox", "")
    if anchor and not captured["anchor_mailbox"]:
        print(f"{GREEN}[+] X-AnchorMailbox{RESET}: {anchor}")
        captured["anchor_mailbox"] = anchor

    url = request.url
    if "/owa/service.svc" in url and not captured["service_url"]:
        base = url.split("/owa/service.svc")[0]
        captured["service_url"] = base + "/owa/service.svc"
        print(f"{GREEN}[+] service.svc base{RESET}: {captured['service_url']}")


def print_result(name: str, status: int, data, elapsed_ms: float | None = None):
    ok = 200 <= status < 300
    color = GREEN if ok else RED
    ms_str = f" ({elapsed_ms:.0f}ms)" if elapsed_ms else ""
    print(f"\n{BOLD}{CYAN}── {name}{RESET}{ms_str}")
    print(f"   HTTP {color}{status}{RESET}")
    if isinstance(data, dict):
        # stampa struttura top-level
        keys = list(data.keys())
        print(f"   keys: {keys[:10]}")
        if "value" in data and isinstance(data["value"], list):
            print(f"   value[]: {len(data['value'])} elementi")
            if data["value"]:
                ev = data["value"][0]
                subject = ev.get("Subject") or ev.get("subject", "(no subject)")
                start   = (ev.get("Start") or {}).get("DateTime") or ev.get("start", "")
                print(f"   primo evento: {BOLD}{subject}{RESET} | start={start}")
        if "Body" in data:
            body = data["Body"]
            if isinstance(body, dict):
                print(f"   Body keys: {list(body.keys())[:10]}")
                if "ResponseCode" in body:
                    print(f"   ResponseCode: {body['ResponseCode']}")
                if "ResponseMessages" in body:
                    items = body["ResponseMessages"].get("Items", [])
                    print(f"   ResponseMessages.Items: {len(items)}")
                    if items:
                        item0 = items[0]
                        print(f"   Items[0] keys: {list(item0.keys())[:10]}")
                        cv = item0.get("CalendarView") or item0.get("Items") or []
                        print(f"   CalendarView items: {len(cv)}")
                        if cv:
                            print(f"   primo evento: {BOLD}{cv[0].get('Subject','?')}{RESET}")
        if "error" in data:
            print(f"   {RED}error: {data['error']}{RESET}")
    elif isinstance(data, str):
        print(f"   risposta (text): {data[:300]}")


async def run_tests_in_page(page, auth: str, canary: str | None, anchor: str | None):
    """Esegue tutte le chiamate da DENTRO la pagina Outlook (evita CORS)."""

    now = datetime.now(timezone.utc)
    start_dt = (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
    end_dt   = (now + timedelta(days=8)).strftime("%Y-%m-%dT%H:%M:%S")

    # ── Headers base ──────────────────────────────────────────────────────────
    base_headers = {"authorization": auth, "accept": "application/json"}
    if anchor:
        base_headers["x-anchormailbox"] = anchor

    # ── Headers OWA service.svc ───────────────────────────────────────────────
    svc_headers = {
        **base_headers,
        "content-type": "application/json; charset=utf-8",
        "action": "GetCalendarView",
        "x-owa-actionsource": "GetCalendarView",
        "x-owa-hosted-ux": "false",
        "x-req-source": "Calendar",
    }
    if canary:
        svc_headers["x-owa-canary"] = canary

    # ── Body service.svc ──────────────────────────────────────────────────────
    tz = "UTC"
    svc_body = json.dumps({
        "__type": "GetCalendarViewJsonRequest:#Exchange",
        "Header": {
            "__type": "JsonRequestHeaders:#Exchange",
            "RequestServerVersion": "V2018_01_08",
            "TimeZoneContext": {
                "__type": "TimeZoneContext:#Exchange",
                "TimeZoneDefinition": {
                    "__type": "TimeZoneDefinitionType:#Exchange",
                    "Id": tz,
                },
            },
        },
        "Body": {
            "__type": "GetCalendarViewRequest:#Exchange",
            "CalendarId": {
                "__type": "TargetFolderId:#Exchange",
                "BaseFolderId": {
                    "__type": "DistinguishedFolderId:#Exchange",
                    "Id": "calendar",
                },
            },
            "RangeStart": start_dt + ".000",
            "RangeEnd":   end_dt   + ".999",
        },
    })

    tests = [
        # ── REST v2.0 ─────────────────────────────────────────────────────────
        {
            "name": "REST v2.0 CalendarView",
            "method": "GET",
            "url": f"https://outlook.cloud.microsoft/api/v2.0/me/CalendarView?startDateTime={start_dt}&endDateTime={end_dt}&$top=50",
            "headers": base_headers,
            "body": None,
        },
        # ── REST beta ─────────────────────────────────────────────────────────
        {
            "name": "REST beta calendarview",
            "method": "GET",
            "url": f"https://outlook.cloud.microsoft/api/beta/me/calendarview?startDateTime={start_dt}&endDateTime={end_dt}&$top=50",
            "headers": base_headers,
            "body": None,
        },
        # ── OWA service.svc (con canary se disponibile) ───────────────────────
        {
            "name": "service.svc GetCalendarView (canary=" + ("si" if canary else "NO") + ")",
            "method": "POST",
            "url": "https://outlook.cloud.microsoft/owa/service.svc?action=GetCalendarView&app=Calendar&n=test",
            "headers": svc_headers,
            "body": svc_body,
        },
        # ── OWA service.svc senza canary ──────────────────────────────────────
        {
            "name": "service.svc GetCalendarView (senza canary)",
            "method": "POST",
            "url": "https://outlook.cloud.microsoft/owa/service.svc?action=GetCalendarView&app=Calendar&n=test2",
            "headers": {k: v for k, v in svc_headers.items() if k != "x-owa-canary"},
            "body": svc_body,
        },
        # ── v2.0 Events (diverso da CalendarView) ─────────────────────────────
        {
            "name": "REST v2.0 me/events",
            "method": "GET",
            "url": f"https://outlook.cloud.microsoft/api/v2.0/me/events?$top=20&$orderby=start/dateTime",
            "headers": base_headers,
            "body": None,
        },
    ]

    # ── JS da iniettare nella pagina ──────────────────────────────────────────
    js_runner = """
    async (tests) => {
        const results = [];
        for (const t of tests) {
            const t0 = Date.now();
            try {
                const opts = {
                    method: t.method,
                    headers: t.headers,
                    credentials: 'include',
                };
                if (t.body) opts.body = t.body;
                const r = await fetch(t.url, opts);
                const elapsed = Date.now() - t0;
                let data;
                const ct = r.headers.get('content-type') || '';
                if (ct.includes('json')) {
                    try { data = await r.json(); } catch { data = { _raw: await r.text() }; }
                } else {
                    const txt = await r.text();
                    data = { _raw: txt.slice(0, 1000) };
                }
                results.push({ name: t.name, status: r.status, data, elapsed });
            } catch (e) {
                results.push({ name: t.name, status: 0, data: { error: e.message }, elapsed: 0 });
            }
        }
        return results;
    }
    """

    print(f"\n{BOLD}{'═'*60}{RESET}")
    print(f"{BOLD}Esecuzione test API dalla pagina Outlook...{RESET}")
    print(f"Range: {start_dt} → {end_dt}")
    print(f"{'═'*60}{RESET}\n")

    results = await page.evaluate(js_runner, tests)

    for r in results:
        print_result(r["name"], r["status"], r["data"], r.get("elapsed"))

    # ── Salva raw JSON per analisi ─────────────────────────────────────────────
    out_file = "test_results.json"
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\n{GREEN}[+] Risultati salvati in {out_file}{RESET}")


async def main():
    async with async_playwright() as pw:
        print(f"{BOLD}{CYAN}=== Outlook API Tester ==={RESET}")
        print("Apro Chromium su outlook.cloud.microsoft/calendar...\n")

        browser = await pw.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()
        page.on("request", on_request)

        await page.goto("https://outlook.cloud.microsoft/calendar/view/workweek")

        print(">> Fai il login se richiesto.")
        print(">> Aspetta che il calendario sia completamente caricato.")
        print(">> Poi premi INVIO qui per avviare i test.\n")

        while not captured["auth"]:
            try:
                await page.wait_for_timeout(500)
                # controlla ogni 0.5s se il token è stato catturato
            except Exception:
                break

        if captured["auth"]:
            print(f"\n{GREEN}Token catturato automaticamente!{RESET}")
        else:
            print(f"\n{YELLOW}Token non ancora catturato. Naviga un po' nel calendario e poi premi INVIO.{RESET}")

        input("\nPremi INVIO per avviare i test → ")

        if not captured["auth"]:
            print(f"{RED}[!] Bearer non trovato. Impossibile fare i test.{RESET}")
            await browser.close()
            return

        await run_tests_in_page(
            page,
            auth=captured["auth"],
            canary=captured["canary"],
            anchor=captured["anchor_mailbox"],
        )

        print(f"\n{YELLOW}Premi INVIO per chiudere il browser.{RESET}")
        input()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
