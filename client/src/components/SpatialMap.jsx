import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.heat';
import { useApi } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';

const TYPE_META = {
  animals: { label: 'Animals', color: '#2E7D32', icon: 'fa-cow' },
  health_records: { label: 'Health Records', color: '#F9A825', icon: 'fa-stethoscope' },
  feeding_records: { label: 'Feeding Records', color: '#1976D2', icon: 'fa-wheat-awn' },
  breeding_records: { label: 'Breeding Records', color: '#7B1FA2', icon: 'fa-venus-mars' },
  production_records: { label: 'Production Records', color: '#0097A7', icon: 'fa-gauge' },
  finance_records: { label: 'Finance Records', color: '#D32F2F', icon: 'fa-coins' },
  tasks: { label: 'Tasks', color: '#5D4037', icon: 'fa-list-check' }
};
const TYPE_KEYS = Object.keys(TYPE_META);

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
  return {
    0.2: `rgba(${r},${g},${b},0.25)`,
    0.55: hex,
    1: '#ffffff'
  };
}

function markerIcon(meta) {
  return L.divIcon({
    className: 'spatial-marker-wrap',
    html: `<div class="spatial-marker-pin" style="background:${meta.color}"><i class="fas ${meta.icon}"></i></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24]
  });
}

function popupHtml(p, meta) {
  return `
    <div class="spatial-popup">
      <div class="spatial-popup-type" style="color:${meta.color}"><i class="fas ${meta.icon}"></i> ${esc(meta.label)}</div>
      <div class="spatial-popup-title">${esc(p.title)}</div>
      ${p.status ? `<div class="spatial-popup-row"><strong>Status:</strong> ${esc(p.status)}</div>` : ''}
      <div class="spatial-popup-row"><strong>Date:</strong> ${p.date ? esc(new Date(p.date).toLocaleDateString()) : '—'}</div>
      <div class="spatial-popup-row"><strong>District:</strong> ${esc(p.district)}</div>
      <div class="spatial-popup-farm"><i class="fas fa-user"></i> ${esc(p.farmName || p.userEmail)}</div>
    </div>
  `;
}

export default function SpatialMap() {
  const api = useApi();
  const showToast = useToast();

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const clusterGroupsRef = useRef({});
  const heatLayersRef = useRef({});
  const boundaryLayersRef = useRef({});

  const [points, setPoints] = useState(null);
  const [visibleTypes, setVisibleTypes] = useState(TYPE_KEYS);
  const [viewMode, setViewMode] = useState(() => Object.fromEntries(TYPE_KEYS.map((k) => [k, 'markers'])));
  const [showBoundaries, setShowBoundaries] = useState({ country: true, districts: true });

  useEffect(() => {
    (async () => {
      const { data, error } = await api.adminSpatial();
      if (error) { showToast('Failed to load spatial data: ' + error.message, 'error'); setPoints([]); return; }
      setPoints(data || []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const out = {};
    TYPE_KEYS.forEach((k) => { out[k] = 0; });
    (points || []).forEach((p) => { if (out[p.collection] !== undefined) out[p.collection]++; });
    return out;
  }, [points]);

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

  /* Administrative boundaries: country outline + district outlines with
     hover highlight/tooltip. Loaded once, sits above every basemap since
     it's a separate overlay pane, not part of the basemap tile layers. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    (async () => {
      try {
        const [countryRes, districtsRes] = await Promise.all([
          fetch('/geo/rwanda-country.geojson'),
          fetch('/geo/rwanda-districts.geojson')
        ]);
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

        const country = L.geoJSON(countryGeo, {
          style: { color: '#1B5E20', weight: 3, opacity: 0.9, fill: false }
        });

        boundaryLayersRef.current = { country, districts };
        if (showBoundaries.districts) districts.addTo(map);
        if (showBoundaries.country) country.addTo(map);
      } catch (err) {
        showToast('Failed to load administrative boundaries.', 'warning');
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

  /* Build a marker-cluster group AND a heat layer per record type when data
     arrives — the legend toggles which of the two is actually shown. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !points) return;

    const byType = {};
    points.forEach((p) => { (byType[p.collection] || (byType[p.collection] = [])).push(p); });

    const clusterGroups = {};
    const heatLayers = {};
    TYPE_KEYS.forEach((key) => {
      const meta = TYPE_META[key];
      const list = (byType[key] || []).filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number');

      const group = L.markerClusterGroup({
        maxClusterRadius: 44,
        iconCreateFunction: (cluster) => L.divIcon({
          html: `<div class="spatial-cluster" style="background:${meta.color}">${cluster.getChildCount()}</div>`,
          className: 'spatial-cluster-wrap',
          iconSize: [36, 36]
        })
      });
      list.forEach((p) => {
        const marker = L.marker([p.latitude, p.longitude], { icon: markerIcon(meta) });
        marker.bindPopup(popupHtml(p, meta));
        group.addLayer(marker);
      });
      clusterGroups[key] = group;

      heatLayers[key] = L.heatLayer(list.map((p) => [p.latitude, p.longitude, 0.6]), {
        radius: 28, blur: 22, maxZoom: 13, minOpacity: 0.35, gradient: heatGradient(meta.color)
      });

      const shouldShow = visibleTypes.includes(key);
      if (shouldShow) (viewMode[key] === 'density' ? heatLayers[key] : group).addTo(map);
    });

    clusterGroupsRef.current = clusterGroups;
    heatLayersRef.current = heatLayers;
    return () => {
      Object.values(clusterGroups).forEach((g) => map.removeLayer(g));
      Object.values(heatLayers).forEach((h) => map.removeLayer(h));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  /* Sync visibility + markers/density mode without rebuilding layers. */
  useEffect(() => {
    const map = mapRef.current;
    const clusterGroups = clusterGroupsRef.current;
    const heatLayers = heatLayersRef.current;
    if (!map || !clusterGroups || !heatLayers) return;

    TYPE_KEYS.forEach((key) => {
      const group = clusterGroups[key];
      const heat = heatLayers[key];
      if (!group || !heat) return;
      const shouldShow = visibleTypes.includes(key);
      const wantHeat = viewMode[key] === 'density';

      const wantGroupOn = shouldShow && !wantHeat;
      const wantHeatOn = shouldShow && wantHeat;

      if (wantGroupOn && !map.hasLayer(group)) group.addTo(map);
      if (!wantGroupOn && map.hasLayer(group)) map.removeLayer(group);
      if (wantHeatOn && !map.hasLayer(heat)) heat.addTo(map);
      if (!wantHeatOn && map.hasLayer(heat)) map.removeLayer(heat);
    });
  }, [visibleTypes, viewMode]);

  function toggleType(key) {
    setVisibleTypes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }
  function setMode(key, mode) {
    setViewMode((prev) => ({ ...prev, [key]: mode }));
  }
  function toggleBoundary(key) {
    setShowBoundaries((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const totalVisible = visibleTypes.reduce((s, k) => s + (counts[k] || 0), 0);
  const totalAll = TYPE_KEYS.reduce((s, k) => s + (counts[k] || 0), 0);

  return (
    <div className="spatial-layout">
      <div className="card spatial-legend-card">
        <div className="card-header"><h3><i className="fas fa-layer-group" style={{ color: 'var(--primary)', marginRight: 6 }}></i> Layers</h3></div>
        <div className="card-body">
          <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Every georeferenced record across all farms, {points === null ? 'loading…' : `${totalAll} total`}.
            Captured automatically from the device location when a record is added.
          </p>

          <div className="spatial-legend-section-title">Record layers</div>
          {TYPE_KEYS.map((key) => {
            const meta = TYPE_META[key];
            const checked = visibleTypes.includes(key);
            const mode = viewMode[key];
            return (
              <div key={key} className="spatial-legend-row">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer', minWidth: 0 }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleType(key)} />
                  <span className="spatial-legend-swatch" style={{ background: meta.color }}><i className={`fas ${meta.icon}`}></i></span>
                  <span className="spatial-legend-label">{meta.label}</span>
                  <span className="spatial-legend-count">{counts[key]}</span>
                </label>
                <div className="spatial-mode-toggle" role="group" aria-label={`${meta.label} view mode`}>
                  <button
                    type="button" title="Markers" disabled={!checked}
                    className={`spatial-mode-btn${mode === 'markers' ? ' active' : ''}`}
                    onClick={() => setMode(key, 'markers')}
                  ><i className="fas fa-location-dot"></i></button>
                  <button
                    type="button" title="Density" disabled={!checked}
                    className={`spatial-mode-btn${mode === 'density' ? ' active' : ''}`}
                    onClick={() => setMode(key, 'density')}
                  ><i className="fas fa-fire"></i></button>
                </div>
              </div>
            );
          })}
          <div className="spatial-legend-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setVisibleTypes(TYPE_KEYS)}>Show All</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setVisibleTypes([])}>Hide All</button>
          </div>

          <div className="spatial-legend-section-title" style={{ marginTop: 16 }}>Administrative boundaries</div>
          <label className="spatial-legend-row">
            <input type="checkbox" checked={showBoundaries.country} onChange={() => toggleBoundary('country')} />
            <span className="spatial-legend-swatch" style={{ background: '#1B5E20' }}><i className="fas fa-flag"></i></span>
            <span className="spatial-legend-label">Country border</span>
          </label>
          <label className="spatial-legend-row">
            <input type="checkbox" checked={showBoundaries.districts} onChange={() => toggleBoundary('districts')} />
            <span className="spatial-legend-swatch" style={{ background: '#546E7A' }}><i className="fas fa-draw-polygon"></i></span>
            <span className="spatial-legend-label">District borders</span>
            <span className="spatial-legend-count">30</span>
          </label>

          <p className="text-muted" style={{ fontSize: 11.5, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            Showing {totalVisible} of {totalAll} points. <i className="fas fa-location-dot"></i> markers cluster and show details on click;
            <i className="fas fa-fire" style={{ marginLeft: 4 }}></i> switches a layer to a density heatmap. Basemap (Street / Satellite / Light)
            switches in the top-right of the map — boundaries stay visible on all three. Hover a district for its name.
          </p>
        </div>
      </div>

      <div className="card spatial-map-card" style={{ position: 'relative' }}>
        {points === null && (
          <div className="spatial-loading-overlay"><i className="fas fa-spinner fa-spin"></i> Loading spatial data...</div>
        )}
        <div ref={containerRef} className="spatial-map-container"></div>
      </div>
    </div>
  );
}
