import L from 'leaflet';

/* Esri's public ArcGIS Online basemap tile services — free to use with
   attribution, no API key. All served from server.arcgisonline.com, which
   the server's CSP img-src already allows. */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const esri = (service, attribution, maxZoom = 19) =>
  L.tileLayer(`${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}`, { attribution: `Tiles &copy; Esri &mdash; ${attribution}`, maxZoom });

/* Adds the basemap switcher to `map` and shows a default that suits the
   current light/dark theme. */
export function addBasemaps(map) {
  const imageryLabels = esri('Reference/World_Boundaries_and_Places', 'Esri, HERE, Garmin', 19);
  const basemaps = {
    'Esri Streets': esri('World_Street_Map', 'Sources: Esri, HERE, Garmin, USGS, Intermap, NGA, and the GIS User Community'),
    'Esri Topographic': esri('World_Topo_Map', 'Sources: Esri, HERE, Garmin, FAO, NOAA, USGS, and the GIS User Community'),
    'Esri Imagery': esri('World_Imagery', 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'),
    'Esri Imagery + Labels': L.layerGroup([esri('World_Imagery', 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'), imageryLabels]),
    'Esri Light Gray': esri('Canvas/World_Light_Gray_Base', 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors', 16),
    'Esri Dark Gray': esri('Canvas/World_Dark_Gray_Base', 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors', 16)
  };

  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  basemaps[dark ? 'Esri Dark Gray' : 'Esri Streets'].addTo(map);
  L.control.layers(basemaps, {}, { position: 'topright', collapsed: false }).addTo(map);
}
