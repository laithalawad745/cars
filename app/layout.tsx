import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'لعبة تجميع السيارة - Car Assembly Game',
  description: 'لعبة اجتماعية متعددة اللاعبين مع التفاوض والخداع',
  keywords: 'game, multiplayer, arabic, car, assembly, social, negotiation',
  authors: [{ name: 'Car Assembly Game Team' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#1e1b4b',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}