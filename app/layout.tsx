import type { Metadata } from 'next'
import { ToasterProvider } from '@/app/components/ToasterProvider'
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
        {children}
        <ToasterProvider />
      </body>
    </html>
  )
}
