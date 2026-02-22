import type { Metadata } from 'next'
import { Providers } from '@/app/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'LeakProof - Find Revenue Leaks Before They Sink You',
  description: 'LeakProof turns your Shopify data into plain-English answers about your biggest revenue opportunities.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
