import type { MetadataRoute } from 'next';

/**
 * Installability is what earns durable storage: Chrome auto-grants
 * `navigator.storage.persist()` to installed sites, and WebKit exempts Home
 * Screen web apps from its 7-day cap on script-writable storage.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'INJ Pass',
    short_name: 'INJ Pass',
    description: 'Passkey-powered wallet for Injective',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/logo/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/logo/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/logo/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
