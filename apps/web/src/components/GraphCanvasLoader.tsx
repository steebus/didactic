'use client'

import dynamic from 'next/dynamic'

// Sigma reaches for WebGL2RenderingContext at module evaluation, which
// throws during SSR even inside a client component. It has to load in
// the browser only.
export const GraphCanvas = dynamic(
  () => import('./GraphCanvas').then(m => m.GraphCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--paper)',
          fontFamily: 'var(--font-display)',
          color: 'var(--ink-faint)',
        }}
      >
        Reading the bed…
      </div>
    ),
  }
)
