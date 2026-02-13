import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: '#0EA5A4',
          50: '#f0fdfc',
          100: '#ccfbf6',
          200: '#99f6eb',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0EA5A4',
          700: '#0d9488',
          800: '#0f766e',
          900: '#115e59',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
