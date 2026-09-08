import type { Metadata } from 'next'
import ShopifyProvider from '@/app/components/ShopifyProvider'
import { ToasterProvider } from '@/app/components/ToasterProvider'
import { QueryProvider } from '@/app/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'LeakProof — Profit Analytics for Shopify',
  description: 'Find where money leaks from your Shopify store and fix it in minutes.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ShopifyProvider>
          <QueryProvider>
            {children}
            <ToasterProvider />
          </QueryProvider>
        </ShopifyProvider>
      </body>
    </html>
  )
}
