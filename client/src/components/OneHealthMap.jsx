import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.heat';
import { useTranslation } from 'react-i18next';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';

/* Icon always encodes *what kind* of signal this is (fixed); color encodes
   whichever risk factor the user picked to look at (dynamic). Showing both
   at once — shape for category, color for the chosen attribute — is more
   informative than tying them together. */
const TYPE_ICON = { watchlist: 'fa-skull-crossbones', mortality_cluster: 'fa-cross', critical_cluster: 'fa-heart-crack', outbreak_cluster: 'fa-diagram-project' };
const TYPE_LABEL_KEY = { watchlist: 'oneHealth.watchlistDisease', mortality_cluster: 'oneHealth.mortalityCluster', critical_cluster: 'oneHealth.criticalCluster', outbreak_cluster: 'oneHealth.outbreakCluster' };
/* When a point carries more than one alert type, this priority decides which
   icon wins — most acute signal first. */
const TYPE_PRIORITY = ['mortality_cluster', 'watchlist', 'critical_cluster', 'outbreak_cluster'];

const SEVERITY_COLOR = { critical: '#D32F2F', high: '#F9A825', medium: '#1976D2', low: '#90A4AE' };
const CONFIDENCE_COLOR = { confirmed: '#D32F2F', suspected: '#F9A825', reported: '#90A4AE' };
const TYPE_COLOR = { watchlist: '#7B1FA2', mortality_cluster: '#212121', critical_cluster: '#D32F2F', outbreak_cluster: '#F9A825' };
const ZOONOTIC_COLOR = { yes: '#C2185B', no: '#1976D2' };

function buildColorModes(t) {
  return {
    severity: { label: t('oneHealthMap.severityLabel'), heatColor: SEVERITY_COLOR.critical, legend: [[t('enums.animalHealthStatus.Critical'), SEVERITY_COLOR.critical], [t('enums.taskPriority.High'), SEVERITY_COLOR.high], [t('enums.taskPriority.Medium'), SEVERITY_COLOR.medium], [t('enums.taskPriority.Low'), SEVERITY_COLOR.low]], colorOf: (p) => SEVERITY_COLOR[p.severity] || '#90A4AE', weightOf: (p) => ({ critical: 1, high: 0.75, medium: 0.5, low: 0.25 }[p.severity] || 0.25) },
    type: { label: t('oneHealthMap.detectionMethod'), heatColor: TYPE_COLOR.critical_cluster, legend: Object.entries(TYPE_COLOR).map(([k, c]) => [t(TYPE_LABEL_KEY[k]), c]), colorOf: (p) => TYPE_COLOR[primaryType(p)] || '#546E7A', weightOf: () => 0.6 },
    zoonotic: { label: t('oneHealthMap.zoonoticRisk'), heatColor: ZOONOTIC_COLOR.yes, legend: [[t('oneHealth.zoonoticBadge'), ZOONOTIC_COLOR.yes], [t('oneHealthMap.notZoonotic'), ZOONOTIC_COLOR.no]], colorOf: (p) => (p.zoonotic ? ZOONOTIC_COLOR.yes : ZOONOTIC_COLOR.no), weightOf: (p) => (p.zoonotic ? 1 : 0.35) },
    confidence: { label: t('oneHealthMap.confidence'), heatColor: CONFIDENCE_COLOR.confirmed, legend: [[t('oneHealth.confirmed'), CONFIDENCE_COLOR.confirmed], [t('oneHealth.suspected'), CONFIDENCE_COLOR.suspected], [t('oneHealth.reported'), CONFIDENCE_COLOR.reported]], colorOf: (p) => CONFIDENCE_COLOR[p.confidence] || '#90A4AE', weightOf: (p) => ({ confirmed: 1, suspected: 0.6, reported: 0.3 }[p.confidence] || 0.3) }
  };
}

function primaryType(p) {
  return TYPE_PRIORITY.find((t) => p.types.includes(t)) || p.types[0];
}

