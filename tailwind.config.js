/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Nunito', 'system-ui', 'sans-serif'],
        body: ['Nunito', 'system-ui', 'sans-serif'],
      },
      colors: {
        woof: {
          cream: '#f2fbf4',
          blush: '#e6f8ee',
          pink: '#22c55e',
          peach: '#4ade80',
          mint: '#30c997',
          sky: '#6ee7b7',
          lilac: '#bbf7d0',
          sunny: '#bef264',
          ink: '#0f172a',
        },
      },
      boxShadow: {
        bubble: '0 6px 24px -6px rgba(34, 197, 94, 0.35)',
        card: '0 4px 20px -6px rgba(15, 23, 42, 0.18)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        wiggle: 'wiggle 1.2s ease-in-out infinite',
        fadeIn: 'fadeIn 0.25s ease-out',
      },
    },
  },
  plugins: [],
}