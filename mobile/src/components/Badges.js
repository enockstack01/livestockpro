import { StyleSheet, Text, View } from 'react-native';
import { statusTone, priorityTone, pregnancyTone } from '../lib/shared';

function Badge({ label, tone }) {
  if (!label) return null;
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function StatusBadge({ status }) {
  return <Badge label={status} tone={statusTone(status)} />;
}

export function PriorityBadge({ priority }) {
  return <Badge label={priority || 'Medium'} tone={priorityTone(priority)} />;
}

export function PregnancyBadge({ status }) {
  return <Badge label={status} tone={pregnancyTone(status)} />;
}

const styles = StyleSheet.create({
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '600' },
});
