// Buns & Patties — the printed menu is stark black & white; the logo brings the warm
// bun/cheese tones. Design pass comes later (incl. the smasher-press animation).
export const theme = {
  colors: {
    brand: '#111111',       // menu black
    brandDark: '#000000',
    accent: '#F2B300',      // cheese/mustard yellow from the logo
    bg: '#FFFFFF',
    bgMuted: '#F4F2EF',
    text: '#111111',
    textMuted: '#6B6B6B',
    border: '#E4E0DA',
    success: '#2E7D32',
    danger: '#C62828',
    heat: '#D7262A',        // the chilli red
    white: '#FFFFFF',
  },
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  font: { title: 28, h1: 22, h2: 18, body: 16, small: 13 },
};
export type Theme = typeof theme;
