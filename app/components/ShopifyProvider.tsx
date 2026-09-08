'use client'

import { Suspense } from 'react'
import { AppProvider } from '@shopify/polaris'
import '@shopify/polaris/build/esm/styles.css'
import en from '@shopify/polaris/locales/en.json'

interface Props {
  children: React.ReactNode
}

// App Bridge v4 initializes automatically when embedded in Shopify Admin.
// No explicit Provider wrapper is needed — useAppBridge() works out of the box.
// Polaris AppProvider is still required for the Polaris component system.
export default function ShopifyProvider({ children }: Props) {
  return (
    <Suspense fallback={null}>
      <AppProvider i18n={en}>
        {children}
      </AppProvider>
    </Suspense>
  )
}
