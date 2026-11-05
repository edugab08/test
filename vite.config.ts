import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // nova versão no Vercel entra sozinha, sem ficar presa no cache
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Finanças a Dois',
        short_name: 'A Dois',
        description: 'As finanças do casal, cada um com a sua conta.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#060912',
        theme_color: '#060912',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [{ urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'fonts' } }]
      }
    })
  ],
  test: { environment: 'node' }
});
