import { useTheme } from '../theme/ThemeProvider.jsx';

/* Chart colors per theme. The categorical slots are a colorblind-validated
   8-hue order (adjacent-pair CVD ΔE ≥ 8 in both modes, checked against this
   app's own card surfaces #FFFFFF / #1E1E1E) — assign them in order and let
   a color follow its entity; never cycle or generate a 9th. Single-series
   charts use the brand green instead. Neutrals mirror style.css's
   --text-light / --border / --card, but live here as literals because the
   data-theme attribute flips in an effect *after* React renders, so reading
   CSS variables at render time would lag one theme behind. */
const PALETTE = {
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
export const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

export function useChartTheme() {
  const { scheme } = useTheme();
  return { scheme, status: STATUS, ...PALETTE[scheme === 'dark' ? 'dark' : 'light'] };
}

export const fmtMoney = (v) => '$' + Math.round(Number(v) || 0).toLocaleString();

/* Shared Chart.js options for bar/line charts: recessive hairline grid, no
   axis clutter, index-mode tooltips (a hover anywhere in a column shows
   every series at that point). */
export function cartesianOptions(ct, { horizontal = false, stacked = false, legend = false, money = false, integer = false } = {}) {
  const valueTicks = { color: ct.text, font: { size: 11 }, padding: 6 };
  if (money) valueTicks.callback = (v) => fmtMoney(v);
  if (integer) valueTicks.precision = 0;
  const valueAxis = { beginAtZero: true, stacked, grid: { color: ct.grid, drawTicks: false }, border: { display: false }, ticks: valueTicks };
  const categoryAxis = { stacked, grid: { display: false }, border: { color: ct.grid }, ticks: { color: ct.text, font: { size: 11 } } };

  const tooltip = {};
  if (money) {
    tooltip.callbacks = { label: (c) => `${c.dataset.label ? c.dataset.label + ': ' : ''}${fmtMoney(horizontal ? c.parsed.x : c.parsed.y)}` };
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
    scales: horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
    plugins: {
      legend: { display: legend, position: 'bottom', labels: { color: ct.text, usePointStyle: true, pointStyleWidth: 10, padding: 14, font: { size: 12 } } },
      tooltip
    }
  };
}

export function doughnutOptions(ct) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: { legend: { position: 'bottom', labels: { color: ct.text, usePointStyle: true, pointStyleWidth: 10, padding: 14, font: { size: 12 } } } }
  };
}

/* Thin bars, rounded only at the data end; stacked segments get a 2px
   surface-colored gap instead of an outline. */
export function barDataset(ct, label, data, color, { stacked = false } = {}) {
  return {
    label,
    data,
    backgroundColor: color,
    borderColor: ct.surface,
    borderWidth: stacked ? 2 : 0,
    borderRadius: stacked ? 2 : 4,
    borderSkipped: 'start',
    maxBarThickness: 30
  };
}

export function lineDataset(label, data, color, { fill = false } = {}) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color + '22',
    fill,
    borderWidth: 2,
    tension: 0.3,
    cubicInterpolationMode: 'monotone', // no overshoot below zero between sparse points
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHitRadius: 14,
    pointBackgroundColor: color
  };
}
