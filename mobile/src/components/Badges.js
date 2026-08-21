import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { statusTone, priorityTone, pregnancyTone } from '../lib/shared';
import { useTheme } from '../theme/ThemeProvider';

function Badge({ label, tone }) {
  if (!label) return null;
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function StatusBadge({ status }) {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  if (!status) return null;
  return <Badge label={t(`enums.statusBadge.${status}`, status)} tone={statusTone(status, scheme === 'dark')} />;
}

export function PriorityBadge({ priority }) {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const value = priority || 'Medium';
  return <Badge label={t(`enums.taskPriority.${value}`, value)} tone={priorityTone(value, scheme === 'dark')} />;
}

export function PregnancyBadge({ status }) {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  if (!status) return null;
  return <Badge label={t(`enums.pregnancyStatus.${status}`, status)} tone={pregnancyTone(status, scheme === 'dark')} />;
}

const styles = StyleSheet.create({
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '600' },
});
