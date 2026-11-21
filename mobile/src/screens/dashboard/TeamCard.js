import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Button, Card, CardBody, CardHeader } from '../../ui/kit';
import { useChartColors } from '../../ui/charts';
import { MiniColumns } from '../../ui/microViz';
import { relativeDay } from '../../../../shared/dashboardFeed';

/* The farm manager's team on the dashboard (twin of the web's
   components/dashboard/TeamCard.jsx). Online only: it shows nothing when the
   server cannot be reached. */
export default function TeamCard() {
  const { t } = useTranslation();
  const api = useApi();
  const router = useRouter();
  const { colors } = useTheme();
  const cc = useChartColors();
  const [team, setTeam] = useState(null);
  useEffect(() => {
    let live = true;
    api.http('GET', '/team').then(({ data }) => { if (live) setTeam(data || null); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!team) return null;
  const total = team.perDay.reduce((s, d) => s + d.count, 0);
  return (
    <Card>
      <CardHeader title={t('team.cardTitle')} icon="people-group" iconColor={colors.primary}
        right={<Button title={team.members.length ? t('team.manage') : t('team.addCollector')} variant="secondary" size="sm" onPress={() => router.replace('/team')} />} />
      <CardBody>
        {team.members.length === 0 ? (
          <Text style={{ fontSize: 13, color: colors.textLight, textAlign: 'center', paddingVertical: 12 }}>{t('team.cardEmpty')}</Text>
        ) : (
          <>
            <View style={styles.head}>
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.textLight }}>{t('team.entries14')}</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{total}</Text>
            </View>
            <MiniColumns values={team.perDay.map((d) => d.count)} color={cc.brand} height={48} />
            {team.members.slice(0, 4).map((m) => (
              <Pressable key={m.id} onPress={() => router.replace('/team')} style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.text }} numberOfLines={1}>{m.name || m.email}</Text>
                  <Text style={{ fontSize: 11.5, color: colors.textLight }}>{t('team.lastActive', { when: m.last ? relativeDay(m.last, t) : t('team.notYet') })}</Text>
                </View>
                <View style={[styles.count, { backgroundColor: colors.primary }]}><Text style={styles.countText}>{m.week}</Text></View>
              </Pressable>
            ))}
          </>
        )}
      </CardBody>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  count: { minWidth: 28, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, alignItems: 'center' },
  countText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
