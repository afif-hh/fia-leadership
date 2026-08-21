import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/components/**/*.{js,vue,ts}',
    './app/layouts/**/*.vue',
    './app/pages/**/*.vue',
    './app/plugins/**/*.{js,ts}',
    './app/app.vue',
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          700: 'var(--primary-700)',
          600: 'var(--primary-600)',
          500: 'var(--primary-500)',
          300: 'var(--primary-300)',
        },
        on: {
          primary: 'var(--on-primary)',
        },
        secondary: 'var(--secondary)',
        background: 'var(--background)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          sunken: 'var(--surface-sunken)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        overlay: 'var(--overlay)',
        ink: {
          900: 'var(--ink-900)',
        },
        body: {
          700: 'var(--body-700)',
        },
        muted: {
          500: 'var(--muted-500)',
        },
        disabled: {
          400: 'var(--disabled-400)',
        },
        success: {
          700: 'var(--success-700)',
          bg: 'var(--success-bg)',
        },
        warning: {
          800: 'var(--warning-800)',
          bg: 'var(--warning-bg)',
        },
        danger: {
          700: 'var(--danger-700)',
          bg: 'var(--danger-bg)',
        },
        info: {
          700: 'var(--info-700)',
        },
        link: 'var(--link)',
        chart: {
          'series-1': 'var(--chart-series-1)',
          'series-2': 'var(--chart-series-2)',
          'series-3': 'var(--chart-series-3)',
          'series-4': 'var(--chart-series-4)',
          'series-5': 'var(--chart-series-5)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        'display-lg': ['var(--text-display-lg)', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['var(--text-display-md)', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'heading-lg': ['var(--text-heading-lg)', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '600' }],
        'heading-md': ['var(--text-heading-md)', { lineHeight: '1.3', fontWeight: '600' }],
        'heading-sm': ['var(--text-heading-sm)', { lineHeight: '1.35', fontWeight: '600' }],
        'body-lg': ['var(--text-body-lg)', { lineHeight: '1.6' }],
        'body-md': ['var(--text-body-md)', { lineHeight: '1.55' }],
        'body-sm': ['var(--text-body-sm)', { lineHeight: '1.5' }],
        'caption': ['var(--text-caption)', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        'button-md': ['var(--text-button-md)', { lineHeight: '1.0', fontWeight: '600' }],
        'data-value': ['var(--text-data-value)', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '700' }],
        'code-sm': ['var(--text-code-sm)', { lineHeight: '1.5' }],
      },
      spacing: {
        '1': 'var(--space-1)',
        '2': 'var(--space-2)',
        '3': 'var(--space-3)',
        '4': 'var(--space-4)',
        '6': 'var(--space-6)',
        '8': 'var(--space-8)',
        '12': 'var(--space-12)',
        '16': 'var(--space-16)',
        '24': 'var(--space-24)',
      },
      borderRadius: {
        'none': 'var(--radius-none)',
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
        'full': 'var(--radius-full)',
      },
      boxShadow: {
        'level1': 'var(--shadow-level1)',
        'level2': 'var(--shadow-level2)',
        'level3': 'var(--shadow-level3)',
        'level4': 'var(--shadow-level4)',
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '200ms',
        'slow': '300ms',
      },
      transitionTimingFunction: {
        'ease': 'ease',
      },
      maxWidth: {
        'content': '1440px',
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
    },
  },
  plugins: [],
} satisfies Config
