
import { LogLevel, LogEntry } from '../types';
import { APP_VERSION } from '../constants';

const SESSION_ID: string = crypto.randomUUID();
let currentCorrelationId: string = crypto.randomUUID();

const MAX_LOCAL_LOGS = 500;
const BATCH_SIZE = 10;
const BATCH_INTERVAL_MS = 5000;

/**
 * Logger singleton client-side. Mantiene una history locale (max 500 entry, per
 * la UI), fa il batch dei log verso un "remote appender" (oggi simulato) ogni
 * 5s o ogni 10 entry, e installa handler globali `onerror` /
 * `onunhandledrejection`. Espone `trace/debug/info/warn/error(event, message, context)`.
 * Istanza unica esportata come `loggingService`; vive per tutta la durata dell'app
 * (il `setInterval` di flush non viene mai fermato — voluto, non è un leak).
 */
class LoggingService {
  private logs: LogEntry[] = [];
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: ((logs: LogEntry[]) => void)[] = [];

  constructor() {
    this.setupGlobalHandlers();
    this.startFlushTimer();
  }

  setCorrelationId(id: string) {
    currentCorrelationId = id;
  }

  getCorrelationId() {
    return currentCorrelationId;
  }

  getSessionId() {
    return SESSION_ID;
  }

  private setupGlobalHandlers() {
    window.onerror = (message, source, lineno, colno, error) => {
      this.error('GLOBAL_ERROR', String(message), { source, lineno, colno, stack: error?.stack });
    };

    window.onunhandledrejection = (event) => {
      this.error('UNHANDLED_REJECTION', String(event.reason), { reason: event.reason });
    };
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => this.flushBuffer(), BATCH_INTERVAL_MS);
  }

  private async flushBuffer() {
    if (this.buffer.length === 0) return;

    const logsToSend = [...this.buffer];
    this.buffer = [];

    try {
      // In a real app, this would be a POST to /api/client-logs
      // For now, we simulate the remote appender
      console.log(`[RemoteLogAppender] Sending ${logsToSend.length} logs to server...`);
      // await fetch('/api/client-logs', { method: 'POST', body: JSON.stringify(logsToSend) });
    } catch (err) {
      console.error('[RemoteLogAppender] Failed to send logs', err);
      // Re-add to buffer if failed (with some limit)
      if (this.buffer.length < 100) {
        this.buffer = [...logsToSend, ...this.buffer];
      }
    }
  }

  private log(level: LogLevel, event: string, message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      event,
      message,
      appVersion: APP_VERSION,
      env: process.env.NODE_ENV || 'development',
      route: window.location.pathname,
      correlationId: currentCorrelationId,
      sessionId: SESSION_ID,
      device: {
        browser: navigator.userAgent,
        os: navigator.platform,
      },
      network: {
        online: navigator.onLine,
        effectiveType: (navigator as any).connection?.effectiveType,
      },
      context,
    };

    // Add to local history for the UI
    this.logs = [entry, ...this.logs].slice(0, MAX_LOCAL_LOGS);
    this.notifyListeners();

    // Console output (only if not in production or if it's a warning/error)
    if (process.env.NODE_ENV !== 'production' || level === LogLevel.WARN || level === LogLevel.ERROR) {
      const color = this.getConsoleColor(level);
      console.log(`%c[${level}] ${event}: ${message}`, `color: ${color}`, context || '');
    }

    // Remote buffering
    if (this.shouldSendToRemote(level)) {
      this.buffer.push(entry);
      if (this.buffer.length >= BATCH_SIZE) {
        this.flushBuffer();
      }
    }
  }

  private shouldSendToRemote(level: LogLevel): boolean {
    if (process.env.NODE_ENV !== 'production') return false;
    // In production: always WARN/ERROR, INFO only for key events (simplified here to all INFO)
    return level === LogLevel.ERROR || level === LogLevel.WARN || level === LogLevel.INFO;
  }

  private getConsoleColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR: return '#f87171';
      case LogLevel.WARN: return '#fbbf24';
      case LogLevel.INFO: return '#60a5fa';
      case LogLevel.DEBUG: return '#9ca3af';
      case LogLevel.TRACE: return '#d1d5db';
      default: return '#ffffff';
    }
  }

  trace(event: string, message: string, context?: Record<string, unknown>) { this.log(LogLevel.TRACE, event, message, context); }
  debug(event: string, message: string, context?: Record<string, unknown>) { this.log(LogLevel.DEBUG, event, message, context); }
  info(event: string, message: string, context?: Record<string, unknown>) { this.log(LogLevel.INFO, event, message, context); }
  warn(event: string, message: string, context?: Record<string, unknown>) { this.log(LogLevel.WARN, event, message, context); }
  error(event: string, message: string, context?: Record<string, unknown>) { this.log(LogLevel.ERROR, event, message, context); }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    this.notifyListeners();
  }

  subscribe(listener: (logs: LogEntry[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l(this.logs));
  }
}

export const loggingService = new LoggingService();
