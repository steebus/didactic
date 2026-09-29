import type { MetadataRoute } from 'next'

/**
 * What makes the web app installable, and a place to share things to.
 *
 * Installed from Chrome on Android, Didactic is listed in every app's
 * share sheet: `share_target` hands whatever was shared to `/send`, which
 * saves it to the inbox. The colours are the paper and the band's plate,
 * so the splash and the title bar are the catalogue's own.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Didactic',
    short_name: 'Didactic',
    description: 'A living map of what you are learning.',
    start_url: '/',
    display: 'standalone',
    background_color: '#efe7d6',
    theme_color: '#2f5233',
    icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
    share_target: {
      action: '/send',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    },
  }
}
