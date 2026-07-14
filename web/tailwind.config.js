/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        accent: 'var(--accent)',
        surface: 'var(--surface)',
      },
    },
  },
  plugins: [],
};
