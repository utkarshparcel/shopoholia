import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Worn Brand Palette
        worn: {
          ink: '#0f0e0c',
          'ink-soft': '#2a2722',
          paper: '#faf8f5',
          surface: '#ffffff',
          warm: '#f0ece4',
          'warm-deep': '#e8e1d6',
          rule: '#e0dbd2',
          muted: '#888078',
          gold: '#c8a87a',
          'gold-deep': '#9c7a4e',
          'gold-tint': '#fdf7ee',
          sale: '#d64e2a',
          success: '#3a7d5c',
          coin: '#c8a87a',
          'coin-deep': '#9c7a4e',
        },
        // Closet Palette (calm utility)
        closet: {
          ink: '#1a2332',
          'ink-soft': '#3d4a5c',
          bg: '#eef2f5',
          surface: '#f7f9fb',
          mist: '#e2e8ee',
          rule: '#c5d0d6',
          muted: '#6b7a8d',
          accent: '#2f6f6a',
          'accent-soft': '#4a9a93',
          'accent-bg': '#e4f0ee',
          found: '#1f6b4a',
        },
        // Semantic aliases
        bg: '#faf8f5',
        surface: '#ffffff',
        text: '#0f0e0c',
        'text-body': '#2a2722',
        'text-muted': '#888078',
        border: '#e0dbd2',
        accent: '#9c7a4e',
        'accent-soft': '#c8a87a',
        'accent-bg': '#fdf7ee',
        price: '#0f0e0c',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      fontSize: {
        'display-xl': ['48px', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'display-l': ['34px', { lineHeight: '1.08', letterSpacing: '-0.01em' }],
        'display-m': ['24px', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
        title: ['18px', { lineHeight: '1.3', letterSpacing: '0' }],
        'body-l': ['16px', { lineHeight: '1.6', letterSpacing: '0' }],
        body: ['14px', { lineHeight: '1.55', letterSpacing: '0' }],
        caption: ['13px', { lineHeight: '1.5', letterSpacing: '0' }],
        micro: ['11px', { lineHeight: '1.4', letterSpacing: '0' }],
      },
      spacing: {
        0: '0',
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        card: '12px',
        lg: '16px',
        pill: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15, 14, 12, 0.06)',
        card: '0 2px 8px rgba(15, 14, 12, 0.06)',
        pop: '0 8px 24px rgba(15, 14, 12, 0.12)',
        sheet: '0 -8px 32px rgba(15, 14, 12, 0.14)',
      },
      transitionDuration: {
        fast: '150ms',
        DEFAULT: '250ms',
        slow: '400ms',
      },
      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'ease-in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
        'ease-drawer': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out forwards',
        'slide-up': 'slideUp 300ms ease-out forwards',
        'slide-down': 'slideDown 200ms ease-out forwards',
        'scale-in': 'scaleIn 200ms ease-out forwards',
        'stagger': 'stagger 300ms ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        stagger: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;