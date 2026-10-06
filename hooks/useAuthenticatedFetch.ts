'use client'

import { useCallback } from 'react'
import { useAppBridge } from '@shopify/app-bridge-react'

/**
 * Returns a fetch wrapper that automatically attaches the Shopify session token
 * as `Authorization: Bearer <token>` on every request.
 *
 * Use this instead of bare `fetch()` in all client components that call API routes.
 */
export function useAuthenticatedFetch() {
  let app: ReturnType<typeof useAppBridge> | null = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    app = useAppBridge()
  } catch {
    // Outside App Bridge context (direct access / dev without Shopify)
  }

  return useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
      }
      // Don't set Content-Type for FormData — the browser sets the multipart boundary.
      if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
      }

      if (app) {
        try {
          const token = await app.idToken()
          headers['Authorization'] = `Bearer ${token}`
        } catch {
          // token unavailable — proceed unauthenticated (dev fallback)
        }
      }

      return fetch(url, { ...options, headers })
    },
    [app]
  )
}
