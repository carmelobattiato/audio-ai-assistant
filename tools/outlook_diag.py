"""
Outlook Calendar Diagnostic Tool
=================================

Standalone Python script (no dependency on the Vite app) to inspect how Outlook
COM returns today's appointments using different strategies. Helps isolate:
- Whether items are missing because of the Restrict filter, the sort order,
  IncludeRecurrences placement, or property access errors.
- Where the time is actually spent.

Requirements (run from a Windows shell with Outlook installed):
    pip install pywin32

Usage:
    python outlook_diag.py
    python outlook_diag.py --date 2026-05-11
    python outlook_diag.py --verbose      # also dumps body/recipients per item
    python outlook_diag.py --strategy all # default; try every strategy
"""

from __future__ import annotations

import io
import os
import sys as _sys
# Force UTF-8 stdout to avoid cp1252 errors on Windows consoles
try:
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    _sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass

import argparse
import json
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, date, timedelta
from typing import Any

try:
    import win32com.client  # type: ignore
    import pythoncom  # type: ignore
except ImportError:
    print("ERRORE: pywin32 non installato. Esegui:  pip install pywin32", file=sys.stderr)
    sys.exit(1)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def safe(getter, default=""):
    """Read a COM property and return default on any error."""
    try:
        v = getter()
        return v if v is not None else default
    except Exception:
        return default


def fmt_dt(v) -> str:
    if not v:
        return ""
    try:
        return str(v)
    except Exception:
        return repr(v)


@dataclass
class ApptInfo:
    subject: str = ""
    start: str = ""
    end: str = ""
    organizer: str = ""
    location: str = ""
    is_recurring: bool = False
    meeting_status: int = 0
    response_status: int = 0
    has_body: bool = False
    body_len: int = 0
    n_recipients: int = 0
    entry_id: str = ""
    item_class: str = ""
    read_ms: float = 0.0  # how long this single item took


@dataclass
class StrategyResult:
    name: str
    description: str
    total_ms: float = 0.0
    com_init_ms: float = 0.0
    restrict_ms: float = 0.0
    iter_ms: float = 0.0
    items: list[ApptInfo] = field(default_factory=list)
    error: str = ""


# ─── Core readers ─────────────────────────────────────────────────────────────


def read_item(item) -> ApptInfo:
    t0 = time.perf_counter()
    info = ApptInfo()
    info.subject = str(safe(lambda: item.Subject, ""))
    info.start = fmt_dt(safe(lambda: item.Start, ""))
    info.end = fmt_dt(safe(lambda: item.End, ""))
    info.organizer = str(safe(lambda: item.Organizer, ""))
    info.location = str(safe(lambda: item.Location, ""))
    info.is_recurring = bool(safe(lambda: item.IsRecurring, False))
    info.meeting_status = int(safe(lambda: item.MeetingStatus, 0) or 0)
    info.response_status = int(safe(lambda: item.ResponseStatus, 0) or 0)
    info.entry_id = str(safe(lambda: item.EntryID, ""))
    info.item_class = str(safe(lambda: item.MessageClass, ""))

    body = safe(lambda: item.Body, "")
    if body:
        info.has_body = True
        info.body_len = len(body)

    info.n_recipients = int(safe(lambda: item.Recipients.Count, 0) or 0)
    info.read_ms = (time.perf_counter() - t0) * 1000
    return info


def open_outlook():
    pythoncom.CoInitialize()
    t0 = time.perf_counter()
    ol = win32com.client.Dispatch("Outlook.Application")
    ns = ol.GetNamespace("MAPI")
    cal = ns.GetDefaultFolder(9)  # olFolderCalendar
    com_ms = (time.perf_counter() - t0) * 1000
    return ol, ns, cal, com_ms


def build_filter(target: date) -> str:
    # MSDN-required AM/PM format (US-style MM/dd/yyyy — broken on it-IT locale)
    ds = target.strftime("%m/%d/%Y")
    ds_next = (target + timedelta(days=1)).strftime("%m/%d/%Y")
    return f"[Start] >= '{ds} 12:00 AM' AND [Start] < '{ds_next} 12:00 AM'"


def build_filter_locale(target: date) -> str:
    # Italian locale dd/MM/yyyy — what we ship in vite.config.ts via ToString('d') on it-IT
    ds = target.strftime("%d/%m/%Y")
    ds_next = (target + timedelta(days=1)).strftime("%d/%m/%Y")
    return f"[Start] >= '{ds} 12:00 AM' AND [Start] <= '{ds} 11:59 PM'"


# ─── Strategies ───────────────────────────────────────────────────────────────


