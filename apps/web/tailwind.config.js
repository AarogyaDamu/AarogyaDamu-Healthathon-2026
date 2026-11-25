/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
        },
        /* Premium Healthcare Palette */
        navy: {
          DEFAULT: '#101A2E',
          surface: '#17243A',
          light: '#1E2D45',
        },
        'clinical-bg': '#F4F7FA',
        /* Material Design 3 token aliases — resolve broken MD3 classes */
        primary: {
          DEFAULT: '#0d9488',
          container: '#0f766e',
          fixed: '#ccfbf1',
        },
        'on-surface': '#172033',
        'on-surface-variant': '#65748B',
        'surface-container': '#F1F5F9',
        'surface-container-lowest': '#FFFFFF',
        'surface-container-low': '#F8FAFC',
        'surface-container-high': '#E8ECF1',
        'outline-variant': '#CBD5E1',
        tertiary: '#6366F1',
        error: {
          DEFAULT: '#E45B66',
          container: '#FEE2E2',
        },
        'on-error-container': '#991B1B',
        'primary-fixed': '#ccfbf1',
      },
      fontFamily: {
        body: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        headline: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        label: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}