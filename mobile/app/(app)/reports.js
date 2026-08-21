import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { useRepository } from '../../src/db/repository';
import { useToast } from '../../src/lib/toast';
import { isThisMonth } from '../../src/lib/shared';
import Icon from '../../src/components/Icon';
import ResponsiveScreen from '../../src/components/ResponsiveScreen';
import { useTheme } from '../../src/theme/ThemeProvider';

/* Read-only aggregate report — mobile equivalent of client/src/pages/Reports.jsx.
   "Export CSV" replaces the web version's Print/download with the native
   share sheet (expo-sharing), since there's no browser download or printer
   API on-device. */
export default function ReportsScreen() {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius, shadow), [colors, radius, shadow]);
  const repo = useRepository();
  const showToast = useToast();
  const [data, setData] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const [animals, health, breeding, production, finance] = await Promise.all([
      repo.list('animals'),
      repo.list('health_records'),
      repo.list('breeding_records'),
      repo.list('production_records'),
      repo.list('finance_records'),
    ]);
    setData({ animals, health, breeding, production, finance });
  }, [repo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totals = useMemo(() => computeTotals(data), [data]);

  async function handleExport() {
    if (!data) return;
    setExporting(true);
    try {
      const csv = buildCsv(data);
      const path = FileSystem.cacheDirectory + `livestockpro_report_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export LivestockPro report' });
      } else {
        showToast(t('reports.sharingUnavailable'), 'error');
      }
    } catch (err) {
      showToast(t('reports.exportFailed', { message: err.message }), 'error');
    } finally {
      setExporting(false);
    }
  }

  if (!data || !totals) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  }

  return (
    <ResponsiveScreen>
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Pressable style={styles.exportBtn} onPress={handleExport} disabled={exporting}>
        {exporting ? <ActivityIndicator color={colors.white} /> : <Icon name="file-export" size={16} color={colors.white} />}
        <Text style={styles.exportText}>{t('reports.exportCsv')}</Text>
      </Pressable>

      <Section styles={styles} title={t('reports.sectionAnimals')}>
        <Row styles={styles} colors={colors} label={t('reports.total')} value={totals.animals.total} />
        <Row styles={styles} colors={colors} label={t('reports.healthy')} value={totals.animals.healthy} />
        <Row styles={styles} colors={colors} label={t('reports.underTreatment')} value={totals.animals.underTreatment} />
        <Row styles={styles} colors={colors} label={t('reports.criticalStatus')} value={totals.animals.critical} />
        <Row styles={styles} colors={colors} label={t('reports.deceased')} value={totals.animals.deceased} />
      </Section>

      <Section styles={styles} title={t('reports.sectionBreeding')}>
        <Row styles={styles} colors={colors} label={t('dashboard.pregnant')} value={totals.breeding.pregnant} />
        <Row styles={styles} colors={colors} label={t('reports.delivered')} value={totals.breeding.delivered} />
        <Row styles={styles} colors={colors} label={t('reports.newbornsAllTime')} value={totals.breeding.newborns} />
      </Section>

      <Section styles={styles} title={t('reports.sectionProduction')}>
        <Row styles={styles} colors={colors} label={t('reports.milkLiters')} value={totals.production.milk} />
        <Row styles={styles} colors={colors} label={t('reports.eggsUnits')} value={totals.production.eggs} />
        <Row styles={styles} colors={colors} label={t('reports.meatKg')} value={totals.production.meat} />
      </Section>

      <Section styles={styles} title={t('reports.sectionFinance')}>
        <Row styles={styles} colors={colors} label={t('reports.income')} value={`$${totals.finance.income.toFixed(2)}`} />
        <Row styles={styles} colors={colors} label={t('reports.expense')} value={`$${totals.finance.expense.toFixed(2)}`} />
        <Row styles={styles} colors={colors} label={t('reports.net')} value={`$${(totals.finance.income - totals.finance.expense).toFixed(2)}`} highlight={totals.finance.income - totals.finance.expense >= 0 ? 'green' : 'red'} />
      </Section>

      <Section styles={styles} title={t('reports.sectionHealth')}>
        <Row styles={styles} colors={colors} label={t('reports.records')} value={totals.health.total} />
        <Row styles={styles} colors={colors} label={t('reports.activeAlerts')} value={totals.health.active} />
      </Section>
    </ScrollView>
    </ResponsiveScreen>
  );
}

function computeTotals(data) {
  if (!data) return null;
  const { animals, health, breeding, production, finance } = data;

  const monthlyProduction = production.filter((p) => isThisMonth(p.production_date));
  const sumBy = (rows, type, field) => rows.filter((r) => r.production_type === type).reduce((s, r) => s + (Number(r[field]) || 0), 0);

  return {
    animals: {
      total: animals.length,
      healthy: animals.filter((a) => a.health_status === 'Healthy').length,
      underTreatment: animals.filter((a) => a.health_status === 'Under Treatment').length,
      critical: animals.filter((a) => a.health_status === 'Critical').length,
      deceased: animals.filter((a) => a.health_status === 'Deceased').length,
    },
    breeding: {
      pregnant: breeding.filter((b) => b.pregnancy_status === 'Pregnant').length,
      delivered: breeding.filter((b) => b.pregnancy_status === 'Delivered').length,
      newborns: breeding.reduce((s, b) => s + (Number(b.newborn_count) || 0), 0),
    },
    production: {
      milk: sumBy(monthlyProduction, 'Milk', 'quantity'),
      eggs: sumBy(monthlyProduction, 'Eggs', 'quantity'),
      meat: sumBy(monthlyProduction, 'Meat', 'quantity'),
    },
    finance: {
      income: finance.filter((f) => f.type === 'Income' && isThisMonth(f.date)).reduce((s, f) => s + (Number(f.amount) || 0), 0),
      expense: finance.filter((f) => f.type === 'Expense' && isThisMonth(f.date)).reduce((s, f) => s + (Number(f.amount) || 0), 0),
    },
    health: {
      total: health.length,
      active: health.filter((h) => h.status === 'Under Treatment' || h.status === 'Critical').length,
    },
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return '""';
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function buildCsv(data) {
  const sections = [];
  for (const [name, rows] of Object.entries(data)) {
    if (!rows.length) continue;
    const headers = Object.keys(rows[0]).filter((k) => !['sync_state'].includes(k));
    sections.push(`# ${name}`);
    sections.push(headers.join(','));
    rows.forEach((r) => sections.push(headers.map((h) => csvCell(r[h])).join(',')));
    sections.push('');
  }
  return sections.join('\n');
}

function Section({ styles, title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ styles, colors, label, value, highlight }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight === 'green' && { color: colors.primary }, highlight === 'red' && { color: colors.red }]}>{value}</Text>
    </View>
  );
}

function makeStyles(colors, radius, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 13, borderRadius: radius.button },
    exportText: { color: colors.white, fontWeight: '700' },
    card: {
      backgroundColor: colors.card, borderRadius: radius.card, padding: 16, gap: 4,
      shadowColor: shadow.color, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: shadow.offset, elevation: shadow.elevation,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.primaryDark, marginBottom: 6 },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.bg },
    rowLabel: { color: colors.textLight, fontSize: 13 },
    rowValue: { color: colors.text, fontWeight: '700', fontSize: 13 },
  });
}
