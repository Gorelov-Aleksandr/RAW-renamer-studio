import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import sidecarProxy from './sidecar-proxy';

export default defineConfig({
  plugins: [react(), sidecarProxy()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  clearScreen: false,
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
