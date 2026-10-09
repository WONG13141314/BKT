import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'CLOUDFLARE_']);
  const cloudflare = mode === 'cloudflare'
    || env.VITE_REALTIME_TRANSPORT === 'websocket'
    || process.env.VITE_REALTIME_TRANSPORT === 'websocket';
  const backendTarget = env.CLOUDFLARE_DEV_URL || 'http://localhost:8787';
  return {
    ...(mode === 'cloudflare' ? {
      define: {
        'import.meta.env.VITE_REALTIME_TRANSPORT': JSON.stringify('websocket'),
        'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
        'import.meta.env.VITE_SOCKET_URL': JSON.stringify('/ws'),
      },
    } : {}),
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: cloudflare ? backendTarget : 'http://localhost:3001',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
        },
        ...(cloudflare ? { '/ws': { target: backendTarget, ws: true, changeOrigin: true } } : {}),
      },
    },
  };
});
