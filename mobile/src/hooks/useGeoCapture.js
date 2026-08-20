import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

/* Port of client/src/lib/geolocation.jsx's useGeoCapture: captures GPS only
   when the "Add" form opens, never blocks the save either way. States:
   idle | loading | success | denied | error | unsupported. */
export function useGeoCapture() {
  const [state, setState] = useState({ status: 'idle', latitude: null, longitude: null });

  const capture = useCallback(async () => {
    setState({ status: 'loading', latitude: null, longitude: null });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState({ status: 'denied', latitude: null, longitude: null });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setState({ status: 'success', latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch (err) {
      setState({ status: 'error', latitude: null, longitude: null });
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle', latitude: null, longitude: null }), []);

  return { ...state, capture, reset };
}
