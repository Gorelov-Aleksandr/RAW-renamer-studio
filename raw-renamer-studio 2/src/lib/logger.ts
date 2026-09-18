/**
 * Логгер фронтенда (master: раздел «Логирование», v3.3).
 *
 * Корреляция с sidecar: общее session_id + единый JSONL-хвост через POST /log.
 * Записи буферизуются и отправляются батчами (fire-and-forget) — падение
 * sidecar не роняет UI, очередь ограничена, дубли отбрасываются.
 *
 * Поля (совместимы с rrslog.py):
 *   ts, level, role='ui', session_id, action, params?, result?, error?, stack?, ui_state?
 */
import { base } from './sidecar';

export type LogLevel = 'info' | 'warn' | 'error';

export interface UiState {
  items?: number;
  frames?: number;
  modal?: string | null;
  filter?: string;
  online?: boolean;
}

export interface LogEntry {
  ts: string;
  level: LogLevel;
  role: 'ui';
  session_id: string;
  action: string;
  params?: unknown;
  result?: unknown;
  error?: string;
  stack?: string;
  ui_state?: UiState;
  [key: string]: unknown;
}

// --- session_id: генерируется один раз за запуск приложения ----------------
let sessionId = 'ui-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function getSessionId(): string {
  return sessionId;
}

const MAX_QUEUE = 500;
const FLUSH_LIMIT = 200; // максимум записей за один POST
const queue: LogEntry[] = [];
let timer: number | null = null;
let flushing = false;
let baseUrl = '';

export function setLogBaseUrl(b: string): void {
  baseUrl = b;
}

function now(): string {
  return new Date().toISOString();
}

export function log(
  action: string,
  level: LogLevel = 'info',
  extra: Record<string, unknown> = {},
): void {
  const e: LogEntry = {
    ts: now(),
    level,
    role: 'ui',
    session_id: sessionId,
    action,
    ...extra,
  };
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(e);
  scheduleFlush();
}

/** Логгирование ошибки (Error/неизвестное) со стаком. */
export function logError(action: string, err: unknown, extra: Record<string, unknown> = {}): void {
  let message = String(err);
  let stack: string | undefined;
  if (err instanceof Error) {
    message = err.message || String(err);
    stack = err.stack?.split('\n').slice(0, 6).join(' | ');
  }
  log(action, 'error', { error: message.slice(0, 400), stack, ...extra });
}

function scheduleFlush(): void {
  if (timer !== null || queue.length === 0) return;
  timer = window.setTimeout(flush, 2000);
}

export async function flush(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  try {
    const batch = queue.splice(0, FLUSH_LIMIT);
    const url = (baseUrl || base()) + '/log';
    const ctrl = new AbortController();
    const to = window.setTimeout(() => ctrl.abort(), 3000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: batch }),
      signal: ctrl.signal,
    }).catch(() => {
      /* sidecar офлайн — возвращаем в очередь, но не бесконечно */
      if (queue.length + batch.length <= MAX_QUEUE) queue.unshift(...batch);
    }).finally(() => window.clearTimeout(to));
    if (queue.length > 0) scheduleFlush();
  } finally {
    flushing = false;
  }
}

// Фоновая флеш + флеш при закрытии вкладки (best effort).
if (typeof window !== 'undefined') {
  window.setInterval(() => void flush(), 10000);
  window.addEventListener('pagehide', () => void flush());
}
