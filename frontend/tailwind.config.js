/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          blue: '#1E3A8A',
          teal: '#06B6D4',
        },
        success: '#10B981',
        warning: '#EF4444',
        dark: {
          bg: '#111827',
          secondary: '#1F2937',
          text: '#F9FAFB',
          'text-secondary': '#9CA3AF',
          border: '#374151',
        },
        light: {
          bg: '#FFFFFF',
          secondary: '#F9FAFB',
          text: '#111827',
          'text-secondary': '#6B7280',
          border: '#E5E7EB',
        },
        message: {
          user: {
            from: '#3B82F6',
            to: '#2563EB',
          },
          bot: {
            light: '#FFFFFF',
            dark: '#1F2937',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'monospace'],
      },
      spacing: {
        'sidebar': '256px',
      },
      borderRadius: {
        'message': '16px',
      },
      boxShadow: {
        'message': '0 4px 6px rgba(0, 0, 0, 0.1)',
        'message-dark': '0 4px 6px rgba(0, 0, 0, 0.3)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.6s ease-out forwards',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}