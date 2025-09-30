import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        brand: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        accent: {
          50:  '#ECFEFF',
          200: '#A5F3FC',
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        ink: {
          1: '#0F172A',
          2: '#475569',
        },
        surface: {
          bg:    '#F8FAFC',
          card:  '#FFFFFF',
          line:  '#E2E8F0',
        },
        success: '#10B981',
        warning: '#F59E0B',
        danger:  '#EF4444',
      },
      boxShadow: {
        soft: '0 8px 30px rgba(2, 6, 23, 0.06)',
        card: '0 6px 24px -8px rgba(0,0,0,0.45), 0 2px 8px -2px rgba(0,0,0,0.35)',
        glow: '0 0 0 1px rgba(34,211,238,0.25), 0 12px 40px -12px rgba(99,102,241,0.35)',
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        pill: '9999px',
      },
      backgroundImage: {
        'radial-soft': 'radial-gradient(1200px 600px at 0% -10%, rgba(99,102,241,0.18), transparent 60%)',
        grid: 'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '28px 28px',
      }
    },
  },
  plugins: [],
}

export default config