function esc(s) {
  if (s === null || s === undefined || s === '') return '—';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function heatGradient(hex) {
  const [r, g, b] = hexToRgb(hex);
  return { 0.2: `rgba(${r},${g},${b},0.25)`, 0.55: hex, 1: '#ffffff' };
}

function markerIcon(color, type) {
  return L.divIcon({
    className: 'spatial-marker-wrap',
    html: `<div class="spatial-marker-pin" style="background:${color}"><i class="fas ${TYPE_ICON[type] || 'fa-triangle-exclamation'}"></i></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24]
  });
}

function popupHtml(p, t) {
  const rows = p.alerts.map((a) => `
    <div class="spatial-popup-row" style="margin-bottom:4px;">
      <span class="badge" style="background:${SEVERITY_COLOR[a.severity]}22;color:${SEVERITY_COLOR[a.severity]};">${esc(a.severity)}</span>
      ${a.zoonotic ? `<span class="badge badge-purple" style="margin-left:4px;">${esc(t('oneHealth.zoonoticBadge'))}</span>` : ''}
      <div style="margin-top:2px;">${esc(a.title)}</div>
    </div>`).join('');
  return `
    <div class="spatial-popup">
      <div class="spatial-popup-type" style="color:${TYPE_COLOR[primaryType(p)]}"><i class="fas ${TYPE_ICON[primaryType(p)]}"></i> ${esc(p.district)}</div>
      <div class="spatial-popup-farm" style="margin-bottom:6px;"><i class="fas fa-user"></i> ${esc(p.farmName)}</div>
      ${rows}
      <div class="spatial-popup-row" style="margin-top:6px;"><strong>${esc(t('tables.finance_records.fields.date'))}:</strong> ${p.date ? esc(new Date(p.date).toLocaleDateString()) : '—'}</div>
    </div>
  `;
}

export default function OneHealthMap() {
  const { t } = useTranslation();
  const api = useApi();
  const showToast = useToast();

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const clusterGroupRef = useRef(null);
  const heatLayerRef = useRef(null);
  const boundaryLayersRef = useRef({});

  const [points, setPoints] = useState(null);
  const [colorBy, setColorBy] = useState('severity');
  const [viewMode, setViewMode] = useState('markers');
  const [severityFilter, setSeverityFilter] = useState('');
  const [zoonoticOnly, setZoonoticOnly] = useState(false);
  const [showBoundaries, setShowBoundaries] = useState({ country: true, districts: true });

  useEffect(() => {
    (async () => {
      const { data, error } = await api.adminOneHealthMap();
      if (error) { showToast(t('oneHealthMap.failedLoadData', { message: error.message }), 'error'); setPoints([]); return; }
      setPoints(data || []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => (points || []).filter((p) =>
    (!severityFilter || p.severity === severityFilter) && (!zoonoticOnly || p.zoonotic)
  ), [points, severityFilter, zoonoticOnly]);

  const COLOR_MODES = useMemo(() => buildColorModes(t), [t]);
  const mode = COLOR_MODES[colorBy];

  /* Map + basemaps: initialize once. */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [-1.94, 29.9], zoom: 8, scrollWheelZoom: true });
    mapRef.current = map;

    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics', maxZoom: 19
    });
    const light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions">CARTO</a>', maxZoom: 19
    });

    street.addTo(map);
    L.control.layers({ Street: street, Satellite: satellite, Light: light }, {}, { position: 'topright', collapsed: false }).addTo(map);
    L.control.scale({ position: 'bottomleft' }).addTo(map);

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* Administrative boundaries, same source as the general Spatial Distribution map. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    (async () => {
      try {
        const [countryRes, districtsRes] = await Promise.all([fetch('/geo/rwanda-country.geojson'), fetch('/geo/rwanda-districts.geojson')]);
        const [countryGeo, districtsGeo] = await Promise.all([countryRes.json(), districtsRes.json()]);
        if (cancelled) return;

        const districts = L.geoJSON(districtsGeo, {
          style: { color: '#546E7A', weight: 1.5, opacity: 0.75, fill: true, fillOpacity: 0.02, dashArray: '4,3' },
          onEachFeature: (feature, layer) => {
            layer.bindTooltip(feature.properties.shapeName, { sticky: true, className: 'spatial-district-tooltip' });
            layer.on('mouseover', () => layer.setStyle({ weight: 3, opacity: 1, fillOpacity: 0.12 }));
            layer.on('mouseout', () => layer.setStyle({ weight: 1.5, opacity: 0.75, fillOpacity: 0.02 }));
          }
        });
        const country = L.geoJSON(countryGeo, { style: { color: '#1B5E20', weight: 3, opacity: 0.9, fill: false } });

        boundaryLayersRef.current = { country, districts };
        if (showBoundaries.districts) districts.addTo(map);
        if (showBoundaries.country) country.addTo(map);
      } catch (err) {
        showToast(t('oneHealthMap.failedLoadBoundaries'), 'warning');
      }
    })();

    return () => {
      cancelled = true;
      const { country, districts } = boundaryLayersRef.current;
      if (country) map.removeLayer(country);
      if (districts) map.removeLayer(districts);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const { country, districts } = boundaryLayersRef.current;
    if (!map) return;
    if (country) {
      const isShown = map.hasLayer(country);
      if (showBoundaries.country && !isShown) country.addTo(map);
      if (!showBoundaries.country && isShown) map.removeLayer(country);
    }
    if (districts) {
      const isShown = map.hasLayer(districts);
      if (showBoundaries.districts && !isShown) districts.addTo(map);
      if (!showBoundaries.districts && isShown) map.removeLayer(districts);
    }
  }, [showBoundaries]);

  /* Rebuild the marker-cluster group and heat layer whenever the filtered
     point set or the chosen color dimension changes — cheap enough at this
     scale, and keeps every marker's color/weight always in sync with `mode`. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !filtered) return;

    const withCoords = filtered.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');

    const group = L.markerClusterGroup({
      maxClusterRadius: 44,
      /* Highlight the cluster with whichever child carries the highest risk
         weight for the current mode — not just the first/last one added. */
      iconCreateFunction: (cluster) => {
        const worst = cluster.getAllChildMarkers().reduce(
          (best, m) => (m.options.riskWeight > (best?.options.riskWeight ?? -1) ? m : best),
          null
        );
        const color = worst ? worst.options.riskColor : '#546E7A';
        return L.divIcon({ html: `<div class="spatial-cluster" style="background:${color}">${cluster.getChildCount()}</div>`, className: 'spatial-cluster-wrap', iconSize: [36, 36] });
      }
    });
    withCoords.forEach((p) => {
      const color = mode.colorOf(p);
      const marker = L.marker([p.lat, p.lng], { icon: markerIcon(color, primaryType(p)), riskColor: color, riskWeight: mode.weightOf(p) });
      marker.bindPopup(popupHtml(p, t));
      group.addLayer(marker);
    });

    const heat = L.heatLayer(
      withCoords.map((p) => [p.lat, p.lng, 0.35 + mode.weightOf(p) * 0.65]),
      { radius: 30, blur: 24, maxZoom: 13, minOpacity: 0.35, gradient: heatGradient(mode.heatColor) }
    );

    if (clusterGroupRef.current) map.removeLayer(clusterGroupRef.current);
    if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);
    clusterGroupRef.current = group;
    heatLayerRef.current = heat;
    (viewMode === 'density' ? heat : group).addTo(map);

    return () => {
      if (map.hasLayer(group)) map.removeLayer(group);
      if (map.hasLayer(heat)) map.removeLayer(heat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, colorBy]);

  /* Swap markers <-> density without rebuilding layers. */
  useEffect(() => {
    const map = mapRef.current;
    const group = clusterGroupRef.current;
    const heat = heatLayerRef.current;
    if (!map || !group || !heat) return;
    const wantHeat = viewMode === 'density';
    if (wantHeat && map.hasLayer(group)) map.removeLayer(group);
    if (!wantHeat && map.hasLayer(heat)) map.removeLayer(heat);
    if (wantHeat && !map.hasLayer(heat)) heat.addTo(map);
    if (!wantHeat && !map.hasLayer(group)) group.addTo(map);
  }, [viewMode]);

  const total = points?.length ?? 0;
  const shown = filtered?.length ?? 0;

  return (
    <div className="spatial-layout">
      <div className="card spatial-legend-card">
        <div className="card-header"><h3><i className="fas fa-layer-group" style={{ color: 'var(--primary)', marginRight: 6 }}></i> {t('oneHealthMap.riskMapLayers')}</h3></div>
        <div className="card-body">
          <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
            {t('oneHealthMap.caption', { status: points === null ? t('spatialMap.loadingEllipsis') : t('oneHealthMap.showingOfTotal', { shown, total }) })}
          </p>

          <div className="spatial-legend-section-title">{t('oneHealthMap.colorBy')}</div>
          <select className="form-control" style={{ marginBottom: 14 }} value={colorBy} onChange={(e) => setColorBy(e.target.value)}>
            {Object.entries(COLOR_MODES).map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}
          </select>
          {mode.legend.map(([label, color]) => (
            <div key={label} className="spatial-legend-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <span className="spatial-legend-swatch" style={{ background: color }}></span>
                <span className="spatial-legend-label">{label}</span>
              </span>
            </div>
          ))}

          <div className="spatial-legend-section-title" style={{ marginTop: 16 }}>{t('oneHealthMap.viewMode')}</div>
          <div className="spatial-mode-toggle" role="group" aria-label={t('oneHealthMap.viewMode')} style={{ width: '100%' }}>
            <button type="button" className={`spatial-mode-btn${viewMode === 'markers' ? ' active' : ''}`} style={{ flex: 1 }} onClick={() => setViewMode('markers')}>
              <i className="fas fa-location-dot"></i> {t('oneHealthMap.markers')}
            </button>
            <button type="button" className={`spatial-mode-btn${viewMode === 'density' ? ' active' : ''}`} style={{ flex: 1 }} onClick={() => setViewMode('density')}>
              <i className="fas fa-fire"></i> {t('oneHealthMap.density')}
            </button>
          </div>
          {viewMode === 'density' && (
            <p className="text-muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              {t('oneHealthMap.densityCaption')}
            </p>
          )}

          <div className="spatial-legend-section-title" style={{ marginTop: 16 }}>{t('oneHealthMap.filters')}</div>
          <select className="form-control" style={{ marginBottom: 8 }} value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="">{t('oneHealthMap.allSeverities')}</option>
            <option value="critical">{t('enums.animalHealthStatus.Critical')}</option>
            <option value="high">{t('enums.taskPriority.High')}</option>
            <option value="medium">{t('enums.taskPriority.Medium')}</option>
            <option value="low">{t('enums.taskPriority.Low')}</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={zoonoticOnly} onChange={(e) => setZoonoticOnly(e.target.checked)} />
            {t('oneHealth.zoonoticOnly')}
          </label>

          <div className="spatial-legend-section-title" style={{ marginTop: 16 }}>{t('spatialMap.adminBoundaries')}</div>
          <label className="spatial-legend-row">
            <input type="checkbox" checked={showBoundaries.country} onChange={() => setShowBoundaries((s) => ({ ...s, country: !s.country }))} />
            <span className="spatial-legend-swatch" style={{ background: '#1B5E20' }}><i className="fas fa-flag"></i></span>
            <span className="spatial-legend-label">{t('spatialMap.countryBorder')}</span>
          </label>
          <label className="spatial-legend-row">
            <input type="checkbox" checked={showBoundaries.districts} onChange={() => setShowBoundaries((s) => ({ ...s, districts: !s.districts }))} />
            <span className="spatial-legend-swatch" style={{ background: '#546E7A' }}><i className="fas fa-draw-polygon"></i></span>
            <span className="spatial-legend-label">{t('spatialMap.districtBorders')}</span>
          </label>
        </div>
      </div>

      <div className="card spatial-map-card" style={{ position: 'relative' }}>
        {points === null && <div className="spatial-loading-overlay"><i className="fas fa-spinner fa-spin"></i> {t('oneHealthMap.loadingSpatial')}</div>}
        {points !== null && total === 0 && <div className="spatial-loading-overlay"><i className="fas fa-shield-heart"></i>&nbsp;{t('oneHealthMap.noSignalsYet')}</div>}
        <div ref={containerRef} className="spatial-map-container"></div>
      </div>
    </div>
  );
}
