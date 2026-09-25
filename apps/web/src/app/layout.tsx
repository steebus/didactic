import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Fraunces, Archivo } from 'next/font/google'
import './globals.css'
import { Bench } from '@/components/Bench'
import { Player } from '@/components/Player'
import { AskButton } from '@/components/AskButton'
import { TendNotice } from '@/components/TendNotice'
import { SheetFoot } from '@/components/SheetFoot'

const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['SOFT', 'WONK', 'opsz'],
  variable: '--font-display-loaded',
  display: 'swap',
})

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-text-loaded',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Didactic',
  description: 'A living map of what you are learning.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${archivo.variable}`}>
      <head>
        {/* Stamp the stored choice before the first paint.

            Without this the sheet renders under the system's lighting,
            then corrects itself once React has mounted -- which is a
            white flash in a dark room, on every navigation, for the one
            reader who has explicitly asked for dark. It has to be
            inline and it has to be in the head: anything deferred is
            by definition after the paint it exists to beat.

            Wrapped in its own try/catch because a browser with site
            data blocked throws on `localStorage`, and a sheet that
            renders is worth more than a remembered preference. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('didactic-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        {/* Above the router, so work set going on one sheet outlives
            walking off to another. Everything in the catalogue is
            inside it, which is what makes the notices site-wide. */}
        <Bench>
          {/* Inside the bench, because what it puts up is a notice on
              the bench; above the router, so its four hours are counted
              across the whole visit rather than restarted by every
              navigation.

              Behind a boundary because it reads the address it is
              standing at -- it must not ask you to tend the garden
              while you are already in it -- and a client hook that
              reads URL data in the root layout blocks the static shell
              of every route in the catalogue. There is no fallback
              because there is nothing to fall back to: the notice
              renders nothing until it has something to say, so what
              streams in after the shell is a notice or silence. */}
          <Suspense fallback={null}>
            <TendNotice />
          </Suspense>
          {/* Inside the bench, because queueing a reading is a bench
              job like any other; above the router, because that is the
              whole point of it. A player mounted under a route would
              stop the moment the reader opened the map, which is
              exactly when they want it still running. The <audio>
              element it owns is never re-parented, so navigation does
              not interrupt a word.

              The sheet, then the strip of press bed under it. The foot
              is the player's second child rather than its sibling
              because the player renders what it is given first and its
              own furniture after, so this lands at the end of the
              document where a foot belongs -- and outside `main`,
              which is the contract everything at the foot already
              keeps.

              Behind a boundary for the same reason the notice above
              is: it reads the address it is standing at, to leave the
              bed map alone, and a client hook that reads URL data in
              the root layout blocks the static shell of every route in
              the catalogue. No fallback, because a foot that streams
              in a moment after the sheet is a foot arriving where it
              was always going to be. */}
          <Player>
            {children}
            <Suspense fallback={null}>
              <SheetFoot />
            </Suspense>
          </Player>
          {/* The other corner of the foot. Outside `main` like everything
              else docked down there, and inside the bench so it stands on
              the notices the way the player's disc does.

              Behind a boundary for the reason the notice and the player
              above it are: it reads the address it is standing at, to
              tell the agent which sheet the question came from, and a
              client hook that reads URL data in the root layout blocks
              the static shell of every route in the catalogue. No
              fallback, because there is nothing to fall back to -- a
              disc that streams in a moment after the sheet is a disc
              arriving where it was always going to be. */}
          <Suspense fallback={null}>
            <AskButton />
          </Suspense>
        </Bench>
      </body>
    </html>
  )
}
