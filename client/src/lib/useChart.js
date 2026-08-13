import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

/* Mounts/tears down a vanilla Chart.js instance on a <canvas ref={...}>.
   `build` returns a Chart.js config, or null/undefined to skip rendering
   (e.g. while there's no data yet) — the caller handles the empty state. */
export function useCanvasChart(build, deps) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const config = build();
    if (!config) { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } return; }
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, config);
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return canvasRef;
}
