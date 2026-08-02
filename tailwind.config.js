/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f2',
          100: '#d6ecdf',
          200: '#aed8c0',
          300: '#7fc09d',
          400: '#52a77c',
          500: '#2f8d60',
          600: '#23704c',
          700: '#1d5a3f',
          800: '#184733',
          900: '#123527',
        },
      },
    },
  },
  plugins: [],
};
