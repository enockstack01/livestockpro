import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRepository } from '../db/repository';
import { useSync } from '../sync/SyncProvider';
import { useGeoCapture } from '../hooks/useGeoCapture';
import { useToast } from '../lib/toast';
import { useConfirm } from '../lib/confirm';
import RNModal from '../components/Modal';
import RecordForm, { emptyValues } from '../components/RecordForm';
import SelectField from '../components/SelectField';
import { StatusBadge, PriorityBadge, PregnancyBadge } from '../components/Badges';

const BADGE_COMPONENTS = { status: StatusBadge, pregnancy: PregnancyBadge };

const GEO_MESSAGES = {
  loading: 'Capturing device location...',
  denied: 'Location permission denied — this record will save without coordinates.',
  error: "Couldn't get device location — this record will save without coordinates.",
  unsupported: 'This device does not support location capture.',
};

/* Config-driven CRUD screen shared by all 7 record-type routes (see
   mobile/src/config/tables.js and app/(app)/{animals,health,...}/index.js).
   Local-first: reads/writes go through src/db/repository.js (instant,
   optimistic), sync happens in the background via src/sync/SyncProvider.js. */
export default function RecordListScreen({ config }) {
  const repo = useRepository();
  const { lastSyncedAt, syncing, triggerSync } = useSync();
  const showToast = useToast();
  const confirm = useConfirm();
  const geo = useGeoCapture();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState({});
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
  const [editingId, setEditingId] = useState(null);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const rows = await repo.list(config.table, { order: 'created_at DESC' });
    setRecords(rows);
    setLoading(false);
  }, [repo, config.table]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (lastSyncedAt) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncedAt]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await triggerSync();
    await load();
    setRefreshing(false);
  }, [triggerSync, load]);

  const filtered = useMemo(() => {
    let rows = records;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => config.searchFields.some((f) => String(r[f] || '').toLowerCase().includes(q)));
    Object.entries(activeFilter).forEach(([key, val]) => {
      if (val) rows = rows.filter((r) => r[key] === val);
    });
    return rows;
  }, [records, search, activeFilter, config.searchFields]);

  function openAdd() {
    setModalMode('add');
    setEditingId(null);
    setValues(emptyValues(config.fields));
    geo.reset();
    geo.capture();
  }

  function openEdit(record) {
    setModalMode('edit');
    setEditingId(record.id);
    const v = {};
    config.fields.forEach((f) => { v[f.key] = record[f.key] ?? ''; });
    setValues(v);
  }

  function closeModal() {
    setModalMode(null);
    setEditingId(null);
  }

  async function handleSave() {
    const missing = config.fields.find((f) => f.required && !String(values[f.key] || '').trim());
    if (missing) {
      showToast(`${missing.label} is required.`, 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...values };
      config.fields.forEach((f) => {
        if (f.type === 'number') payload[f.key] = payload[f.key] === '' || payload[f.key] === null ? null : Number(payload[f.key]);
      });

      if (modalMode === 'add') {
        if (geo.status === 'success') {
          payload.latitude = geo.latitude;
          payload.longitude = geo.longitude;
        }
        await repo.insert(config.table, payload);
        showToast(`${config.singular} added.`, 'success');
      } else {
        await repo.update(config.table, editingId, payload);
        showToast(`${config.singular} updated.`, 'success');
      }
      closeModal();
      await load();
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record) {
    const ok = await confirm({
      title: `Delete this ${config.singular.toLowerCase()}?`,
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await repo.remove(config.table, record.id);
    showToast(`${config.singular} deleted.`, 'success');
    await load();
  }

  const BadgeComp = config.badgeField ? BADGE_COMPONENTS[config.badgeField.kind] : null;

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#90A4AE" />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${config.label.toLowerCase()}...`}
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#90A4AE"
        />
      </View>

      {config.filters.map((f) => (
        <View key={f.key} style={styles.filterWrap}>
          <SelectField
            value={activeFilter[f.key] || ''}
            options={[{ value: '', label: `All ${f.label}` }, ...f.options]}
            onChange={(v) => setActiveFilter((prev) => ({ ...prev, [f.key]: v }))}
          />
        </View>
      ))}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#2E7D32" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing || syncing} onRefresh={onRefresh} colors={['#2E7D32']} />}
          ListEmptyComponent={<Text style={styles.empty}>No {config.label.toLowerCase()} yet. Tap + to add one.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => openEdit(item)}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item[config.titleField] || 'Untitled'}</Text>
                  {item.sync_state === 'pending' && <View style={styles.pendingDot} />}
                </View>
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {config.subtitleFields.map((f) => item[f]).filter(Boolean).join(' · ') || '—'}
                </Text>
                {config.priorityField ? <PriorityBadge priority={item[config.priorityField]} /> : null}
              </View>
              <View style={styles.cardActions}>
                {BadgeComp ? <BadgeComp status={item[config.badgeField.key]} /> : null}
                <Pressable hitSlop={10} onPress={() => handleDelete(item)}>
                  <Ionicons name="trash-outline" size={18} color="#B0BEC5" />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}

      <Pressable style={styles.fab} onPress={openAdd}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <RNModal
        open={modalMode !== null}
        onClose={closeModal}
        title={modalMode === 'add' ? `Add ${config.singular}` : `Edit ${config.singular}`}
        footer={
          <>
            <Pressable style={[styles.btn, styles.btnSecondary]} onPress={closeModal}>
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Save</Text>}
            </Pressable>
          </>
        }
      >
        <RecordForm fields={config.fields} values={values} onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))} />
        {modalMode === 'add' && geo.status !== 'idle' ? (
          <Pressable onPress={geo.status !== 'loading' ? geo.capture : undefined} style={styles.geoLine}>
            {geo.status === 'loading' ? <ActivityIndicator size="small" color="#2E7D32" /> : <Ionicons name="location" size={16} color={geo.status === 'success' ? '#2E7D32' : '#E65100'} />}
            <Text style={styles.geoText}>
              {geo.status === 'success' ? `Location captured (${geo.latitude.toFixed(3)}, ${geo.longitude.toFixed(3)})` : GEO_MESSAGES[geo.status]}
              {geo.status !== 'loading' && geo.status !== 'success' ? ' Tap to retry.' : ''}
            </Text>
          </Pressable>
        ) : null}
      </RNModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F5' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', margin: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#ECEFF1' },
  searchInput: { flex: 1, fontSize: 15, color: '#263238' },
  filterWrap: { paddingHorizontal: 16, marginBottom: 4 },
  listContent: { padding: 16, paddingTop: 8, paddingBottom: 100, gap: 10 },
  empty: { textAlign: 'center', color: '#90A4AE', marginTop: 40, fontSize: 14 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: '#ECEFF1' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1B5E20', flexShrink: 1 },
  cardSubtitle: { fontSize: 13, color: '#607D8B' },
  pendingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E65100' },
  cardActions: { alignItems: 'flex-end', gap: 10, justifyContent: 'space-between' },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#2E7D32', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#2E7D32' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnSecondary: { backgroundColor: '#ECEFF1' },
  btnSecondaryText: { color: '#37474F', fontWeight: '700' },
  geoLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingVertical: 8 },
  geoText: { flex: 1, fontSize: 12, color: '#607D8B' },
});
