import { useCallback, useState } from 'react';

/* Captures the device's GPS coordinates on demand (call .capture() when a
   page opens its "add new record" modal). Never blocks saving — every
   caller treats a failed/denied capture as "save without coordinates". */
export function useGeoCapture() {
  const [status, setStatus] = useState('idle'); // idle | loading | success | denied | error | unsupported
  const [coords, setCoords] = useState(null);

  const capture = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      setCoords(null);
      return;
    }
    setStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setStatus('success');
      },
      (err) => {
        setCoords(null);
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const reset = useCallback(() => { setStatus('idle'); setCoords(null); }, []);

  return { status, coords, capture, reset };
}

const MESSAGES = {
  loading: { icon: 'fa-spinner fa-spin', cls: 'loading', text: 'Capturing device location...' },
  denied: { icon: 'fa-triangle-exclamation', cls: 'warn', text: "Location permission denied — this record will save without coordinates." },
  error: { icon: 'fa-triangle-exclamation', cls: 'warn', text: "Couldn't get device location — this record will save without coordinates." },
  unsupported: { icon: 'fa-triangle-exclamation', cls: 'warn', text: 'This device/browser does not support location capture.' }
};

/* Small status line for inside an "add record" modal, showing capture
   progress and the captured coordinates once available. */
export function LocationCaptureBadge({ geo }) {
  if (geo.status === 'idle') return null;

  if (geo.status === 'success') {
    return (
      <p className="location-badge success">
        <i className="fas fa-location-dot"></i> Location captured ({geo.coords.latitude.toFixed(4)}, {geo.coords.longitude.toFixed(4)})
        <a href="#" onClick={(e) => { e.preventDefault(); geo.capture(); }}>Recapture</a>
      </p>
    );
  }

  const m = MESSAGES[geo.status];
  if (!m) return null;
  return (
    <p className={`location-badge ${m.cls}`}>
      <i className={`fas ${m.icon}`}></i> {m.text}
      {m.cls === 'warn' && <a href="#" onClick={(e) => { e.preventDefault(); geo.capture(); }}>Try again</a>}
    </p>
  );
}
