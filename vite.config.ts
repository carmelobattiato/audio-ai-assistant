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
$swTotal = [System.Diagnostics.Stopwatch]::StartNew()
$timings = [pscustomobject]@{ comInit = 0; restrict = 0; loop = 0; attendees = 0; bodies = 0; total = 0 }
try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $ol  = New-Object -ComObject Outlook.Application -ErrorAction Stop
    $ns  = $ol.GetNameSpace('MAPI')
    $cal = $ns.GetDefaultFolder(9)
    $items = $cal.Items
    $items.IncludeRecurrences = $true
    $items.Sort('[Start]')
    $timings.comInit = $sw.ElapsedMilliseconds

    $sw.Restart()
    $today = Get-Date
    # CRITICAL: Outlook COM Restrict() expects the date string in the USER'S CURRENT REGIONAL FORMAT,
    # not MM/dd/yyyy as some MSDN pages claim. On it-IT systems a US-format string like '05/11/2026'
    # is read as 5 November (dd/MM/yyyy), silently returning the wrong day. ToString('d') uses the
    # current culture's short date pattern. AM/PM 12h time is mandatory.
    $ds = $today.ToString('d')
    $filter = "[Start] >= '$ds 12:00 AM' AND [Start] <= '$ds 11:59 PM'"
    $restricted = $items.Restrict($filter)
    $timings.restrict = $sw.ElapsedMilliseconds

    $appts   = [System.Collections.Generic.List[object]]::new()
    $skipped = [System.Collections.Generic.List[object]]::new()
    $totalSeen = 0
    $idx = 0
    $attElapsed = 0
    $bodyElapsed = 0
    $swLoop = [System.Diagnostics.Stopwatch]::StartNew()
    foreach ($a in $restricted) {
        $totalSeen++
        # Read core fields up-front with safe defaults; if these throw, log and skip
        $subject = '(Nessun titolo)'
        try { if ($a.Subject) { $subject = [string]$a.Subject } } catch {}
        $startStr = ''
        try { $startStr = [string]$a.Start } catch {}
        $endStr = ''
        try { $endStr = [string]$a.End } catch {}

        try {
            $att = @()
            $swA = [System.Diagnostics.Stopwatch]::StartNew()
            try {
                for ($i = 1; $i -le $a.Recipients.Count; $i++) {
                    try {
                        $r = $a.Recipients.Item($i)
                        $name = ''
                        try { $name = [string]$r.Name } catch {}
                        # Fast path: r.Address is local. Only fall back to GetExchangeUser (Exchange GAL lookup,
                        # 50-500ms per call) when Address looks like a legacy EX DN instead of SMTP.
                        $email = ''
                        try { $email = [string]$r.Address } catch {}
                        if ($email -and ($email -like '/o=*' -or $email -like '/cn=*')) {
                            try { $email = [string]$r.AddressEntry.GetExchangeUser().PrimarySmtpAddress } catch {}
                        }
                        $att += [pscustomobject]@{ name = $name; email = $email }
                    } catch {}
                }
            } catch {}
            $attElapsed += $swA.ElapsedMilliseconds
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
            try { $organizer = [string]$a.Organizer } catch {}
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
            $location = ''
            try { if ($a.Location) { $location = [string]$a.Location } } catch {}
            # MeetingStatus: 0=Non meeting, 1=Meeting, 3=Received, 5=Canceled, 7=ReceivedAndCanceled
            $meetingStatus = 0
            try { $meetingStatus = [int]$a.MeetingStatus } catch {}
            $isCanceled = ($meetingStatus -eq 5 -or $meetingStatus -eq 7)
            $isRecurring = $false
            try { $isRecurring = [bool]$a.IsRecurring } catch {}

            $appts.Add([pscustomobject]@{
                id               = [string]$idx
                subject          = $subject
                start            = $startStr
                end              = $endStr
                location         = $location
                body             = $body
                attendees        = $att
                organizer        = $organizer
                onlineMeetingUrl = $meetingUrl
                responseStatus   = $rs
                meetingStatus    = $meetingStatus
                isCanceled       = $isCanceled
                isRecurring      = $isRecurring
            })
            $idx++
        } catch {
            # Surface the skipped appointment instead of silently swallowing
            $skipped.Add([pscustomobject]@{
                subject = $subject
                start   = $startStr
                end     = $endStr
                error   = $_.Exception.Message
                step    = $_.InvocationInfo.ScriptLineNumber
            })
        }
    }
    $timings.loop      = $swLoop.ElapsedMilliseconds
    $timings.attendees = $attElapsed
    $timings.total     = $swTotal.ElapsedMilliseconds
    [pscustomobject]@{
        appointments = $appts.ToArray()
        skipped      = $skipped.ToArray()
        totalSeen    = $totalSeen
        date         = $today.ToString('yyyy-MM-dd')
        filter       = $filter
        timings      = $timings
    } | ConvertTo-Json -Depth 6 -Compress
} catch {
    [pscustomobject]@{ error = $_.Exception.Message; timings = $timings; totalMs = $swTotal.ElapsedMilliseconds } | ConvertTo-Json -Compress
}
`;

function runPowerShell(script: string, stdinInput?: string): Promise<string> {
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
    if (stdinInput !== undefined) {
      proc.stdin.write(stdinInput, 'utf8');
      proc.stdin.end();
    }
  });
}

// Opens an Outlook compose window with HTML body preserved (formatting matches "Copy Text" rich output).
// Recipients are separated by ';' which is Outlook's native separator.
// Reads a base64-encoded JSON payload from stdin to avoid escaping/size limits.
const PS_COMPOSE_EMAIL = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
    $b64 = [Console]::In.ReadToEnd()
    $bytes = [Convert]::FromBase64String($b64)
    $json = [System.Text.Encoding]::UTF8.GetString($bytes)
    $data = $json | ConvertFrom-Json
    $ol = New-Object -ComObject Outlook.Application -ErrorAction Stop
    $mail = $ol.CreateItem(0)
    if ($data.subject) { $mail.Subject = [string]$data.subject }
    if ($data.htmlBody) { $mail.HTMLBody = [string]$data.htmlBody }
    if ($data.to -and $data.to.Count -gt 0) { $mail.To = ($data.to -join '; ') }
    if ($data.cc -and $data.cc.Count -gt 0) { $mail.CC = ($data.cc -join '; ') }
    $mail.Display()
    [pscustomobject]@{ ok = $true } | ConvertTo-Json -Compress
} catch {
    [pscustomobject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;

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

          // POST /api/outlook/email — opens Outlook compose with HTML body
          if (req.url === '/email' && req.method === 'POST') {
            if (process.platform !== 'win32') {
              res.statusCode = 503;
              res.end(JSON.stringify({
                error: `Outlook Bridge is not available on ${process.platform}. This feature requires Windows.`,
              }));
              return;
            }
            try {
              const chunks: Buffer[] = [];
              for await (const c of req) chunks.push(c as Buffer);
              const bodyStr = Buffer.concat(chunks).toString('utf8');
              // Validate JSON early so the user gets a meaningful error
              JSON.parse(bodyStr);
              const b64 = Buffer.from(bodyStr, 'utf8').toString('base64');
              const raw = await runPowerShell(PS_COMPOSE_EMAIL, b64);
              res.end(raw);
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message ?? 'Errore PowerShell' }));
            }
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

function icsProxyPlugin() {
  return {
    name: 'ics-proxy',
    configureServer(server: any) {
      server.middlewares.use('/api/ics', async (req: any, res: any, next: () => void) => {
        try {
          const u = new URL(req.url || '', 'http://localhost');
          const target = u.searchParams.get('url');
          if (!target) {
            res.statusCode = 400;
            res.end('Missing url param');
            return;
          }
          if (!/^https:\/\//i.test(target)) {
            res.statusCode = 400;
            res.end('Only https URLs allowed');
            return;
          }
          const upstream = await fetch(target, { headers: { Accept: 'text/calendar' } });
          if (!upstream.ok) {
            res.statusCode = upstream.status;
            res.end(`Upstream HTTP ${upstream.status}`);
            return;
          }
          const body = await upstream.text();
          res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(body);
        } catch (e: any) {
          res.statusCode = 500;
          res.end(`ICS proxy error: ${e?.message || 'unknown'}`);
        }
        void next;
      });
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
    plugins: [react(), outlookPlugin(), icsProxyPlugin()],
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
