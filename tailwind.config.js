/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Studio palette — white-label ready
        'accent':      '#0EA5E9',   // sky-500  — primary interactive
        'accent-dark': '#0284C7',   // sky-600  — hover / pressed
        'accent-muted':'#E0F2FE',   // sky-100  — soft tint backgrounds
        'off-black':   '#101820',   // dark navy — headings, card headers
        'off-white':   '#FAFAFA',   // near-white — page background
        'border':      '#E4E4E7',   // zinc-200 — default borders
        'muted':       '#71717A',   // zinc-500 — secondary text
        // Keep for backwards-compat and CK-specific data highlights
        'brand-orange': '#ED8B00',
        'dark-orange':  '#D64303',
        'ck-grey':      '#D0D0CE',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
