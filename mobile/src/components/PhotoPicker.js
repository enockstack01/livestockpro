import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import Icon from './Icon';
import { Button } from '../ui/kit';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from '../lib/toast';

/* Photos for LivestockPro AI (twin of the web's PhotoPicker): "Take photo"
   opens the camera so the farmer can photograph the affected part of the
   animal, "Upload" picks from the gallery. Each photo is shrunk on the
   phone before it is sent (longest side 1568 px, JPEG) with a small preview
   the saved report keeps. */

export const MAX_PHOTOS = 3;
const FULL_SIDE = 1568;
const THUMB_SIDE = 320;

async function shrink(asset, side, compress) {
  const w = asset.width || side;
  const h = asset.height || side;
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (Math.max(w, h) > side) ctx.resize(w >= h ? { width: side } : { height: side });
  const rendered = await ctx.renderAsync();
  return rendered.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
}

async function prepare(asset) {
  const [full, thumb] = await Promise.all([shrink(asset, FULL_SIDE, 0.85), shrink(asset, THUMB_SIDE, 0.7)]);
  return { media_type: 'image/jpeg', data: full.base64, thumb: `data:image/jpeg;base64,${thumb.base64}`, uri: thumb.uri };
}

/* State for the photos of one request: { photos, add, remove, clear, payload }. */
export function usePhotos() {
  const [photos, setPhotos] = useState([]);
  return {
    photos,
    add: (list) => setPhotos((p) => [...p, ...list].slice(0, MAX_PHOTOS)),
    remove: (i) => setPhotos((p) => p.filter((_, j) => j !== i)),
    clear: () => setPhotos([]),
    payload: () => (photos.length ? { images: photos.map(({ media_type, data }) => ({ media_type, data })), thumbnails: photos.map((p) => p.thumb) } : {})
  };
}

export default function PhotoPicker({ state, disabled, compact }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const full = state.photos.length >= MAX_PHOTOS;

  async function pick(fromCamera) {
    try {
      const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showToast(t('ai.photo.noCamera'), 'error'); return; }
      const opts = { mediaTypes: ['images'], quality: 1, exif: false };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - state.photos.length });
      if (result.canceled || !result.assets || !result.assets.length) return;
      setBusy(true);
      const ready = [];
      for (const a of result.assets.slice(0, MAX_PHOTOS - state.photos.length)) ready.push(await prepare(a));
      state.add(ready);
    } catch {
      showToast(t('ai.photo.unreadable'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.actions, compact && { gap: 6 }]}>
        <Button variant="secondary" size="sm" icon="camera" title={compact ? undefined : t('ai.photo.take')} onPress={() => pick(true)} disabled={disabled || full || busy} loading={busy} />
        <Button variant="secondary" size="sm" icon="image" title={compact ? undefined : t('ai.photo.upload')} onPress={() => pick(false)} disabled={disabled || full || busy} />
      </View>
      {!compact ? <Text style={{ color: colors.textLight, fontSize: 12 }}>{t('ai.photo.hint', { max: MAX_PHOTOS })}</Text> : null}
      {state.photos.length ? (
        <View style={styles.strip}>
          {state.photos.map((p, i) => (
            <View key={i} style={[styles.thumb, compact && styles.thumbSmall, { borderColor: colors.border }]}>
              <Image source={{ uri: p.thumb }} style={StyleSheet.absoluteFill} accessibilityLabel={t('ai.photo.alt', { n: i + 1 })} />
              <Pressable onPress={() => state.remove(i)} disabled={disabled} accessibilityRole="button" accessibilityLabel={t('ai.photo.remove')} hitSlop={6} style={styles.remove}>
                <Icon name="xmark" size={10} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  strip: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  thumb: { width: 96, height: 72, borderRadius: 8, overflow: 'hidden', borderWidth: 1 },
  thumbSmall: { width: 56, height: 44 },
  remove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(28,43,30,0.75)', alignItems: 'center', justifyContent: 'center' }
});
