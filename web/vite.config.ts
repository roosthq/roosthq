import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// allowedHosts: true lets the dev/preview server accept the public tunnel hostname
// (e.g. roosthq.sheac.com) forwarded by Caddy. In dev, /api is proxied to the API.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
});
