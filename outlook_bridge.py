"""
Outlook Bridge — server REST locale per Audio AI Assistant.
Espone gli appuntamenti Outlook via COM automation su http://127.0.0.1:5001.

Prerequisiti (Windows only):
    pip install flask flask-cors pywin32

Avvio manuale:
    python outlook_bridge.py

In produzione viene avviato automaticamente da setup_and_run.ps1.
"""

from flask import Flask, jsonify
from datetime import datetime
import sys

# Forza UTF-8 su stdout/stderr per evitare UnicodeEncodeError su console Windows (cp1252)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Guard: queste librerie esistono solo su Windows
try:
    import win32com.client
    import pythoncom
    OUTLOOK_AVAILABLE = True
except ImportError:
    OUTLOOK_AVAILABLE = False

try:
    from flask_cors import CORS
    HAS_CORS = True
except ImportError:
    HAS_CORS = False

app = Flask(__name__)

ALLOWED_ORIGINS = [
    "http://localhost:3000",   "http://127.0.0.1:3000",
    "http://localhost:8090",   "http://127.0.0.1:8090",
    "http://localhost:5173",   "http://127.0.0.1:5173",
]

if HAS_CORS:
    CORS(app, origins=ALLOWED_ORIGINS)
else:
    @app.after_request
    def add_cors(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return response


def _get_outlook():
    return win32com.client.Dispatch("Outlook.Application")


# ──────────────────────────────────────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────────────────────────────────────

@app.route("/api/status")
def status():
    if not OUTLOOK_AVAILABLE:
        return jsonify({
            "status": "error",
            "message": "pywin32 non disponibile. Installa: pip install pywin32",
        }), 503
    return jsonify({"status": "ok", "platform": sys.platform})


# ──────────────────────────────────────────────────────────────────────────────
# Appuntamenti di oggi
# ──────────────────────────────────────────────────────────────────────────────

@app.route("/api/outlook/appointments/today")
def get_today_appointments():
    if not OUTLOOK_AVAILABLE:
        return jsonify({"error": "pywin32 non disponibile"}), 503

    # COM deve essere inizializzato nel thread corrente (Flask usa thread separati)
    pythoncom.CoInitialize()
    try:
        namespace = _get_outlook().GetNamespace("MAPI")
        calendar = namespace.GetDefaultFolder(9)  # 9 = olFolderCalendar
        items = calendar.Items
        items.IncludeRecurrences = True
        items.Sort("[Start]")

        today = datetime.today().date()
        filter_str = (
            f"[Start] >= '{today.strftime('%m/%d/%Y')} 12:00 AM' AND "
            f"[Start] <= '{today.strftime('%m/%d/%Y')} 11:59 PM'"
        )
        restricted = items.Restrict(filter_str)

        appointments = []
        for appt in restricted:
            try:
                attendees = []
                try:
                    for i in range(1, appt.Recipients.Count + 1):
                        r = appt.Recipients.Item(i)
                        address = ""
                        try:
                            address = r.AddressEntry.GetExchangeUser().PrimarySmtpAddress
                        except Exception:
                            try:
                                address = r.Address
                            except Exception:
                                pass
                        attendees.append({"name": r.Name, "email": address})
                except Exception:
                    pass

                appointments.append({
                    "id": str(len(appointments)),
                    "subject": appt.Subject or "(Nessun titolo)",
                    "start": str(appt.Start),
                    "end": str(appt.End),
                    "location": appt.Location or "",
                    "body": (appt.Body[:1200].strip() if appt.Body else ""),
                    "attendees": attendees,
                    "organizer": getattr(appt, "Organizer", ""),
                })
            except Exception as e:
                appointments.append({"errore": str(e)})

        return jsonify({"appointments": appointments, "date": str(today)})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        pythoncom.CoUninitialize()


# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not OUTLOOK_AVAILABLE:
        print("ERRORE: pywin32 non trovato. Installa con: pip install pywin32 flask flask-cors")
        sys.exit(1)

    print("Outlook Bridge in ascolto su http://127.0.0.1:5001")
    print("  GET /api/status")
    print("  GET /api/outlook/appointments/today")
    app.run(host="127.0.0.1", port=5001, debug=False)
