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
      { src: '/inj-pass-favicon.png', sizes: '192x192', type: 'image/png' },
      { src: '/inj-pass-favicon.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
