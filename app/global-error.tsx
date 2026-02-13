'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-600 mb-6 text-sm">{error.message}</p>
          <button
            onClick={() => reset()}
            className="px-6 py-2 bg-teal text-white rounded-lg font-medium hover:bg-teal-600"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
