import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRepository } from '../../src/db/repository';
import { useToast } from '../../src/lib/toast';
import { isThisMonth } from '../../src/lib/shared';

/* Read-only aggregate report — mobile equivalent of client/src/pages/Reports.jsx.
   "Export CSV" replaces the web version's Print/download with the native
   share sheet (expo-sharing), since there's no browser download or printer
   API on-device. */
export default function ReportsScreen() {
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
        showToast('Sharing is not available on this device.', 'error');
      }
    } catch (err) {
      showToast(`Export failed: ${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  }

  if (!data || !totals) {
    return <ActivityIndicator style={{ marginTop: 40 }} color="#2E7D32" />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Pressable style={styles.exportBtn} onPress={handleExport} disabled={exporting}>
        {exporting ? <ActivityIndicator color="#fff" /> : <Ionicons name="share-outline" size={18} color="#fff" />}
        <Text style={styles.exportText}>Export CSV</Text>
      </Pressable>

      <Section title="Animals">
        <Row label="Total" value={totals.animals.total} />
        <Row label="Healthy" value={totals.animals.healthy} />
        <Row label="Under Treatment" value={totals.animals.underTreatment} />
        <Row label="Critical" value={totals.animals.critical} />
        <Row label="Deceased" value={totals.animals.deceased} />
      </Section>

      <Section title="Breeding">
        <Row label="Pregnant" value={totals.breeding.pregnant} />
        <Row label="Delivered" value={totals.breeding.delivered} />
        <Row label="Newborns (all time)" value={totals.breeding.newborns} />
      </Section>

      <Section title="Production (this month)">
        <Row label="Milk (liters)" value={totals.production.milk} />
        <Row label="Eggs (units)" value={totals.production.eggs} />
        <Row label="Meat (kg)" value={totals.production.meat} />
      </Section>

      <Section title="Finance (this month)">
        <Row label="Income" value={`$${totals.finance.income.toFixed(2)}`} />
        <Row label="Expense" value={`$${totals.finance.expense.toFixed(2)}`} />
        <Row label="Net" value={`$${(totals.finance.income - totals.finance.expense).toFixed(2)}`} highlight={totals.finance.income - totals.finance.expense >= 0 ? 'green' : 'red'} />
      </Section>

      <Section title="Health">
        <Row label="Records" value={totals.health.total} />
        <Row label="Active alerts" value={totals.health.active} />
      </Section>
    </ScrollView>
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

function Section({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, highlight }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight === 'green' && { color: '#2E7D32' }, highlight === 'red' && { color: '#D32F2F' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F5' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2E7D32', paddingVertical: 13, borderRadius: 10 },
  exportText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#ECEFF1', gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1B5E20', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F5F7F5' },
  rowLabel: { color: '#607D8B', fontSize: 13 },
  rowValue: { color: '#263238', fontWeight: '700', fontSize: 13 },
});
