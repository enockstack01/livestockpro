import { useTheme } from '../theme/ThemeProvider.jsx';
import { chartPalette, CHART_STATUS, fmtMoney } from '../../../shared/chartPalette';
import { formatCompact, getCurrency } from '../../../shared/currency';

/* Palette + status colors live in shared/chartPalette.js (the mobile app
   draws its charts from the same values). They're keyed off the theme
   scheme rather than read from CSS variables, because the data-theme
   attribute flips in an effect *after* React renders, so reading CSS
   variables at render time would lag one theme behind. */
export const STATUS = CHART_STATUS;
export { fmtMoney };

export function useChartTheme() {
  const { scheme } = useTheme();
  return chartPalette(scheme);
}

/* Shared Chart.js options for bar/line charts: recessive hairline grid, no
   axis clutter, index-mode tooltips (a hover anywhere in a column shows
   every series at that point). Money axes show short figures (600K) with
   the currency named once in the axis title, so ticks and bar values stay
   short enough to read flat; tooltips keep the exact amount. Value axes get
   headroom so the number at the end of the longest bar is never cut off. */
export function tooltipStyle(ct) {
  return {
    backgroundColor: ct.tooltip.bg, titleColor: ct.tooltip.title, bodyColor: ct.tooltip.body, borderColor: ct.tooltip.border,
    borderWidth: 1, cornerRadius: 8, padding: 12, boxPadding: 4, usePointStyle: true,
    titleFont: { size: 12, weight: '700' }, bodyFont: { size: 12 }
  };
}

const legendStyle = (ct) => ({ color: ct.text, usePointStyle: true, pointStyle: 'rectRounded', pointStyleWidth: 10, boxHeight: 8, padding: 16, font: { size: 12 } });

export function cartesianOptions(ct, { horizontal = false, stacked = false, legend = false, money = false, integer = false } = {}) {
  const valueTicks = { color: ct.text, font: { size: 11 }, padding: 6, maxRotation: 0 };
  if (money) valueTicks.callback = (v) => formatCompact(v);
  if (integer) valueTicks.precision = 0;
  if (horizontal) valueTicks.maxTicksLimit = 5;
  const valueAxis = { beginAtZero: true, stacked, grace: horizontal ? '26%' : '16%', grid: { color: ct.grid, drawTicks: false }, border: { display: false }, ticks: valueTicks };
  if (money) valueAxis.title = { display: true, text: getCurrency(), color: ct.text, font: { size: 11, weight: '700' }, padding: { top: 4, bottom: 2 } };
  const categoryAxis = { stacked, grid: { display: false }, border: { color: ct.grid }, ticks: { color: ct.text, font: { size: 11 }, maxRotation: 45 } };

  const tooltip = tooltipStyle(ct);
  if (money) {
    tooltip.callbacks = { label: (c) => `${c.dataset.label ? c.dataset.label + ': ' : ''}${fmtMoney(horizontal ? c.parsed.x : c.parsed.y)}` };
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450 },
    layout: { padding: { top: 4, right: 8, left: 2, bottom: 0 } },
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
    scales: horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
    plugins: {
      legend: { display: legend, position: 'bottom', labels: legendStyle(ct) },
      valueLabels: { money: false, color: ct.text, surface: ct.surface },
      tooltip
    }
  };
}

/* Doughnuts: a thick ring with the total (and what it counts) in the
   middle, the legend beside it on a wide card and below it otherwise. */
export function doughnutOptions(ct, { money = false, center = null, side = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450 },
    cutout: '68%',
    layout: { padding: 6 },
    plugins: {
      legend: { position: side ? 'right' : 'bottom', labels: legendStyle(ct) },
      tooltip: tooltipStyle(ct),
      valueLabels: { money, color: ct.text, center, centerColor: ct.tooltip.title }
    }
  };
}

/* Bars rounded at the data end (Crop Manager: up to 34 px thick);
   stacked segments get a 2px surface-coloured gap instead of an outline. */
export function barDataset(ct, label, data, color, { stacked = false } = {}) {
  return {
    label,
    data,
    backgroundColor: color,
    borderColor: ct.surface,
    borderWidth: stacked ? 2 : 0,
    borderRadius: stacked ? 3 : 6,
    borderSkipped: 'start',
    maxBarThickness: 34,
    categoryPercentage: 0.72,
    barPercentage: 0.9
  };
}

export function lineDataset(label, data, color, { fill = false } = {}) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color + '1F',
    fill,
    borderWidth: 2.5,
    tension: 0.3,
    cubicInterpolationMode: 'monotone', // no overshoot below zero between sparse points
    pointRadius: 3, // a visible dot for each labelled value
    pointHoverRadius: 6,
    pointHitRadius: 14,
    pointBackgroundColor: color,
    pointBorderColor: color
  };
}
