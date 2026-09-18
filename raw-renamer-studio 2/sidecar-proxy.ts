/**
 * Vite dev-прокси к Python sidecar.
 * Порт sidecar динамический (--port 0): сервер пишет его в .sidecar/port
 * (см. SIDECAR_READY, master §8.1). Проксироваться: /rpc, /preview/*, /upload.
 * В Tauri dev (devUrl localhost:5173) работает так же; в release фронт ходит
 * напрямую на http://127.0.0.1:<port> (событие sidecar://ready).
 */
import type { Plugin } from 'vite';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default function sidecarProxy(): Plugin {
  const portFile = process.env.SIDECAR_PORT_FILE || path.join(here, '.sidecar', 'port');

  const isSidecarPath = (u: string) =>
    u === '/upload' || u.startsWith('/upload?') || u.startsWith('/rpc') || u.startsWith('/preview/');

  return {
    name: 'rawrenamer-sidecar-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const u = req.url || '';
        if (!isSidecarPath(u)) return next();
        let port: number | null = null;
        try {
          port = parseInt(fs.readFileSync(portFile, 'utf8').trim(), 10);
        } catch {
          /* sidecar ещё не поднялся */
        }
        if (!port || Number.isNaN(port)) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'sidecar offline' }));
          return;
        }
        const headers = { ...req.headers };
        delete headers.host;
        headers.host = `127.0.0.1:${port}`;
        const proxyReq = http.request(
          { host: '127.0.0.1', port, path: u, method: req.method || 'GET', headers },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );
        proxyReq.on('error', () => {
          if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'sidecar unreachable' }));
        });
        req.pipe(proxyReq);
      });
    },
  };
}
