/** @type {import('tailwindcss').Config} */
const v = name => `rgb(var(${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '!./src/**/*.test.ts'],
  theme: {
    extend: {
      colors: {
        // todas as cores vêm do estilo visual escolhido (src/index.css)
        white: v('--ov'),
        ink: { DEFAULT: v('--c-ink'), 2: v('--c-ink2'), 3: v('--c-ink3') },
        mist: { 1: v('--c-mist1'), 2: v('--c-mist2'), 3: v('--c-mist3') },
        mint: v('--c-mint'), amber: v('--c-amber'), coral: v('--c-coral'), sky: v('--c-sky'),
        me: 'var(--me)', her: 'var(--her)', duo: 'var(--duo)'
      },
      fontFamily: { display: ['var(--font-display)'], sans: ['var(--font-body)'] }
    }
  },
  plugins: []
};
