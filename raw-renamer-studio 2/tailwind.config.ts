import type { Config } from 'tailwindcss';

/** Дизайн-токены RAW Renamer Studio (master §10). */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0D0E12',
        panel: '#14151A',
        surface: '#1A1C23',
        'surface-hover': '#20222B',
        elevated: '#262933',
        'input': '#14151A',
        accent: {
          DEFAULT: '#7C6CF0',
          text: '#8D7EF5',
          fill: '#6E5CE7',
          tint: 'rgba(124,108,240,0.16)',
        },
        warm: '#F0A24E',
        ok: '#3FBE84',
        warn: '#E8A23C',
        danger: '#E5484D',
        info: '#5FA8F5',
        'tx-1': '#F4F5F8',
        'tx-2': '#A7ACBC',
        'tx-3': '#82899D',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'SF Pro Text', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'SF Mono', 'Cascadia Code', 'Menlo', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        lift: '0 16px 40px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)',
        card: '0 4px 12px rgba(0,0,0,0.45)',
      },
      borderRadius: {
        btn: '6px',
        card: '8px',
        pop: '12px',
      },
    },
  },
  plugins: [],
} satisfies Config;
