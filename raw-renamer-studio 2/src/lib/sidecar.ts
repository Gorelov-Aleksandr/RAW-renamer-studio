/**
 * Клиент Python Sidecar (master §8).
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

let baseUrl = '';
let seq = 0;

export function base(): string {
  return baseUrl;
}

export function setBaseUrl(b: string): void {
  baseUrl = b;
}

export async function rpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 120000,
): Promise<T> {
  const id = ++seq;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl + '/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new SidecarError(`HTTP ${res.status}`, -1);
    const j = (await res.json()) as { result?: T; error?: { code: number; message: string } };
    if (j.error) throw new SidecarError(j.error.message, j.error.code);
    return j.result as T;
  } catch (e) {
    if (e instanceof SidecarError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new SidecarError('Таймаут запроса к sidecar', -1);
    throw new SidecarError('Sidecar недоступен', -1);
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

export interface SidecarStatus {
  status: 'online' | 'offline';
  port?: number;
}

export type SidecarEvent =
  | { kind: 'ready'; port: number }
  | { kind: 'dead'; code: number }
  | { kind: 'error'; message: string };

export function initSidecar(
  onStatus: (s: SidecarStatus) => void,
  onEvent?: (e: SidecarEvent) => void,
): void {
  let failCount = 0;
  const beat = async () => {
    try {
      await rpc('system.heartbeat', {}, 3500);
      failCount = 0;
      onStatus({ status: 'online' });
    } catch {
      failCount += 1;
      if (failCount >= 2) onStatus({ status: 'offline' });
    }
  };
  beat();
  window.setInterval(beat, 3000);

  // Tauri: события sidecar://ready|dead|error + опрос sidecar_url
  // (страховка от гонки: READY мог улететь до подписки фронтенда).
  void (async () => {
    try {
      const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
      if (!w.__TAURI_INTERNALS__) return;
      const { listen } = await import('@tauri-apps/api/event');
      const { invoke } = await import('@tauri-apps/api/core');

      await listen<{ port: number }>('sidecar://ready', (e) => {
        setBaseUrl(`http://127.0.0.1:${e.payload.port}`);
        onStatus({ status: 'online', port: e.payload.port });
        onEvent?.({ kind: 'ready', port: e.payload.port });
      });
      await listen<{ code: number }>('sidecar://dead', (e) => {
        onEvent?.({ kind: 'dead', code: e.payload.code });
      });
      await listen<{ message: string }>('sidecar://error', (e) => {
        onEvent?.({ kind: 'error', message: e.payload.message });
      });

      // Опрос: если событие ready упустили, узнаём URL напрямую.
      const t0 = Date.now();
      const poll = window.setInterval(async () => {
        try {
          const url = await invoke<string>('sidecar_url');
          if (url) {
            setBaseUrl(url);
            const port = Number(url.split(':')[2]) || undefined;
            onStatus({ status: 'online', port });
            window.clearInterval(poll);
          } else if (Date.now() - t0 > 20000) {
            window.clearInterval(poll);
          }
        } catch {
          /* ignore — повторимся через 500 мс */
        }
      }, 500);
    } catch {
      /* браузерный режим: относительный URL через vite-прокси */
    }
  })();
}
