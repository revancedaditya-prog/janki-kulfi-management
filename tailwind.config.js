/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        maroon: {
          50: '#FDF2F4',
          100: '#FBE4E8',
          200: '#F7CBD3',
          300: '#EFA6B4',
          400: '#E2768E',
          500: '#CE4B6B',
          600: '#B02F50',
          700: '#8E1F3C',
          800: '#6B1426',
          900: '#4D0E1B',
          950: '#32060F',
        },
        cream: {
          50: '#FEFCF9',
          100: '#FDF8F0',
          200: '#FAF1E2',
          300: '#F5E6CC',
          400: '#EDD4AE',
          500: '#E0BC89',
        },
        saffron: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
