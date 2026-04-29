import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'child_process';

// =============================================================================
// Outlook middleware plugin
// Gestisce /api/outlook/* direttamente nel dev server Vite tramite PowerShell.
// Funziona solo su Windows (process.platform === 'win32').
// =============================================================================

const PS_GET_APPOINTMENTS = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
    $ol  = New-Object -ComObject Outlook.Application -ErrorAction Stop
    $ns  = $ol.GetNameSpace('MAPI')
    $cal = $ns.GetDefaultFolder(9)
    $items = $cal.Items
    $items.IncludeRecurrences = $true
    $items.Sort('[Start]')
    $today = Get-Date
    $ds = $today.ToString('MM/dd/yyyy')
    $filter = "[Start] >= '$ds 12:00 AM' AND [Start] <= '$ds 11:59 PM'"
    $restricted = $items.Restrict($filter)
    $appts = [System.Collections.Generic.List[object]]::new()
    $idx = 0
    foreach ($a in $restricted) {
        try {
            $att = @()
            try {
                for ($i = 1; $i -le $a.Recipients.Count; $i++) {
                    $r = $a.Recipients.Item($i)
                    $email = ''
                    try { $email = $r.AddressEntry.GetExchangeUser().PrimarySmtpAddress } catch { try { $email = $r.Address } catch {} }
                    $att += [pscustomobject]@{ name = $r.Name; email = $email }
                }
            } catch {}
            $fullBody = ''
            try { if ($a.Body) { $fullBody = $a.Body } } catch {}
            $body = if ($fullBody.Length -gt 1200) { $fullBody.Substring(0,1200).Trim() } else { $fullBody.Trim() }
            $meetingUrl = ''
            try { if ($a.OnlineMeetingURL) { $meetingUrl = $a.OnlineMeetingURL } } catch {}
            if (-not $meetingUrl) {
                try {
                    if ($fullBody -match '(https://teams\.microsoft\.com/l/[^\s<>]+)') {
                        $meetingUrl = $Matches[1].TrimEnd('.')
                    }
                } catch {}
            }
            $organizer = ''
            try { $organizer = $a.Organizer } catch {}
            $rs = 'none'
            try {
                switch ([int]$a.ResponseStatus) {
                    0 { $rs = 'none' }
                    1 { $rs = 'organizer' }
                    2 { $rs = 'tentative' }
                    3 { $rs = 'accepted' }
                    4 { $rs = 'declined' }
                    5 { $rs = 'notResponded' }
                }
            } catch {}
            $appts.Add([pscustomobject]@{
                id               = [string]$idx
                subject          = if ($a.Subject) { $a.Subject } else { '(Nessun titolo)' }
                start            = [string]$a.Start
                end              = [string]$a.End
                location         = if ($a.Location) { $a.Location } else { '' }
                body             = $body
                attendees        = $att
                organizer        = $organizer
                onlineMeetingUrl = $meetingUrl
                responseStatus   = $rs
            })
            $idx++
        } catch {}
    }
    [pscustomobject]@{
        appointments = $appts.ToArray()
        date         = $today.ToString('yyyy-MM-dd')
    } | ConvertTo-Json -Depth 6 -Compress
} catch {
    [pscustomobject]@{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // EncodedCommand accetta UTF-16 LE in base64 — evita qualsiasi problema di escaping
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const proc = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded,
    ]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString('utf8'); });
    proc.stderr.on('data', (d: Buffer) => { err += d.toString('utf8'); });
    proc.on('close', (code: number) => {
      if (code !== 0) reject(new Error(err.trim() || `PowerShell uscito con codice ${code}`));
      else resolve(out.trim());
    });
    proc.on('error', reject);
  });
}

function outlookPlugin() {
  return {
    name: 'outlook-bridge',
    configureServer(server: any) {
      server.middlewares.use(
        '/api/outlook',
        async (req: any, res: any, next: () => void) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');

          // GET /api/outlook/status
          if (req.url === '/status' || req.url === '') {
            const isWin = process.platform === 'win32';
            res.end(JSON.stringify({
              status: isWin ? 'ok' : 'unavailable',
              platform: process.platform,
              mode: 'vite-plugin',
            }));
            return;
          }

          // GET /api/outlook/appointments/today
          if (req.url === '/appointments/today') {
            if (process.platform !== 'win32') {
              res.statusCode = 503;
              res.end(JSON.stringify({
                error: `Outlook Bridge is not available on ${process.platform}. This feature requires Windows.`,
              }));
              return;
            }
            try {
              const raw = await runPowerShell(PS_GET_APPOINTMENTS);
              // Valida che sia JSON valido prima di inviare
              JSON.parse(raw);
              res.end(raw);
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message ?? 'Errore PowerShell' }));
            }
            return;
          }

          next();
        },
      );
    },
  };
}

// =============================================================================

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 8090,
      host: '0.0.0.0',
      watch: {
        // These files are modified by github_push.sh during version bump.
        // Ignoring them prevents Vite from triggering a hot reload mid-session.
        ignored: [
          '**/constants/appConfig.ts',
          '**/CHANGELOG.md',
          '**/README.md',
        ],
      },
    },
    plugins: [react(), outlookPlugin()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
