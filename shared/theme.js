/* Design tokens mirrored 1:1 from client/src/style.css's :root CSS variables
   for the light palette, so the mobile app (which can't read CSS custom
   properties) renders the same palette/radii as the web app instead of an
   independently-invented one. The web app itself has no dark mode — DARK is
   a mobile-only addition, tuned to keep the same brand hue (green primary,
   the badge tones) while swapping the light neutrals for dark-surface ones.
   Update LIGHT alongside style.css if the web design changes; DARK only
   needs to keep pace with LIGHT's brand colors (primary/red/blue/purple/orange). */

export const LIGHT_COLORS = {
  primary: '#2E7D32',
  primaryLight: '#E8F5E9',
  primaryDark: '#1B5E20',
  white: '#FFFFFF',
  bg: '#F5F7FA',
  card: '#FFFFFF',
  text: '#263238',
  textLight: '#546E7A',
  placeholder: '#9E9E9E',
  border: '#E0E0E0',
  orange: '#F9A825',
  red: '#D32F2F',
  blue: '#1976D2',
  purple: '#7B1FA2',
};

export const DARK_COLORS = {
  primary: '#4CAF50',
  primaryLight: '#1B3A20',
  primaryDark: '#A5D6A7',
  white: '#FFFFFF', // stays literal white in both palettes — this is "text/icon color on a colored button", not a surface color (that's `card`), and buttons keep light text regardless of theme
  bg: '#121212',
  card: '#1E1E1E',
  text: '#ECEFF1',
  textLight: '#9AA7AB',
  placeholder: '#78909C',
  border: '#333333',
  orange: '#FFB74D',
  red: '#EF5350',
  blue: '#64B5F6',
  purple: '#BA68C8',
};

/* Back-compat default export — client/src/lib/badges.jsx and any mobile code
   that hasn't been switched to useTheme() yet reads the light palette here. */
export const COLORS = LIGHT_COLORS;

export const RADIUS = {
  card: 10,
  button: 8,
  buttonSm: 6,
  pill: 999,
};

/* React Native's shadow* props (iOS) need to be paired with `elevation`
   (Android) to render consistently — see each component's usage. Values
   below correspond to style.css's --shadow / --shadow-lg. */
export const SHADOW = {
  color: '#000',
  opacity: 0.08,
  radius: 8,
  offset: { width: 0, height: 2 },
  elevation: 2,
};

export const SHADOW_LG = {
  color: '#000',
  opacity: 0.12,
  radius: 30,
  offset: { width: 0, height: 8 },
  elevation: 8,
};