def strategy_current_app(cal, target: date) -> StrategyResult:
    """Mimics the current vite.config.ts script: IncludeRecurrences=true BEFORE Sort."""
    r = StrategyResult(
        name="current_app",
        description="IncludeRecurrences=true -> Sort([Start]) -> Restrict (current app behavior)",
    )
    items = cal.Items
    items.IncludeRecurrences = True
    items.Sort("[Start]")
    flt = build_filter(target)
    t0 = time.perf_counter()
    restricted = items.Restrict(flt)
    r.restrict_ms = (time.perf_counter() - t0) * 1000
    t0 = time.perf_counter()
    for it in restricted:
        r.items.append(read_item(it))
    r.iter_ms = (time.perf_counter() - t0) * 1000
    return r


def strategy_msdn_order(cal, target: date) -> StrategyResult:
    """MSDN-recommended order: Sort FIRST, then IncludeRecurrences, then Restrict."""
    r = StrategyResult(
        name="msdn_order",
        description="Sort([Start]) -> IncludeRecurrences=true -> Restrict (MSDN documented order)",
    )
    items = cal.Items
    items.Sort("[Start]")
    items.IncludeRecurrences = True
    flt = build_filter(target)
    t0 = time.perf_counter()
    restricted = items.Restrict(flt)
    r.restrict_ms = (time.perf_counter() - t0) * 1000
    t0 = time.perf_counter()
    for it in restricted:
        r.items.append(read_item(it))
    r.iter_ms = (time.perf_counter() - t0) * 1000
    return r


def strategy_locale_fixed(cal, target: date) -> StrategyResult:
    """Same as current_app but with dd/MM/yyyy date (Italian regional format)."""
    r = StrategyResult(
        name="locale_fixed",
        description="IncludeRecurrences=true -> Sort -> Restrict with dd/MM/yyyy (FIX)",
    )
    items = cal.Items
    items.IncludeRecurrences = True
    items.Sort("[Start]")
    flt = build_filter_locale(target)
    t0 = time.perf_counter()
    restricted = items.Restrict(flt)
    r.restrict_ms = (time.perf_counter() - t0) * 1000
    t0 = time.perf_counter()
    for it in restricted:
        r.items.append(read_item(it))
    r.iter_ms = (time.perf_counter() - t0) * 1000
    return r


def strategy_no_recurrence(cal, target: date) -> StrategyResult:
    """Without IncludeRecurrences -- shows only master items."""
    r = StrategyResult(
        name="no_recurrence",
        description="Sort([Start]) -> Restrict (NO IncludeRecurrences)",
    )
    items = cal.Items
    items.Sort("[Start]")
    flt = build_filter(target)
    t0 = time.perf_counter()
    restricted = items.Restrict(flt)
    r.restrict_ms = (time.perf_counter() - t0) * 1000
    t0 = time.perf_counter()
    for it in restricted:
        r.items.append(read_item(it))
    r.iter_ms = (time.perf_counter() - t0) * 1000
    return r


def strategy_full_scan(cal, target: date) -> StrategyResult:
    """Iterate the entire Items collection with IncludeRecurrences, filter in Python.
    SLOW but ground truth -- shows EVERY item Outlook can expose for the day.
    """
    r = StrategyResult(
        name="full_scan",
        description="No Restrict -- full iteration with Python-side date filter (ground truth, slow)",
    )
    items = cal.Items
    items.Sort("[Start]")
    items.IncludeRecurrences = True
    t0 = time.perf_counter()
    start_of_day = datetime.combine(target, datetime.min.time())
    end_of_day = start_of_day + timedelta(days=1)
    count_total = 0
    for it in items:
        count_total += 1
        try:
            s = it.Start
            if isinstance(s, str):
                continue
            # pywin32 returns pywintypes.datetime
            sd = datetime(s.year, s.month, s.day, s.hour, s.minute, s.second)
        except Exception:
            continue
        if sd < start_of_day:
            continue
        if sd >= end_of_day:
            # Items is sorted by Start; we can stop
            break
        r.items.append(read_item(it))
    r.iter_ms = (time.perf_counter() - t0) * 1000
    r.restrict_ms = 0
    return r


def strategy_advanced_search(ns, target: date) -> StrategyResult:
    """Use Application.AdvancedSearch on the calendar with DASL filter."""
    r = StrategyResult(
        name="advanced_search",
        description="Application.AdvancedSearch with DASL filter on default calendar",
    )
    try:
        start_of_day = datetime.combine(target, datetime.min.time())
        end_of_day = start_of_day + timedelta(days=1)
        # DASL filter
        s_str = start_of_day.strftime("%Y-%m-%d %H:%M")
        e_str = end_of_day.strftime("%Y-%m-%d %H:%M")
        dasl = (
            f"\"urn:schemas:calendar:dtstart\" >= '{s_str}' AND "
            f"\"urn:schemas:calendar:dtstart\" < '{e_str}'"
        )
        cal = ns.GetDefaultFolder(9)
        scope = f"'{cal.FolderPath}'"
        app = ns.Application
        t0 = time.perf_counter()
        search = app.AdvancedSearch(scope, dasl, True, "OutlookDiag")
        # Wait briefly for search completion
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                results = search.Results
                if results.Count >= 0:
                    break
            except Exception:
                pass
            pythoncom.PumpWaitingMessages()
            time.sleep(0.2)
        r.restrict_ms = (time.perf_counter() - t0) * 1000
        t0 = time.perf_counter()
        for it in search.Results:
            r.items.append(read_item(it))
        r.iter_ms = (time.perf_counter() - t0) * 1000
    except Exception as e:
        r.error = f"{type(e).__name__}: {e}"
    return r


