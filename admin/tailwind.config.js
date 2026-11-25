/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Shared with the storefront — unified pure-white luxury & obsidian identity.
        brand: {
          cream: '#FFFFFF',
          ivory: '#FFFFFF',
          charcoal: '#11100F',
          night: '#1A1817',
          gold: '#D8B878',
          goldDark: '#C89B3C',
          border: '#E5E5E5',
          muted: '#6E6E6E',
          surface: '#F5F5F5',
          // Admin surfaces:
          paper: '#FFFFFF', // card ground
          goldInk: '#5F4813', // on-primary-container — text sitting on gold
          goldDeep: '#735B24', // primary — deep gold for icons and rules
        },
        // Deep obsidian chrome contrasting against pure white.
        shell: {
          obsidian: '#11100F',
          ink: '#FFFFFF',
        },
        surface: {
          dim: '#E2E2E2',
          low: '#FFFFFF',
          DEFAULT: '#F8F8F8',
          high: '#F2F2F2',
          highest: '#EAEAEA',
        },
        ink: {
          DEFAULT: '#11100F',
          variant: '#454545',
          muted: '#6E6E6E',
        },
        outline: {
          DEFAULT: '#737373',
          variant: '#E2E2E2',
        },
        bronze: '#737373',
        error: '#BA1A1A',
        // Fulfilment and stock states.
        state: {
          pending: '#8C4F1A',
          pendingSurface: '#F6F6F6',
          active: '#1F4E6B',
          activeSurface: '#EFF6FA',
          done: '#1C402E',
          doneSurface: '#F3F8F5',
          halted: '#5C131D',
          haltedSurface: '#FFF5F6',
        },
        tier: {
          original: '#5C131D',
          originalSurface: '#FFF5F6',
          inspired: '#3B2354',
          inspiredSurface: '#F8F5FD',
          mixed: '#8C4F1A',
          mixedSurface: '#F6F6F6',
          custom: '#1C402E',
          customSurface: '#F3F8F5',
        },
      },
      fontFamily: {
        serif: ['"Poppins"', 'system-ui', 'sans-serif'],
        sans: ['"Poppins"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['56px', { lineHeight: '68px', letterSpacing: '-0.02em' }],
        'headline-xl': ['40px', { lineHeight: '48px', letterSpacing: '-0.015em' }],
        'headline-md': ['24px', { lineHeight: '32px' }],
        'headline-sm': ['18px', { lineHeight: '24px', letterSpacing: '0.01em' }],
        'body-lg': ['18px', { lineHeight: '28px' }],
        'body-md': ['15px', { lineHeight: '24px' }],
        'body-sm': ['13px', { lineHeight: '20px' }],
        'label-lg': ['13px', { lineHeight: '16px', letterSpacing: '0.08em' }],
        'label-md': ['11px', { lineHeight: '14px', letterSpacing: '0.12em' }],
        'label-sm': ['10px', { lineHeight: '12px', letterSpacing: '0.14em' }],
      },
      // Softer than the admin chrome originally shipped with, which kept every
      // corner near-square on the theory that dense tables and toolbars turn soft
      // corners into visual noise. In practice the panel read as hard-edged
      // rather than precise, so the scale now leans modern and rounded. `full` is
      // left at Tailwind's default so avatars and pill badges stay genuinely
      // circular — the mockups override it to 12px, which squircle their own
      // avatars.
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.625rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        '2xl': '1.75rem',
      },
      spacing: {
        gutter: '1.5rem',
        'gutter-mobile': '1rem',
        margin: '3rem',
        'margin-mobile': '1.25rem',
      },
      boxShadow: {
        // The mockups use one flat hairline shadow almost everywhere.
        hairline: '0 1px 2px rgba(28, 26, 24, 0.04)',
        card: '0 4px 20px -2px rgba(28, 26, 24, 0.04)',
        lift: '0 12px 32px -4px rgba(28, 26, 24, 0.08)',
        overlay: '0 24px 48px -8px rgba(17, 16, 15, 0.16)',
      },
      maxWidth: {
        screen2xl: '1440px',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'slide-in-right': 'slide-in-right 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slide-up 240ms ease-out both',
        'scale-in': 'scale-in 180ms ease-out both',
      },
      transitionTimingFunction: {
        luxury: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        400: '400ms',
        600: '600ms',
      },
    },
  },
  plugins: [],
}
