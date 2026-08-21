import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/* Caps content width on large screens (tablets, foldables) and centers it,
   so a search bar or card grid doesn't stretch edge-to-edge and look
   sparse/oversized — phones (width < 640) are unaffected since the content
   box already fills their full width. Every record/dashboard/settings
   screen wraps its existing top-level container in this. */
export default function ResponsiveScreen({ children }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.outer, { backgroundColor: colors.bg }]}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' },
  inner: { flex: 1, width: '100%', maxWidth: 640 },
});
