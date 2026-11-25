/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          cream: '#FFFFFF',
          ivory: '#FFFFFF',
          charcoal: '#11100F',
          night: '#1A1817',
          gold: '#D8B878',
          goldDark: '#C89B3C',
          border: '#E6E6E6',
          muted: '#6E6E6E',
          surface: '#F6F6F6',
        },
        // "Haute Parfumerie Prestige" pure-white tonal ramp
        surface: {
          dim: '#E6E6E6',
          low: '#FFFFFF',
          DEFAULT: '#FFFFFF',
          high: '#F6F6F6',
          highest: '#EFEFEF',
        },
        ink: {
          DEFAULT: '#11100F',
          variant: '#454545',
          muted: '#6E6E6E',
        },
        outline: {
          DEFAULT: '#737373',
          variant: '#E0E0E0',
        },
        bronze: '#737373',
        error: '#BA1A1A',
        // Provenance tiers for product badges
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
        cormorant: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        manrope: ['"Manrope"', 'system-ui', '-apple-system', 'sans-serif'],
        inter: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['56px', { lineHeight: '68px', letterSpacing: '-0.02em' }],
        'display-lg-mobile': ['36px', { lineHeight: '44px', letterSpacing: '-0.01em' }],
        'headline-xl': ['40px', { lineHeight: '48px', letterSpacing: '-0.015em' }],
        'headline-xl-mobile': ['28px', { lineHeight: '36px', letterSpacing: '-0.01em' }],
        'headline-md': ['24px', { lineHeight: '32px' }],
        'headline-sm': ['19px', { lineHeight: '26px', letterSpacing: '0.01em' }],
        'body-lg': ['21px', { lineHeight: '32px' }],
        'body-md': ['18px', { lineHeight: '28px' }],
        'body-sm': ['15.5px', { lineHeight: '24px' }],
        'label-lg': ['15px', { lineHeight: '18px', letterSpacing: '0.08em' }],
        'label-md': ['13px', { lineHeight: '16px', letterSpacing: '0.12em' }],
        'label-sm': ['12px', { lineHeight: '14px', letterSpacing: '0.14em' }],
      },
      borderRadius: {
        sm: '0.125rem',
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
      spacing: {
        gutter: '1.5rem',
        'gutter-mobile': '1rem',
        margin: '3rem',
        'margin-mobile': '1.25rem',
      },
      boxShadow: {
        card: '0 4px 20px -2px rgba(28, 26, 24, 0.04)',
        lift: '0 12px 32px -4px rgba(28, 26, 24, 0.08)',
        overlay: '0 24px 48px -8px rgba(17, 16, 15, 0.16)',
      },
      maxWidth: {
        screen2xl: '1440px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
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
        // Above-the-fold entrances. Shallower travel than `slide-up` but far
        // slower, which is what makes the hero settle rather than pop.
        'rise-lux': {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'dissolve-lux': {
          from: { opacity: '0', transform: 'scale(0.985)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'bridal-float': {
          '0%, 100%': { transform: 'translate3d(0, 0px, 0) scale(1)' },
          '50%': { transform: 'translate3d(0, -10px, 0) scale(1.015)' },
        },
        'bridal-aura': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '0.68' },
          '50%': { transform: 'translate3d(18px, -12px, 0) scale(1.08)', opacity: '0.92' },
        },
        'bridal-sheen': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'slide-in-right': 'slide-in-right 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-left': 'slide-in-left 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slide-up 240ms ease-out both',
        'scale-in': 'scale-in 180ms ease-out both',
        'rise-lux': 'rise-lux 1150ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'dissolve-lux': 'dissolve-lux 1400ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'bridal-float': 'bridal-float 7s ease-in-out infinite',
        'bridal-aura': 'bridal-aura 10s ease-in-out infinite',
        'bridal-sheen': 'bridal-sheen 6s linear infinite',
      },
      transitionTimingFunction: {
        // Near-exponential ease-out. The house curve for anything that settles.
        luxury: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        400: '400ms',
        600: '600ms',
        900: '900ms',
      },
    },
  },
  plugins: [],
}
