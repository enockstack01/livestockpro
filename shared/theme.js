/* Design tokens mirrored 1:1 from client/src/style.css's :root CSS variables
   for the light palette, so the mobile app (which can't read CSS custom
   properties) renders the same palette/radii as the web app instead of an
   independently-invented one. DARK mirrors style.css's :root[data-theme='dark']
   palette (both clients now have a dark mode), tuned to keep the same brand hue (green primary,
   the badge tones) while swapping the light neutrals for dark-surface ones.
   Update LIGHT alongside style.css if the web design changes; DARK only
   needs to keep pace with LIGHT's brand colors (primary/red/blue/purple/orange). */

/* Agricoders brand (Brand and Template Guidelines v1.0): Forest, Pine and
   Leaf greens, Harvest Amber, Ink text, Slate helper text, Alert Red for
   critical only. Light greens (Mint, Pale Sage, Dew) are not used. */
export const BRAND = {
  forest: '#1B5E20',
  pine: '#14532D',
  leaf: '#2E7D32',
  amber: '#F9A825',
  ink: '#1C2B1E',
  slate: '#5B6B5D',
  alert: '#C62828',
  navy: '#1A237E',
};

export const LIGHT_COLORS = {
  primary: '#1B5E20',
  primaryLight: '#EEF0EE',
  primaryDark: '#1B5E20',
  leaf: '#2E7D32',
  pine: '#14532D',
  white: '#FFFFFF',
  bg: '#F5F6F5',
  card: '#FFFFFF',
  text: '#1C2B1E',
  textLight: '#5B6B5D',
  placeholder: '#8A948B',
  border: '#DFE2DF',
  orange: '#F9A825',
  red: '#C62828',
  blue: '#5B6B5D',
  purple: '#14532D',
  sidebar: '#1B5E20', // style.css --sidebar-bg: brand surface, identical in both themes
};

export const DARK_COLORS = {
  primary: '#2E7D32',
  primaryLight: '#1F3324',
  primaryDark: '#F1F3F1',
  leaf: '#2E7D32',
  pine: '#14532D',
  white: '#FFFFFF', // text/icon colour on a coloured button, the same in both themes
  bg: '#0F1F14',
  card: '#1E1E1E',
  text: '#F1F3F1',
  textLight: '#A9B2AA',
  placeholder: '#7D877E',
  border: '#2E3A31',
  orange: '#F9A825',
  red: '#E05252',
  blue: '#A9B2AA',
  purple: '#2E7D32',
  sidebar: '#1B5E20',
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