STRATEGIES = {
    "current_app": strategy_current_app,
    "msdn_order": strategy_msdn_order,
    "locale_fixed": strategy_locale_fixed,
    "no_recurrence": strategy_no_recurrence,
    "advanced_search": strategy_advanced_search,
    "full_scan": strategy_full_scan,  # last because slow (107s)
}


# ─── Reporting ────────────────────────────────────────────────────────────────


def print_result(r: StrategyResult, verbose: bool = False):
    bar = "=" * 78
    print(f"\n{bar}\n{r.name}  --  {r.description}\n{bar}")
    if r.error:
        print(f"  ERROR: {r.error}")
        return
    print(
        f"  Items: {len(r.items)}   restrict: {r.restrict_ms:.0f}ms   "
        f"iter: {r.iter_ms:.0f}ms   total: {(r.restrict_ms + r.iter_ms):.0f}ms"
    )
    for i, a in enumerate(r.items):
        flags = []
        if a.is_recurring:
            flags.append("recurring")
        if a.meeting_status in (5, 7):
            flags.append("CANCELED")
        if a.meeting_status == 3:
            flags.append("received")
        flag_str = f"  [{', '.join(flags)}]" if flags else ""
        print(
            f"   {i:>2}. {a.start} -> {a.end}  "
            f"{a.subject[:50]:<50}  "
            f"recip={a.n_recipients:<2} ms={a.meeting_status} "
            f"read={a.read_ms:.0f}ms{flag_str}"
        )
        if verbose:
            print(f"       organizer: {a.organizer}")
            print(f"       location:  {a.location}")
            print(f"       class:     {a.item_class}")
            print(f"       body_len:  {a.body_len}")
            print(f"       entryId:   {a.entry_id[:60]}...")


def compare_strategies(results: dict[str, StrategyResult]):
    print("\n" + "=" * 78)
    print("DIFFERENCES BETWEEN STRATEGIES")
    print("=" * 78)
    # Build subject-set per strategy
    sets = {
        name: {(a.subject, a.start) for a in r.items}
        for name, r in results.items()
        if not r.error
    }
    if not sets:
        print("  (no successful strategies to compare)")
        return
    union = set().union(*sets.values())
    print(f"\n  Union of all subjects: {len(union)}\n")
    for subject, start in sorted(union, key=lambda x: x[1]):
        present_in = [n for n, s in sets.items() if (subject, start) in s]
        missing_from = [n for n in sets if n not in present_in]
        marker = "[OK]" if not missing_from else "[MISS]"
        print(f"  {marker} {start}  {subject[:55]}")
        if missing_from:
            print(f"      MISSING FROM: {', '.join(missing_from)}")


# ─── Main ─────────────────────────────────────────────────────────────────────


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="YYYY-MM-DD (default: today)")
    ap.add_argument("--verbose", "-v", action="store_true")
    ap.add_argument(
        "--strategy",
        choices=list(STRATEGIES.keys()) + ["all"],
        default="all",
    )
    ap.add_argument("--json", action="store_true", help="emit JSON instead of text")
    args = ap.parse_args()

    target = (
        datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today()
    )
    print(f"\nTarget date: {target.isoformat()}  ({target.strftime('%A')})")

    try:
        ol, ns, cal, com_ms = open_outlook()
    except Exception as e:
        print(f"ERRORE Outlook COM: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"Outlook COM init: {com_ms:.0f}ms")
    print(f"Default calendar: {cal.Name}  (entries hint: {safe(lambda: cal.Items.Count, '?')})")

    selected = list(STRATEGIES.keys()) if args.strategy == "all" else [args.strategy]
    results: dict[str, StrategyResult] = {}
    for name in selected:
        print(f"\n-> Running strategy: {name} ...")
        t0 = time.perf_counter()
        try:
            if name == "advanced_search":
                r = STRATEGIES[name](ns, target)
            else:
                r = STRATEGIES[name](cal, target)
        except Exception as e:
            r = StrategyResult(name=name, description="", error=f"{type(e).__name__}: {e}")
        r.total_ms = (time.perf_counter() - t0) * 1000
        r.com_init_ms = com_ms
        results[name] = r

    if args.json:
        print(json.dumps({k: asdict(v) for k, v in results.items()}, indent=2, default=str))
    else:
        for r in results.values():
            print_result(r, verbose=args.verbose)
        compare_strategies(results)


if __name__ == "__main__":
    main()
