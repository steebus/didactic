import type { MetadataRoute } from 'next'

/**
 * What makes the web app installable, and a place to share things to.
 *
 * Installed from Chrome on Android, Didactic is listed in every app's
 * share sheet, for links, text and PDFs: `share_target` hands whatever
 * was shared to `/send`, which saves it to the inbox. The colours are the
 * paper and the band's plate, so the splash and the title bar are the
 * catalogue's own.
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
    // A POST, so a file can come: a PDF shared from Files, Drive or a
    // browser's downloads. The service worker (`public/sw.js`) takes it
    // on the phone, and a link is handed on to `/send?url=` as before.
    share_target: {
      action: '/send',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [{ name: 'file', accept: ['application/pdf', '.pdf'] }],
      },
    },
  }
}
