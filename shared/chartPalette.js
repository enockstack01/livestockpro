/* Chart colors shared by the web app (client/src/lib/chartTheme.js) and the
   mobile app (mobile/src/ui/charts.js) so a chart looks identical on both.
   The categorical slots are a colorblind-validated 8-hue order
   (adjacent-pair CVD ΔE ≥ 8 in both modes, checked against the app's own
   card surfaces #FFFFFF / #1E1E1E) — assign them in order and let a color
   follow its entity; never cycle or generate a 9th. Single-series charts use
   the brand green instead. Neutrals mirror the theme's textLight / border /
   card tokens. */

import { formatMoney } from './currency';

/* Agricoders brand charts: Leaf Green carries the main series, Harvest Amber
   the comparison, then Pine, Slate and earthy neutrals. No light greens. */
export const CHART_PALETTE = {
  light: {
    series: ['#2E7D32', '#F9A825', '#14532D', '#5B6B5D', '#B26A2E', '#8A948B', '#6B7F2A', '#1C2B1E'],
    brand: '#2E7D32',
    positive: '#2E7D32',
    negative: '#F9A825',
    neutral: '#8A948B',
    /* Ordinal ramp (ordered bins such as age bands): neutral to deep green. */
    ramp: ['#8A948B', '#5B6B5D', '#2E7D32', '#1B5E20', '#14532D'],
    text: '#5B6B5D',
    grid: '#E8EAE8',
    surface: '#FFFFFF'
  },
  dark: {
    series: ['#2E7D32', '#F9A825', '#4E8F55', '#A9B2AA', '#C9803F', '#7D877E', '#8FA33B', '#E8ECE8'],
    brand: '#2E7D32',
    positive: '#2E7D32',
    negative: '#F9A825',
    neutral: '#7D877E',
    ramp: ['#5B6B5D', '#7D877E', '#2E7D32', '#1B5E20', '#14532D'],
    text: '#A9B2AA',
    grid: '#2A332C',
    surface: '#1E1E1E'
  }
};

/* Reserved for meaning good/bad: never reused as an ordinary series colour,
   and always shown alongside a text label. */
export const CHART_STATUS = { good: '#1B5E20', warning: '#F9A825', serious: '#B26A2E', critical: '#C62828' };

export function chartPalette(scheme) {
  return { scheme, status: CHART_STATUS, ...CHART_PALETTE[scheme === 'dark' ? 'dark' : 'light'] };
}

/* Whole-unit money in the user's chosen currency (shared/currency.js). */
export const fmtMoney = (v) => formatMoney(v, { decimals: 0 });
