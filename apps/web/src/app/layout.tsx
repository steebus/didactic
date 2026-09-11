import type { Metadata } from 'next'
import { Fraunces, Archivo } from 'next/font/google'
import './globals.css'
import { Bench } from '@/components/Bench'

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
        <Bench>{children}</Bench>
      </body>
    </html>
  )
}
