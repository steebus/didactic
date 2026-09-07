import type { Metadata } from 'next'
import { Fraunces, Archivo } from 'next/font/google'
import './globals.css'

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
      <body>{children}</body>
    </html>
  )
}
