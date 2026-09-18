/**
 * Клиент Python-движок (master §8).
 *
 * Браузер / Tauri-dev: относительные URL /rpc, /preview/* — Vite-прокси
 * тащит их на 127.0.0.1:<порт из .sidecar/port>.
 * Tauri-release: базовый URL выставляется по событию sidecar://ready
 * (Rust парсит первую строку stdout: SIDECAR_READY).
 *
 * Защита от зомби (master §8.1): heartbeat каждые 3 с → system.heartbeat.
 */

export class SidecarError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

import { getSessionId, log, logError, setLogBaseUrl } from './logger';

let baseUrl = '';
let seq = 0;

export function base(): string {
  return baseUrl;
}

export function setBaseUrl(b: string): void {
  baseUrl = b;
  setLogBaseUrl(b); // v3.3: логгер шлёт батчи на тот же sidecar
}

export async function rpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 120000,
): Promise<T> {
  const id = ++seq;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(baseUrl + '/rpc', {
      method: 'POST',
      // v3.3: X-RRS-Session — корреляция запроса с логами sidecar
      headers: { 'Content-Type': 'application/json', 'X-RRS-Session': getSessionId() },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      log('rpc_http_error', 'warn', { method, status: res.status, elapsed_ms: Math.round(performance.now() - t0) });
      throw new SidecarError(`HTTP ${res.status}`, -1);
    }
    const j = (await res.json()) as { result?: T; error?: { code: number; message: string } };
    if (j.error) {
      log('rpc_error', 'warn', { method, code: j.error.code, error: j.error.message });
      throw new SidecarError(j.error.message, j.error.code);
    }
    return j.result as T;
  } catch (e) {
    if (e instanceof SidecarError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      logError('rpc_timeout', e, { method, timeout_ms: timeoutMs });
      throw new SidecarError('Таймаут запроса к sidecar', -1);
    }
    logError('rpc_unreachable', e, { method });
    throw new SidecarError('Движок недоступен', -1);
  } finally {
    clearTimeout(to);
  }
}

export const previewUrl = (hash: string | null | undefined, size = 320): string =>
  hash ? `${baseUrl}/preview/${hash}?size=${size}` : '';

export function uploadFile(
  file: File,
  dir?: string,
): Promise<{ path: string; name: string; size: number }> {
  const fd = new FormData();
  fd.append('file', file);
  if (dir) fd.append('dir', dir);
  return fetch(baseUrl + '/upload', { method: 'POST', body: fd }).then(async (res) => {
    if (!res.ok) throw new SidecarError(`HTTP ${res.status} при загрузке файла`, -1);
    return (await res.json()) as { path: string; name: string; size: number };
  });
}

/** Десктопный режим (Tauri) или браузер (dev-превью). */
export function isTauri(): boolean {
  try {
    return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
  } catch {
    return false;
  }
}

/**
 * ЗАМ-001: раздельные состояния движка.
 *  starting — до первого подтверждённого online (холодный старт 3–10 с — норма);
 *  online   — heartbeat/READY подтверждают;
 *  offline  — был online и перестал отвечать, либо sidecar умер.
 */
export type EngineState = 'starting' | 'online' | 'offline';

export interface SidecarStatus {
  status: EngineState;
  port?: number;
}

export type SidecarEvent =
  | { kind: 'ready'; port: number }
  | { kind: 'dead'; code: number }
  | { kind: 'error'; message: string }
  | { kind: 'progress'; stage: number }; // v3.5: 0=запущен, 1=импорты, 2=слушает, 3=ready

const T0 = performance.now();
const ts = () => `+${((performance.now() - T0) / 1000).toFixed(1)}s`;

