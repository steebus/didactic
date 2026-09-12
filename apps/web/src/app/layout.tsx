import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Fraunces, Archivo } from 'next/font/google'
import './globals.css'
import { Bench } from '@/components/Bench'
import { TendNotice } from '@/components/TendNotice'

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
          {children}
        </Bench>
      </body>
    </html>
  )
}
