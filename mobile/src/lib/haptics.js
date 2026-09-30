import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/* Small, never-throwing wrappers around expo-haptics so taps can give
   tactile feedback without each call site handling unsupported devices
   (the web target and some Android phones have no haptic engine). */
const safe = (fn) => () => {
  if (Platform.OS === 'web') return;
  fn().catch(() => {});
};

export const haptics = {
  /** light tap — buttons, list rows */
  tap: safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** selection tick — navigation, tabs, toggles, pickers */
  select: safe(() => Haptics.selectionAsync()),
  success: safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
