/* Chart colors shared by the web app (client/src/lib/chartTheme.js) and the
   mobile app (mobile/src/ui/charts.js) so a chart looks identical on both.
   The categorical slots are a colorblind-validated 8-hue order
   (adjacent-pair CVD ΔE ≥ 8 in both modes, checked against the app's own
   card surfaces #FFFFFF / #1E1E1E) — assign them in order and let a color
   follow its entity; never cycle or generate a 9th. Single-series charts use
   the brand green instead. Neutrals mirror the theme's textLight / border /
   card tokens. */
export const CHART_PALETTE = {
  light: {
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    brand: '#2E7D32',
    positive: '#2a78d6',
    negative: '#e34948',
    neutral: '#78909C',
    /* Ordinal ramp (ordered bins such as age bands) — one hue, light→dark. */
    ramp: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'],
    text: '#546E7A',
    grid: '#ECEFF1',
    surface: '#FFFFFF'
  },
  dark: {
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    brand: '#4CAF50',
    positive: '#3987e5',
    negative: '#e66767',
    neutral: '#90A4AE',
    ramp: ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'],
    text: '#9AA7AB',
    grid: '#2C2C2C',
    surface: '#1E1E1E'
  }
};

/* Reserved for meaning good/bad — never reused as an ordinary series color,
   and always shown alongside a text label. */
export const CHART_STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

export function chartPalette(scheme) {
  return { scheme, status: CHART_STATUS, ...CHART_PALETTE[scheme === 'dark' ? 'dark' : 'light'] };
}

export const fmtMoney = (v) => {
  const n = Math.round(Number(v) || 0);
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString();
};
