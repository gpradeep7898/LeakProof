'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-gray-600 mb-4 text-sm">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-teal text-white rounded-lg font-medium hover:bg-teal-600 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
