import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export default function LoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
