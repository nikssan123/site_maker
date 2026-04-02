import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * When VITE_PREVIEW_USE_HOST_PORT is false, the iframe loads same-origin `/preview-app/:id/`.
 * Vite dev (port 5173) must proxy that path to nginx so requests reach app-runner.
 * Docker Compose sets VITE_PREVIEW_PROXY_TARGET=http://nginx; local dev defaults to host port 80.
 */
const previewProxyTarget = process.env.VITE_PREVIEW_PROXY_TARGET || 'http://127.0.0.1';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/preview-app': {
        target: previewProxyTarget,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // nginx routes /preview-app/ on the localhost server_name — not the default_server catch-all
            proxyReq.setHeader('Host', 'localhost');
          });
        },
      },
    },
  },
});
