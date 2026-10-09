import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View, useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useTranslation } from 'react-i18next';

/* Loading splash, the same design as CropManager's mobile app: the native
   splash (cow mark on brand green, app.json → expo-splash-screen) hands off
   to this animated copy of itself — same background, same mark in the same
   place, so there's no jump. The mark lifts, the name and tagline fade in, a
   progress bar runs while the app loads, then the whole layer fades away. */

// keep the native splash up until the animated one has drawn its first frame
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Longest the splash waits for the app before stepping aside anyway. */
const MAX_WAIT = 8000;
/** Shortest it stays, so the intro animation can finish instead of flashing. */
const MIN_SHOW = 1100;

const SplashReadyContext = createContext(() => {});

/** Screens call this once they know what to show (sign-in, account request, dashboard). */
export const useSplashReady = () => useContext(SplashReadyContext);

/** Signals the splash once on mount — for screens that are ready as soon as they render. */
export function SplashReadyOnMount() {
  const ready = useSplashReady();
  useEffect(() => ready(), [ready]);
  return null;
}

export function SplashHost({ children }) {
  const { t } = useTranslation();
  const dark = useColorScheme() === 'dark';
  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(false);
  const shownAt = useRef(Date.now());

  const intro = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  const markReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    Animated.timing(intro, { toValue: 1, duration: 700, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ).start();
    const cap = setTimeout(markReady, MAX_WAIT);
    return () => clearTimeout(cap);
  }, [intro, progress, markReady]);

  useEffect(() => {
    if (!ready) return undefined;
    const wait = Math.max(0, MIN_SHOW - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => setGone(true));
    }, wait);
    return () => clearTimeout(timer);
  }, [ready, fade]);

  const markY = intro.interpolate({ inputRange: [0, 1], outputRange: [0, -36] });
  const markScale = intro.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] });
  const textY = intro.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <SplashReadyContext.Provider value={markReady}>
      <View style={{ flex: 1 }}>
        {children}
        {gone ? null : (
          <Animated.View
            pointerEvents={ready ? 'none' : 'auto'}
            onLayout={() => SplashScreen.hideAsync().catch(() => {})}
            style={[StyleSheet.absoluteFill, styles.layer, { opacity: fade, backgroundColor: dark ? '#0F1A10' : '#1B5E20' }]}
          >
            {/* the native splash image at its native size (imageWidth 180) */}
            <Animated.View style={{ transform: [{ translateY: markY }, { scale: markScale }] }}>
              <Image source={dark ? require('../../assets/splash-icon-dark.png') : require('../../assets/splash-icon.png')} style={styles.mark} />
            </Animated.View>
            <Animated.View style={[styles.words, { opacity: intro, transform: [{ translateY: textY }] }]}>
              <Animated.Text style={styles.name}>
                Livestock<Animated.Text style={{ color: '#FFFFFF' }}>Pro</Animated.Text>
              </Animated.Text>
              <Animated.Text style={styles.tagline}>{t('splash.tagline', { defaultValue: 'Livestock farming, managed' })}</Animated.Text>
              <View style={styles.track}>
                <Animated.View style={[styles.bar, { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-48, 120] }) }] }]} />
              </View>
            </Animated.View>
          </Animated.View>
        )}
      </View>
    </SplashReadyContext.Provider>
  );
}

const styles = StyleSheet.create({
  layer: { alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
  mark: { width: 180, height: 180 },
  words: { position: 'absolute', top: '58%', alignItems: 'center' },
  name: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: 0.5 },
  tagline: { color: 'rgba(255,255,255,0.78)', fontSize: 14, marginTop: 6 },
  track: { width: 120, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 28, overflow: 'hidden' },
  bar: { width: 48, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
});