export function initSidecar(
  onStatus: (s: SidecarStatus) => void,
  onEvent?: (e: SidecarEvent) => void,
): void {
  let failCount = 0;
  let baseUrlAt = 0; // BUG-015: момент получения URL (для grace-периода)
  const markOnline = (port?: number) => {
    failCount = 0;
    onStatus({ status: 'online', port });
  };
  const beat = async () => {
    try {
      await rpc('system.heartbeat', {}, 3500);
      markOnline();
    } catch {
      failCount += 1;
      // Оффлайн не «вздрагивает» на первых 10 с после получения URL
      // (uvicorn уже принял, но первые запросы на холодном PyInstaller
      // бинарнике могут быть медленнее таймаута heartbeat).
      if (failCount >= 2 && Date.now() - baseUrlAt > 10000) {
        console.info(`[sidecar] offline: ${failCount} подряд heartbeat не прошли (${ts()})`);
        onStatus({ status: 'offline' });
      }
    }
  };

  // FIX BUG-015: в Tauri не дёргаем heartbeat, пока baseUrl пуст (иначе зря
  // зажигаем offline). В браузере URL относительный (vite-прокси) — бьём сразу.
  const beatable = () => baseUrl !== '' || !isTauri();
  if (beatable()) {
    baseUrlAt = Date.now();
    beat();
  }
  window.setInterval(() => { if (beatable()) beat(); }, 3000);

  void (async () => {
    try {
      const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
      if (!w.__TAURI_INTERNALS__) return;

      const { invoke } = await import('@tauri-apps/api/core');

      // FIX BUG-015 (шаг 1): сначала пробуем получить URL напрямую,
      // до подписки на события — устраняем гонку "READY улетел раньше listen".
      let reportedError = '';
      const probe = async (): Promise<boolean> => {
        try {
          // ЗАМ-001/004: спрашиваем последнюю ошибку супервизора (нет
          // бинарника, не запустили, лимит ретраев) — событие sidecar://error
          // могло улететь ДО подписки вебвью. Опрос не останавливаем:
          // часть ошибок (spawn) проходит после ретрая.
          const fatal = await invoke<string | null>('sidecar_error');
          if (fatal && !baseUrl) {
            onStatus({ status: 'offline' });
            if (fatal !== reportedError) {
              reportedError = fatal;
              console.info(`[sidecar] ошибка супервизора: ${fatal} (${ts()})`);
              onEvent?.({ kind: 'error', message: fatal });
            }
          }
          const url = await invoke<string>('sidecar_url');
          if (url && !baseUrl) {
            reportedError = ''; // восстановление — старую ошибку забываем
            baseUrlAt = Date.now();
            setBaseUrl(url);
            const port = Number(url.split(':')[2]) || undefined;
            console.info(`[sidecar] URL получен: ${url} (${ts()})`);
            markOnline(port);
            onEvent?.({ kind: 'ready', port: port ?? 0 });
            return true;
          }
        } catch { /* sidecar ещё не готов */ }
        return false;
      };

      if (await probe()) { /* уже online */ }

      const { listen } = await import('@tauri-apps/api/event');

      await listen<{ port: number }>('sidecar://ready', (e) => {
        baseUrlAt = Date.now(); // каждый READY = (возможно) новый экземпляр — grace заново
        setBaseUrl(`http://127.0.0.1:${e.payload.port}`);
        console.info(`[sidecar] событие ready: порт ${e.payload.port} (${ts()})`);
        markOnline(e.payload.port);
        onEvent?.({ kind: 'ready', port: e.payload.port });
      });
      await listen<{ code: number }>('sidecar://dead', (e) => {
        console.info(`[sidecar] событие dead: code=${e.payload.code} (${ts()})`);
        onStatus({ status: 'offline' });
        onEvent?.({ kind: 'dead', code: e.payload.code });
      });
      await listen<{ message: string }>('sidecar://error', (e) => {
        // Ошибки супервизора (нет бинарника, не запустить, лимит ретраев) —
        // движок мёртв, не сидим в «запуск…» вечно.
        console.info(`[sidecar] событие error: ${e.payload.message} (${ts()})`);
        onStatus({ status: 'offline' });
        onEvent?.({ kind: 'error', message: e.payload.message });
      });
      // v3.5: стадии запуска → прогресс-индикатор (реальный прогресс Python-фазы).
      await listen<{ stage: number }>('sidecar://progress', (e) => {
        onEvent?.({ kind: 'progress', stage: e.payload.stage });
      });

      // FIX BUG-015 (шаг 2): poll без 20-секундного дедлайна.
      // Крутится до успеха с backoff 250ms → 3000ms.
      let delay = 250;
      const tick = async (): Promise<void> => {
        if (baseUrl) return;
        if (await probe()) return;
        delay = Math.min(delay * 1.5, 3000);
        window.setTimeout(tick, delay);
      };
      window.setTimeout(tick, 250);
    } catch {
      /* браузерный режим: относительный URL через vite-прокси */
    }
  })();
}
