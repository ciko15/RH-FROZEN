import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

import { spawn } from 'child_process';

function backendServerPlugin() {
  let backendProc = null;
  return {
    name: 'backend-dev-server',
    configureServer(server) {
      if (!process.env.VITE_BACKEND_STARTED) {
        process.env.VITE_BACKEND_STARTED = '1';
        try {
          backendProc = spawn('node', ['scripts/dev-server.mjs'], {
            stdio: 'inherit',
            cwd: path.resolve(__dirname)
          });
          backendProc.on('error', (err) => {
            console.error('[BACKEND DEV SERVER ERROR]', err);
          });
        } catch (e) {
          console.error('[BACKEND LAUNCH FAILED]', e);
        }
      }

      server.httpServer?.on('close', () => {
        if (backendProc) {
          backendProc.kill();
        }
      });
    }
  };
}

export default defineConfig(({ command, mode }) => ({
  root: './web',
  plugins: [
    vue(),
    command === 'serve' ? backendServerPlugin() : null,
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'Sales Terpadu',
        short_name: 'Sales',
        description: 'Aplikasi Mobile Web PWA Sales Terpadu',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1d4ed8',
        background_color: '#eef3fb',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*$/,
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'api-queue',
                options: {
                  maxRetentionTime: 24 * 60
                }
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './web/src')
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    host: '0.0.0.0',
    port: 9000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9001',
        changeOrigin: true
      }
    }
  }
}));
