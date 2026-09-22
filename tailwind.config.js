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
          cream: '#fff8ef',
          blush: '#fdf2f8',
          pink: '#f472b6',
          peach: '#fb923c',
          mint: '#5eead4',
          sky: '#7dd3fc',
          lilac: '#c4b5fd',
          sunny: '#fde68a',
          ink: '#0f172a',
        },
      },
      boxShadow: {
        bubble: '0 6px 24px -6px rgba(244, 114, 182, 0.35)',
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